import { Signer, TransactionBuilder, type Utxo } from "@solidcash/solidcash";
import { externallySignedUnlocker } from "@solidcash/solidcash/walletconnect";
import { binToHex, sha256, hexToBin } from "@bitauth/libauth";
import {
  attachPusakaV2Plan,
  buildGenesisV2PlanTx,
  buildSendTx,
  buildCheckInTx,
  buildCancelClaimTx,
  buildUpdatePolicyTx,
  buildOwnerExitTx,
  buildSweepInboxTx,
  buildContactApproveTx,
  buildOpenClaimByInactivityTx,
  buildFinalizeClaimTx,
  buildDistributeLateTx,
  discoverPusakaV2State,
  finalizeBuilderTxHex,
  encodePusakaV2PlanLink,
  decodePusakaV2PlanLink,
  type PusakaV2PlanMetadata,
  type PusakaV2PolicyInput,
  type PusakaV2PlanHandle,
} from "../protocol/pusaka-v2";
import { getWizardWallet } from "./chainPlanService";
import {
  getProvider,
  medianTimePast,
  pkhOfAddress,
  lockOfAddress,
} from "./network";
import type { NetworkName } from "../types";
import {
  tokenVault,
  quoteBuy,
  buildSwapTx,
  buildTokenPayoutTx,
  buildTokenSendTx,
  type Quote,
} from "../protocol/assets";
import testPair from "../protocol/test-pair.json";

export * from "../protocol/pusaka-v2";
export const NETWORK: NetworkName =
  import.meta.env.VITE_NETWORK === "mainnet" ? "mainnet" : "chipnet";
const PLANS_KEY = `pusaka.v2.plans.${NETWORK}`;
const HISTORY_KEY = `pusaka.v2.activity.${NETWORK}`;
export type Activity = {
  txid: string;
  title: string;
  at: number;
  plan: string;
  status: "accepted";
};
export function savedPlans(): PusakaV2PlanMetadata[] {
  try {
    return JSON.parse(localStorage.getItem(PLANS_KEY) || "[]");
  } catch {
    return [];
  }
}
export function savePlan(plan: PusakaV2PlanMetadata) {
  const plans = savedPlans().filter(
    (p) => p.planCategoryHex !== plan.planCategoryHex,
  );
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify([plan, ...plans]));
    return true;
  } catch {
    return false;
  }
}
export function history(): Activity[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
export function planLink(plan: PusakaV2PlanMetadata) {
  return encodePusakaV2PlanLink(
    plan,
    `${location.origin}${import.meta.env.BASE_URL}v2/plan`,
  );
}
export function importPlan(text: string): PusakaV2PlanMetadata {
  const parsed = text.trim().startsWith("{")
    ? JSON.parse(text)
    : decodePusakaV2PlanLink(text.trim());
  if (parsed.network !== NETWORK)
    throw new Error(
      `This plan uses ${parsed.network}. Open the matching network build.`,
    );
  return parsed;
}
export const attach = (plan: PusakaV2PlanMetadata) =>
  attachPusakaV2Plan(plan, getProvider(NETWORK));
export async function loadPlan(plan: PusakaV2PlanMetadata) {
  const handle = await attach(plan);
  const [state, now] = await Promise.all([
    discoverPusakaV2State(handle),
    medianTimePast(NETWORK),
  ]);
  let review:
    | { confirmed: boolean; age: number; required: number; ready: boolean }
    | undefined;
  if (state.anchorUtxo) {
    const p = getProvider(NETWORK);
    const hash = binToHex(
      sha256.hash(handle.contracts.anchorLockingBytecode).reverse(),
    );
    const coins = (await p.performRequest(
      "blockchain.scripthash.listunspent",
      hash,
      "include_tokens",
    )) as Array<{ tx_hash: string; tx_pos: number; height: number }>;
    const coin = coins.find(
      (c) =>
        c.tx_hash === state.anchorUtxo!.txid &&
        c.tx_pos === state.anchorUtxo!.vout,
    );
    let age = 0;
    if (coin && coin.height > 0) {
      const headers = await Promise.all(
        Array.from({ length: 11 }, (_, i) =>
          p.performRequest("blockchain.block.header", coin.height - 1 - i),
        ),
      );
      const times = headers
        .map((h) =>
          new DataView(hexToBin(String(h)).buffer).getUint32(68, true),
        )
        .sort((a, b) => a - b);
      age = Math.max(0, Number(now) - times[5]);
    }
    review = {
      confirmed: Boolean(coin && coin.height > 0),
      age,
      required: handle.policy.effectiveReviewSeconds,
      ready: Boolean(
        coin && coin.height > 0 && age >= handle.policy.effectiveReviewSeconds,
      ),
    };
  }
  const tokenReceipts =
    handle.metadata.protocolRevision === "assets-1"
      ? (
          await getProvider(NETWORK).getUtxos(tokenVault(handle).address)
        ).filter(
          (u) =>
            u.token &&
            !u.token.nft &&
            u.token.category !== metadataCategory(plan),
        )
      : [];
  return { handle, state, now: Number(now), review, tokenReceipts };
}
function metadataCategory(plan: PusakaV2PlanMetadata) {
  return plan.planCategoryHex;
}
export type LoadedPlan = Awaited<ReturnType<typeof loadPlan>>;
export interface Prepared {
  title: string;
  builder: TransactionBuilder;
  fee: bigint;
  rows: Array<[string, string]>;
  metadata?: PusakaV2PlanMetadata;
  planCategory?: string;
  before?: { txid: string; vout: number };
  handle?: PusakaV2PlanHandle;
  validUntil?: number;
}
export function bch(sats: bigint) {
  return `${(Number(sats) / 1e8).toFixed(8)} BCH`;
}
export function parseBch(text: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(text))
    throw new Error("Enter BCH with up to eight decimal places.");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}
function signing(prompt: string) {
  const w = getWizardWallet();
  if (w.network !== NETWORK)
    throw new Error("Connect a wallet on this network.");
  const signer = Signer.external(
    {
      wallet: w.signer(prompt),
      address: w.ownerAddress(),
      publicKey: w.ownerPublicKey(),
      userPrompt: prompt,
    },
    getProvider(NETWORK),
  );
  return { w, unlocker: signer.unlockP2PKH() };
}
async function ownerCoins(address: string): Promise<Utxo[]> {
  return (await getProvider(NETWORK).getUtxos(address))
    .filter((u) => !u.token)
    .sort((a, b) => (a.satoshis > b.satoshis ? -1 : 1));
}
export async function prepareGather(): Promise<Prepared> {
  const { w } = signing("Pusaka: prepare the first receive address");
  const p = getProvider(NETWORK);
  const addresses = w.derivedAddresses();
  const sets = await Promise.all(addresses.map((d) => p.getUtxos(d.address)));
  const builder = new TransactionBuilder({ provider: p });
  let total = 0n,
    count = 0;
  sets.forEach((coins, i) =>
    coins
      .filter((u) => !u.token)
      .forEach((u) => {
        builder.addInput(
          u,
          externallySignedUnlocker({
            lockingBytecode: lockOfAddress(addresses[i].address),
            signer: w.signer("Pusaka: prepare your first receive address"),
          }),
        );
        total += u.satoshis;
        count++;
      }),
  );
  if (!count) throw new Error("No ordinary BCH found in the connected wallet.");
  const fee = 100n + BigInt(count) * 150n;
  if (total - fee < 1000n)
    throw new Error("Not enough BCH to prepare the wallet.");
  builder.addOutput({ to: w.ownerAddress(), amount: total - fee });
  return {
    title: "Prepare wallet",
    builder,
    fee,
    rows: [
      ["To your first Paytaca receive address", bch(total - fee)],
      ["Network fee", bch(fee)],
      ["Next step", "Create your Pusaka wallet in a separate approval"],
    ],
  };
}
export async function prepareCreate(
  policy: PusakaV2PolicyInput,
  initialDepositSats: bigint,
): Promise<Prepared> {
  const { w, unlocker } = signing("Pusaka: create your protected wallet");
  const coins = await ownerCoins(w.ownerAddress());
  const coin = coins.find(
    (u) => u.vout === 0 && u.satoshis >= initialDepositSats + 2500n,
  );
  if (!coin)
    throw new Error(
      "Prepare wallet first. Setup needs a funded output at your first receive address, with at least 2,500 sats left for fees and a reusable authorization coin.",
    );
  const result = buildGenesisV2PlanTx({
    protocolRevision: "assets-1",
    provider: getProvider(NETWORK),
    genesisUtxo: coin,
    ownerUnlocker: unlocker,
    ownerAddress: w.ownerAddress(),
    ownerPkh: pkhOfAddress(w.ownerAddress()),
    policy,
    createdAtLocktime: Number(await medianTimePast(NETWORK)) - 1,
    initialDepositSats,
  });
  if (coin.satoshis - initialDepositSats - result.fee < 600n)
    throw new Error("Leave at least 600 sats in Paytaca for authorization.");
  return {
    ...result,
    title: "Create Pusaka wallet",
    rows: [
      ["Protected balance", bch(initialDepositSats - 1000n)],
      ["Identity carrier (kept in Pusaka)", bch(1000n)],
      ["Network fee", bch(result.fee)],
      [
        "Returns to Paytaca (counted once)",
        bch(coin.satoshis - initialDepositSats - result.fee),
      ],
    ],
    planCategory: result.metadata.planCategoryHex,
  };
}
export type Action =
  | "send"
  | "checkIn"
  | "cancel"
  | "exit"
  | "sweep"
  | "approve"
  | "open"
  | "finalize"
  | "late"
  | "policy";
export async function prepareAction(
  metadata: PusakaV2PlanMetadata,
  action: Action,
  options: {
    address?: string;
    amount?: bigint;
    policy?: PusakaV2PolicyInput;
  } = {},
): Promise<Prepared> {
  const loaded = await loadPlan(metadata);
  const { handle, state, now } = loaded;
  if (!state.planUtxo)
    throw new Error("The plan state was not found on this network.");
  const titles: Record<Action, string> = {
    send: "Send BCH",
    checkIn: "I’m still here",
    cancel: "Stop claim",
    exit: "Take funds back",
    sweep: "Collect incoming BCH",
    approve: "Confirm as trusted contact",
    open: "Open inactivity claim",
    finalize: "Pay the heirs",
    late: "Pay late receipts",
    policy: "Update inheritance rules",
  };
  const title = titles[action];
  let result;
  if (action === "sweep") {
    result = buildSweepInboxTx({
      handle,
      planUtxo: state.planUtxo,
      inboxUtxos: state.inboxUtxos.slice(0, 20),
      mode: "self",
    });
  } else if (action === "open") {
    if (now <= state.deadline)
      throw new Error(
        "The network clock has not passed the inactivity deadline.",
      );
    result = buildOpenClaimByInactivityTx({
      handle,
      planUtxo: state.planUtxo,
      locktime: now - 1,
    });
  } else if (action === "finalize") {
    if (!state.anchorUtxo || !loaded.review?.ready)
      throw new Error(
        "Wait for the confirmed claim anchor to complete its network review period.",
      );
    result = buildFinalizeClaimTx({
      handle,
      planUtxo: state.planUtxo,
      anchorUtxo: state.anchorUtxo,
    });
  } else if (action === "late") {
    result = buildDistributeLateTx({ handle, planUtxo: state.planUtxo });
  } else {
    const { w, unlocker } = signing(`Pusaka: ${title}`);
    const coins = await ownerCoins(w.ownerAddress());
    if (action === "approve") {
      const coin = coins.find((c) => c.satoshis > 7000n);
      if (!coin)
        throw new Error(
          "The trusted contact needs a funded coin at their first receive address (at least 7,000 sats).",
        );
      result = buildContactApproveTx({
        handle,
        planUtxo: state.planUtxo,
        contactIndexOrAddress: w.ownerAddress(),
        contactUtxo: coin,
        contactUnlocker: unlocker,
        contactChangeAddress: w.ownerAddress(),
      });
    } else {
      if (binToHex(pkhOfAddress(w.ownerAddress())) !== metadata.ownerPkhHex)
        throw new Error("Connect the owner wallet for this action.");
      const coin = [...coins].reverse().find((c) => c.satoshis >= 600n);
      if (!coin)
        throw new Error(
          "Keep an ordinary authorization coin of at least 600 sats at your first Paytaca receive address.",
        );
      const common = {
        handle,
        planUtxo: state.planUtxo,
        anchorUtxo: state.anchorUtxo,
        ownerUtxo: coin,
        ownerUnlocker: unlocker,
        ownerChangeAddress: w.ownerAddress(),
        locktime: now - 1,
        feeFunding: "auto" as const,
      };
      switch (action) {
        case "send":
          if (!options.address || options.amount === undefined)
            throw new Error("Enter a recipient and amount.");
          if (
            !options.address.startsWith(
              NETWORK === "mainnet" ? "bitcoincash:" : "bchtest:",
            )
          )
            throw new Error("Use an address on this network.");
          result = buildSendTx({
            ...common,
            recipientAddressOrLock: options.address,
            amount: options.amount,
          });
          break;
        case "checkIn":
          result = buildCheckInTx(common);
          break;
        case "cancel":
          if (!state.anchorUtxo)
            throw new Error("There is no pending claim to stop.");
          result = buildCancelClaimTx({
            ...common,
            anchorUtxo: state.anchorUtxo,
          });
          break;
        case "exit":
          result = buildOwnerExitTx({
            ...common,
            ownerAddress: w.ownerAddress(),
          });
          break;
        case "policy":
          if (!options.policy) throw new Error("Enter the updated rules.");
          result = buildUpdatePolicyTx({
            ...common,
            newPolicy: options.policy,
          });
          break;
        default:
          throw new Error("Unsupported action");
      }
    }
  }
  const rows: Array<[string, string]> = [["Network fee", bch(result.fee)]];
  if (action === "send")
    rows.unshift(
      ["To recipient", `${options.address}`],
      ["Payment", bch(options.amount!)],
    );
  if ("protectedFeeSats" in result)
    rows.push(["Fee from Pusaka", bch(result.protectedFeeSats as bigint)]);
  if ("ownerChangeSats" in result)
    rows.push(["Returns to Paytaca", bch(result.ownerChangeSats as bigint)]);
  if ("planSatsAfter" in result)
    rows.push([
      "Protected change (includes 1,000-sat identity)",
      bch(result.planSatsAfter as bigint),
    ]);
  if ("heirPayouts" in result)
    for (const payout of result.heirPayouts)
      rows.push([payout.address, bch(payout.amount)]);
  if ("nextDeadline" in result)
    rows.push([
      "Next inactivity deadline",
      new Date(Number(result.nextDeadline) * 1000).toLocaleString(),
    ]);
  if ("cancelledReview" in result && result.cancelledReview)
    rows.push(["Pending claim", "Cancelled in this same transaction"]);
  return {
    title,
    builder: result.builder,
    fee: result.fee,
    rows,
    metadata:
      "nextMetadata" in result
        ? (result.nextMetadata as PusakaV2PlanMetadata)
        : undefined,
    planCategory: metadata.planCategoryHex,
    before: state.planUtxo,
    handle,
  };
}
export async function submit(prepared: Prepared): Promise<string> {
  if (prepared.validUntil && Date.now() > prepared.validUntil)
    throw new Error("Quote expired. Close this review and get a fresh quote.");
  if (prepared.before && prepared.handle) {
    const fresh = await discoverPusakaV2State(prepared.handle);
    if (
      fresh.planUtxo?.txid !== prepared.before.txid ||
      fresh.planUtxo?.vout !== prepared.before.vout
    )
      throw new Error(
        "The plan changed. Close this review and refresh before trying again.",
      );
  }
  const hex = await finalizeBuilderTxHex(prepared.builder);
  if (prepared.validUntil && Date.now() > prepared.validUntil)
    throw new Error(
      "Quote expired while awaiting approval. Nothing was broadcast. Get a fresh quote.",
    );
  const expectedTxid = binToHex(
    sha256.hash(sha256.hash(hexToBin(hex))).reverse(),
  );
  // The wallet approves without broadcasting; the app broadcasts the exact reviewed transaction once.
  let response;
  try {
    response = await getProvider(NETWORK).sendRawTransaction(hex);
  } catch (e) {
    throw new Error(
      `Submission could not be confirmed. Refresh the plan and check transaction ${expectedTxid} before trying again. ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const txid =
    typeof response === "string"
      ? response
      : (response as { txid: string }).txid;
  if (prepared.metadata) savePlan(prepared.metadata);
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(
        [
          {
            txid,
            title: prepared.title,
            at: Date.now(),
            plan: prepared.planCategory || "",
            status: "accepted",
          },
          ...history(),
        ].slice(0, 100),
      ),
    );
  } catch {
    /* The accepted transaction remains valid if browser storage is full. */
  }
  return txid;
}
export { testPair, tokenVault };
export type { Quote };
export async function getSwapQuote(amount: bigint, slippageBps: number) {
  if (NETWORK !== "chipnet" || !testPair.category)
    throw new Error(
      "The supported pair is a Chipnet test pair. Mainnet trading has not been qualified.",
    );
  const utxo = (await getProvider(NETWORK).getUtxos(testPair.poolAddress)).find(
    (u) => u.token?.category === testPair.category && !u.token.nft,
  );
  if (!utxo) throw new Error("The supported pool has no available liquidity.");
  return quoteBuy(
    { utxo, address: testPair.poolAddress, withdrawPkh: testPair.withdrawPkh },
    amount,
    slippageBps,
  );
}
export async function prepareSwap(
  metadata: PusakaV2PlanMetadata,
  quote: Quote,
): Promise<Prepared> {
  const { handle, state, now } = await loadPlan(metadata),
    { w, unlocker } = signing("Pusaka: swap BCH into protected tokens");
  if (binToHex(pkhOfAddress(w.ownerAddress())) !== metadata.ownerPkhHex)
    throw new Error("Connect the owner wallet.");
  const coin = [...(await ownerCoins(w.ownerAddress()))]
    .reverse()
    .find((u) => u.satoshis >= 600n);
  if (!coin || !state.planUtxo)
    throw new Error("Owner authorization coin or plan state missing.");
  const result = buildSwapTx({
    handle,
    planUtxo: state.planUtxo,
    ownerUtxo: coin,
    ownerUnlocker: unlocker,
    ownerAddress: w.ownerAddress(),
    quote,
    locktime: now - 1,
  });
  return {
    title: "Swap BCH for PSK",
    validUntil: quote.expiresAt,
    builder: result.builder,
    fee: result.fee,
    before: state.planUtxo,
    handle,
    planCategory: metadata.planCategoryHex,
    rows: [
      ["Pay pool (includes liquidity fee)", bch(quote.supply)],
      ["Pool liquidity fee", bch(quote.poolFee)],
      ["Receive (base units)", `${quote.receive} PSK`],
      ["Minimum return", `${quote.minimum} PSK`],
      ["Protected token carrier", bch(800n)],
      ["Protected BCH change", bch(result.protectedChange)],
      ["Returns to Paytaca", bch(coin.satoshis)],
      ["Network fee", bch(result.fee)],
      ["Token destination", result.vaultAddress],
      ["Activity", "Renewed in the same transaction"],
    ],
  };
}
export async function prepareTokenPayout(
  metadata: PusakaV2PlanMetadata,
  receipt: Utxo,
): Promise<Prepared> {
  const { handle, state } = await loadPlan(metadata),
    { w, unlocker } = signing("Pusaka: sponsor token inheritance payout");
  const sponsor = (await ownerCoins(w.ownerAddress())).find(
    (u) => u.satoshis >= 20000n,
  );
  if (!sponsor || !state.planUtxo)
    throw new Error(
      "The submitter needs an ordinary BCH coin of at least 20,000 sats for network fees and heir token carriers.",
    );
  const result = buildTokenPayoutTx({
    handle,
    planUtxo: state.planUtxo,
    tokenUtxo: receipt,
    sponsorUtxo: sponsor,
    sponsorUnlocker: unlocker,
    sponsorAddress: w.ownerAddress(),
  });
  return {
    title: "Pay token heirs",
    builder: result.builder,
    fee: result.fee,
    handle,
    before: state.planUtxo,
    planCategory: metadata.planCategoryHex,
    rows: [
      ["Token category", receipt.token!.category],
      ...result.payouts.map(
        (x) => [x.address, `${x.units} base units`] as [string, string],
      ),
      [
        "Heir carriers (paid by submitter)",
        bch(BigInt(result.payouts.length) * 800n),
      ],
      ["Network fee (paid by submitter)", bch(result.fee)],
      ["Rounding", "Indivisible units go to the final configured heir"],
    ],
  };
}
export async function prepareTokenSend(
  metadata: PusakaV2PlanMetadata,
  receipt: Utxo,
  recipient: string,
  units: bigint,
): Promise<Prepared> {
  const { handle, state, now } = await loadPlan(metadata),
    { w, unlocker } = signing("Pusaka: send protected tokens");
  if (binToHex(pkhOfAddress(w.ownerAddress())) !== metadata.ownerPkhHex)
    throw new Error("Connect the owner wallet.");
  if (
    !recipient.startsWith(NETWORK === "chipnet" ? "bchtest:" : "bitcoincash:")
  )
    throw new Error("Choose a recipient on this network.");
  const coin = [...(await ownerCoins(w.ownerAddress()))]
    .reverse()
    .find((u) => u.satoshis >= 600n);
  if (!coin || !state.planUtxo)
    throw new Error("Authorization coin or plan state missing.");
  const result = buildTokenSendTx({
    handle,
    planUtxo: state.planUtxo,
    tokenUtxo: receipt,
    ownerUtxo: coin,
    ownerUnlocker: unlocker,
    ownerAddress: w.ownerAddress(),
    recipient,
    units,
    locktime: now - 1,
  });
  return {
    title: "Send tokens",
    builder: result.builder,
    fee: result.fee,
    handle,
    before: state.planUtxo,
    planCategory: metadata.planCategoryHex,
    rows: [
      ["Recipient", recipient],
      ["Send", `${units} base units`],
      ["Protected token change", `${result.remaining} base units`],
      ["Network fee", bch(result.fee)],
      ["Activity", "Renewed in the same transaction"],
    ],
  };
}
