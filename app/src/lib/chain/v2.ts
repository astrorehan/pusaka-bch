import { Signer, TransactionBuilder, type Utxo } from "@solidcash/solidcash";
import { externallySignedUnlocker } from "@solidcash/solidcash/walletconnect";
import { binToHex, sha256, hexToBin } from "@bitauth/libauth";
import { claimFunding, DEFAULT_FEE_BUDGET, MIN_ANCHOR_SATS } from "../protocol/claim-funding";
import { CURRENT_ASSET_REVISION, MIN_PLAN_CARRIER_SATS } from "../protocol/plan-metadata";
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
  type PusakaV2PlanMetadata,
  type PusakaV2PolicyInput,
  type PusakaV2PlanHandle,
} from "../protocol/pusaka-v2";
import { NETWORK } from "../networkName";
import { shortAddress } from "../format";
import { recordActivity, removePendingPlan, savePendingPlan, savePlan, type PendingPlanSubmission } from "../walletData";
import { friendlyError, isInputConflict, isRejection, StaleReviewError, UnconfirmedPlanSubmission } from "./errors";
import {
  getFreshProvider,
  getProvider,
  medianTimePast,
  pkhOfAddress,
  lockOfAddress,
  paymentAddress,
} from "./network";
import { getWizardWallet } from "./wizard";
import {
  tokenVault,
  quoteBuy,
  buildSwapTx,
  buildTokenPayoutTx,
  buildTokenSendTx,
  type Quote,
} from "../protocol/assets";
import testPair from "../protocol/test-pair.json";

export type { PusakaV2PlanMetadata, PusakaV2PolicyInput, Quote };

export async function loadPlan(plan: PusakaV2PlanMetadata) {
  const provider = getProvider(NETWORK);
  // Use the same state read to verify the policy and display the balance.
  const handle = await attachPusakaV2Plan(plan, provider, { verifyOnChain: false });
  const [state, now] = await Promise.all([
    discoverPusakaV2State(handle),
    medianTimePast(NETWORK),
  ]);
  if (!state.planUtxo) {
    throw new Error("This plan could not be found on the network. Check that you have the latest link or file.");
  }
  if (!state.policyMatchesMetadata) {
    throw new Error("The plan rules have changed. Ask the owner for the latest link or file.");
  }

  const vault = handle.metadata.protocolRevision ? tokenVault(handle) : null;
  const anchorHeight = state.status === "REVIEW" && state.anchorMatchesRound &&
    state.anchorSequence === handle.policy.reviewSequence ? state.anchorUtxo?.blockHeight ?? 0 : 0;
  const [rawReceipts, anchorTime] = await Promise.all([
    vault ? provider.getUtxos(vault.address) : [],
    anchorHeight > 0 ? medianTimePast(NETWORK, anchorHeight - 1) : null,
  ]);
  const age = anchorTime === null ? 0 : Math.max(0, Number(now - anchorTime));
  const required = handle.policy.effectiveReviewSeconds;
  return {
    handle,
    state,
    now: Number(now),
    review: state.status === "REVIEW" ? {
      confirmed: anchorTime !== null,
      age,
      required,
      ready: anchorTime !== null && age >= required,
    } : undefined,
    tokenReceiveAddress: vault?.tokenAddress,
    tokenReceipts: rawReceipts.filter((u) => u.token && !u.token.nft && u.token.category !== plan.planCategoryHex),
    funding: payoutFunding(handle, state, Number(now)),
  };
}

function payoutFunding(
  handle: PusakaV2PlanHandle,
  state: Awaited<ReturnType<typeof discoverPusakaV2State>>,
  now: number,
) {
  const { planUtxo, deadline, status } = state;
  const { feeBudget, heirs } = handle.policy;
  const shares = heirs.map(({ share }) => share);
  const opening = status === "ACTIVE" || status === "CLOSED";
  const anchor = status === "REVIEW" && state.anchorMatchesRound ? state.anchorBalanceSats : 0n;
  const balance = state.planBalanceSats + anchor;
  let openingFee = opening ? feeBudget : 0n;
  let openingNeedsSponsor = false;
  if (opening && planUtxo && now > deadline) {
    // Size the transaction at a balance that can fund its outputs. The actual balance is used below.
    try {
      openingFee = buildOpenClaimByInactivityTx({
        handle,
        planUtxo: { ...planUtxo, satoshis: MIN_PLAN_CARRIER_SATS + MIN_ANCHOR_SATS + feeBudget },
        locktime: deadline,
      }).fee;
    } catch {
      openingNeedsSponsor = true;
    }
  }
  const self = claimFunding(balance, shares, feeBudget, openingFee);
  const sponsored = opening
    ? claimFunding(balance + MIN_ANCHOR_SATS, shares, feeBudget)
    : claimFunding(balance, shares, 0n);
  return {
    self,
    sponsored,
    canSelfFund: !openingNeedsSponsor && self.shortfall === 0n,
    canSponsor: sponsored.shortfall === 0n && (status !== "CLOSED" || balance > MIN_PLAN_CARRIER_SATS),
  };
}

export type LoadedPlan = Awaited<ReturnType<typeof loadPlan>>;
export interface Prepared {
  title: string;
  builder: TransactionBuilder;
  fee: bigint;
  rows: Array<[string, string]>;
  metadata?: PusakaV2PlanMetadata;
  planCategory?: string;
  validUntil?: number;
  walletApproval?: boolean;
  warning?: string;
  rebuild?: () => Promise<Prepared>;
}
function bch(sats: bigint) {
  return `${(Number(sats) / 1e8).toFixed(8)} BCH`;
}

function requirePayoutFunds(shortfall: bigint, inboxBalanceSats: bigint) {
  if (shortfall === 0n) return;
  const collect = inboxBalanceSats > 0n ? "Collect incoming BCH and try again." : "Add BCH at the plan’s receive address and collect it first.";
  throw new Error(`The plan needs ${bch(shortfall)} more in its protected balance to pay every heir. ${collect}`);
}

function previewOpenedClaim(handle: PusakaV2PlanHandle, builder: TransactionBuilder, inboxBalanceSats: bigint) {
  const [plan, anchor] = builder.outputs;
  const { feeBudget, heirs } = handle.policy;
  const funding = claimFunding(plan.amount + anchor.amount, heirs.map(({ share }) => share), feeBudget);
  requirePayoutFunds(funding.shortfall, inboxBalanceSats);
  // These outputs become the two payout inputs. An outpoint of the same size is enough to quote the payout.
  const txid = builder.inputs[0].txid;
  try {
    buildFinalizeClaimTx({
      handle,
      planUtxo: { txid, vout: 0, satoshis: plan.amount, token: plan.token },
      anchorUtxo: { txid, vout: 1, satoshis: anchor.amount, token: anchor.token },
    });
    return funding.smallestPayout;
  } catch (error) {
    if (error instanceof Error && error.message.includes("exceeds policy feeBudget"))
      throw new Error("This plan’s network fee budget is too small to pay its heirs without a wallet. Ask the owner to update the plan rules.");
    throw error;
  }
}

function walletOnNetwork() {
  const w = getWizardWallet();
  if (!w) throw new Error("Connect your wallet first.");
  if (w.network !== NETWORK)
    throw new Error("Connect a wallet on this network.");
  return w;
}
function signing(prompt: string) {
  const w = walletOnNetwork();
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
/** A coin from the connected wallet that pays a public step's network fee in place of the plan. */
async function sponsor(prompt: string, what: string) {
  const connected = getWizardWallet();
  if (!connected || connected.network !== NETWORK)
    throw new Error(
      `${what} needs a small network fee from a wallet. Connect a wallet with at least 0.00006 BCH at its first receive address, then try again.`,
    );
  const { w, unlocker } = signing(prompt);
  const [coin] = await ownerCoins(w.ownerAddress());
  if (!coin || coin.satoshis < 6000n)
    throw new Error(
      `${what} needs a small network fee. Keep at least 0.00006 BCH at the first receive address of the connected wallet.`,
    );
  return { sponsorUtxo: coin, sponsorUnlocker: unlocker, sponsorChangeAddress: w.ownerAddress() };
}
export async function prepareGather(): Promise<Prepared> {
  const w = walletOnNetwork();
  const p = getProvider(NETWORK);
  const addresses = w.derivedAddresses();
  const signer = w.signer("Pusaka: prepare your first receive address", addresses);
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
            signer,
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
    rebuild: prepareGather,
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
  const feeBudget = BigInt(policy.feeBudget ?? DEFAULT_FEE_BUDGET);
  const funding = claimFunding(initialDepositSats, policy.heirs.map(({ share }) => BigInt(share)), feeBudget, feeBudget);
  if (funding.shortfall > 0n)
    throw new Error(`Start with at least ${bch(funding.minimum)} so every heir can be paid after fees without a connected wallet.`);
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
    protocolRevision: CURRENT_ASSET_REVISION,
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
    rebuild: () => prepareCreate(policy, initialDepositSats),
    rows: [
      ["Protected balance", bch(initialDepositSats - MIN_PLAN_CARRIER_SATS)],
      ["Identity carrier (kept in Pusaka)", bch(MIN_PLAN_CARRIER_SATS)],
      ["Smallest heir’s estimated payout after fees", bch(funding.smallestPayout)],
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
  const recipient = action === "send" && options.address ? paymentAddress(options.address, NETWORK) : null;
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
  let sponsored = false;
  let smallestPayout: bigint | undefined;
  let warning: string | undefined;
  if (action === "sweep") {
    const inboxUtxos = state.inboxUtxos.slice(0, 20);
    try {
      result = buildSweepInboxTx({
        handle,
        planUtxo: state.planUtxo,
        inboxUtxos,
        mode: "self",
      });
    } catch {
      // The covenant caps the fee a receipt may pay for itself, and one or two receipts usually cost more.
      // A connected wallet pays the network fee instead, and the plan keeps every satoshi received.
      const fee = await sponsor("Pusaka: pay the fee to collect incoming BCH", "Collecting this payment");
      result = buildSweepInboxTx({
        handle,
        planUtxo: state.planUtxo,
        inboxUtxos,
        mode: "sponsored",
        ...fee,
      });
      sponsored = true;
    }
  } else if (action === "open" || action === "finalize" || action === "late") {
    if (action === "open" && now <= state.deadline)
      throw new Error(
        "The network clock has not passed the inactivity deadline.",
      );
    const anchorUtxo = state.anchorUtxo;
    if (action === "finalize" && (!anchorUtxo || !loaded.review?.ready))
      throw new Error(
        "Wait for the confirmed claim anchor to complete its network review period.",
      );
    const { funding } = loaded;
    const wallet = getWizardWallet();
    const canSponsor = wallet?.network === NETWORK && funding.canSponsor;
    if (!funding.canSelfFund && !canSponsor) {
      requirePayoutFunds(funding.self.shortfall, state.inboxBalanceSats);
      if (action === "open") throw new Error("Connect a funded wallet to pay the cost of opening this claim.");
    }
    const build = (fee?: Awaited<ReturnType<typeof sponsor>>) =>
      action === "open"
        ? buildOpenClaimByInactivityTx({ handle, planUtxo: state.planUtxo!, locktime: now - 1, ...fee })
        : action === "finalize"
          ? buildFinalizeClaimTx({ handle, planUtxo: state.planUtxo!, anchorUtxo: anchorUtxo!, ...fee })
          : buildDistributeLateTx({ handle, planUtxo: state.planUtxo!, ...fee });
    try {
      result = build();
      if (action === "open") smallestPayout = previewOpenedClaim(handle, result.builder, state.inboxBalanceSats);
    } catch (selfFunded) {
      if (!canSponsor) throw selfFunded;
      const prompts = { open: "open the claim", finalize: "pay the heirs", late: "pay the late receipts" };
      result = build(await sponsor(`Pusaka: pay the network fee to ${prompts[action]}`, "This step"));
      if (action === "open") smallestPayout = previewOpenedClaim(handle, result.builder, state.inboxBalanceSats);
      sponsored = true;
    }
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
      if (result.enteredReview) smallestPayout = previewOpenedClaim(handle, result.builder, state.inboxBalanceSats);
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
          if (!recipient || options.amount === undefined)
            throw new Error("Enter a recipient and amount.");
          result = buildSendTx({
            ...common,
            recipientAddressOrLock: recipient,
            amount: options.amount,
          });
          if (result.planSatsAfter < state.planBalanceSats) {
            const feeBudget = handle.policy.feeBudget;
            const funding = claimFunding(result.planSatsAfter, handle.policy.heirs.map(({ share }) => share), feeBudget, feeBudget);
            if (funding.shortfall > 0n)
              warning = `Allow for a top-up of ${bch(funding.shortfall)} after this payment to leave enough BCH for a wallet-free claim.`;
          }
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
          if (loaded.tokenReceipts.length) {
            const feeBudget = handle.policy.feeBudget;
            const funding = claimFunding(result.carrierSatsAfter, handle.policy.heirs.map(({ share }) => share), feeBudget, feeBudget);
            warning = `Tokens will stay in the vault. They can be sent to heirs only after a BCH payout. To fund a wallet-free claim again, add and collect about ${bch(funding.shortfall)} at the plan’s BCH receive address.`;
          }
          break;
        case "policy": {
          if (!options.policy) throw new Error("Enter the updated rules.");
          result = buildUpdatePolicyTx({
            ...common,
            newPolicy: options.policy,
          });
          const { heirs, feeBudget } = result.nextPolicy;
          const funding = claimFunding(result.planSatsAfter, heirs.map(({ share }) => share), feeBudget, feeBudget);
          smallestPayout = funding.smallestPayout;
          if (funding.shortfall > 0n)
            warning = `Allow for a top-up of ${bch(funding.shortfall)} after these changes so every heir can be paid without a connected wallet.`;
          break;
        }
        default:
          throw new Error("Unsupported action");
      }
    }
  }
  const rows: Array<[string, string]> = [[
    sponsored
      ? "Network fee (paid by your wallet)"
      : action === "sweep"
        ? "Network fee (taken from the payment)"
        : ["open", "finalize", "late"].includes(action) ? "Network fee (paid from the plan)" : "Network fee",
    bch(result.fee),
  ]];
  if (recipient)
    rows.unshift(
      ["To recipient", recipient],
      ["Payment", bch(options.amount!)],
    );
  if ("inboxSatsSwept" in result)
    rows.unshift([
      "Collected into the plan",
      bch(sponsored ? result.inboxSatsSwept : result.inboxSatsSwept - result.fee),
    ]);
  if ("protectedFeeSats" in result)
    rows.push(["Fee from Pusaka", bch(result.protectedFeeSats as bigint)]);
  if ("ownerChangeSats" in result)
    rows.push(["Returns to your wallet", bch(result.ownerChangeSats as bigint)]);
  if ("planSatsAfter" in result)
    rows.push([
      "Protected balance afterwards (incl. 1,000-sat reserve)",
      bch(result.planSatsAfter as bigint),
    ]);
  if ("heirPayouts" in result) {
    const names = new Map(metadata.heirs.map((heir, i) => [heir.pkhHex.toLowerCase(), heir.label?.trim() || `Heir ${i + 1}`]));
    // The heirs come first: they are what the person pressing the button is checking.
    rows.unshift(...result.heirPayouts.map((payout): [string, string] => {
      const name = names.get(payout.pkhHex.toLowerCase());
      return [name ? `${name} · ${shortAddress(payout.address, 6, 6)}` : payout.address, bch(payout.amount)];
    }));
  }
  if ("planCarrierAfter" in result && "paidTotal" in result) {
    const stays = result.planCarrierAfter as bigint;
    rows.push(["Stays in the plan (rounding and the 1,000-sat reserve)", bch(stays)]);
    rows.push([
      "Total from the plan",
      bch((result.paidTotal as bigint) + stays + (sponsored ? 0n : result.fee)),
    ]);
  }
  if ("nextDeadline" in result)
    rows.push([
      "Next inactivity deadline",
      new Date(Number(result.nextDeadline) * 1000).toLocaleString(),
    ]);
  if ("cancelledReview" in result && result.cancelledReview)
    rows.push(["Pending claim", "Cancelled in this same transaction"]);
  if (smallestPayout !== undefined)
    rows.push(["Smallest heir’s estimated payout after fees", bch(smallestPayout)]);
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
    rebuild: () => prepareAction(metadata, action, options),
    walletApproval: sponsored || !["sweep", "open", "finalize", "late"].includes(action),
    warning,
  };
}

function transactionId(hex: string) {
  return binToHex(sha256.hash(sha256.hash(hexToBin(hex))).reverse());
}

async function verifyAndSavePlan(record: PendingPlanSubmission) {
  const provider = getFreshProvider(NETWORK);
  const handle = await attachPusakaV2Plan(record.metadata, provider, { verifyOnChain: false });
  const state = await discoverPusakaV2State(handle);
  if (!state.planUtxo || !state.policyMatchesMetadata)
    throw new Error("This plan’s new rules are not visible at its address yet. The recovery copy is still saved.");
  if (savePlan(record.metadata)) removePendingPlan(record.txid);
}

export async function checkPlanSubmission(record: PendingPlanSubmission) {
  const provider = getProvider(NETWORK);
  let raw;
  try {
    raw = await provider.performRequest("blockchain.transaction.get", record.txid);
  } catch {
    throw new UnconfirmedPlanSubmission(record);
  }
  if (typeof raw !== "string" || !/^(?:[a-f\d]{2})+$/i.test(raw) || transactionId(raw) !== record.txid)
    throw new UnconfirmedPlanSubmission(record);
  await verifyAndSavePlan(record);
  recordActivity({ txid: record.txid, title: record.title, at: Date.now(), plan: record.metadata.planCategoryHex, status: "accepted" });
  return record.txid;
}

export async function submit(prepared: Prepared): Promise<string> {
  if (prepared.validUntil && Date.now() > prepared.validUntil)
    throw new Error("Quote expired. Close this review and get a fresh quote.");
  const hex = await finalizeBuilderTxHex(prepared.builder);
  const provider = getProvider(NETWORK);
  // The inputs may have changed while the owner was approving on a phone.
  const fresh = getFreshProvider(NETWORK);
  const available = await Promise.all(prepared.builder.inputs.map(async (input) => {
    const coins = await fresh.getUtxosForLockingBytecode(input.unlocker.generateLockingBytecode());
    return coins.some((coin) => coin.txid === input.txid && coin.vout === input.vout);
  }));
  if (available.includes(false)) throw new StaleReviewError();
  if (prepared.validUntil && Date.now() > prepared.validUntil)
    throw new Error(
      "Quote expired while awaiting approval. Nothing was broadcast. Get a fresh quote.",
    );
  const expectedTxid = transactionId(hex);
  const pending = prepared.metadata && { txid: expectedTxid, title: prepared.title, metadata: prepared.metadata };
  if (pending) savePendingPlan(pending);
  // The wallet approves without broadcasting; the app broadcasts the exact reviewed transaction once.
  let response;
  try {
    response = await provider.sendRawTransaction(hex);
  } catch (e) {
    if (isInputConflict(e)) {
      if (pending) throw new UnconfirmedPlanSubmission(pending);
      throw new StaleReviewError();
    }
    if (isRejection(e)) {
      if (pending) removePendingPlan(pending.txid);
      throw new Error(`The network did not accept this transaction, so nothing was sent. ${friendlyError(e)}`);
    }
    if (pending) throw new UnconfirmedPlanSubmission(pending);
    throw new Error(
      `Submission could not be confirmed. Refresh the plan and check transaction ${expectedTxid} before trying again. ${friendlyError(e)}`,
    );
  }
  const txid =
    typeof response === "string"
      ? response
      : (response as { txid?: string } | null)?.txid;
  if (typeof txid !== "string" || txid.toLowerCase() !== expectedTxid) {
    if (pending) throw new UnconfirmedPlanSubmission(pending);
    throw new Error(`Submission could not be confirmed. Check transaction ${expectedTxid} before trying again.`);
  }
  if (pending) {
    // An accepted transaction can take a moment to appear in listings. Keep both copies until it does.
    await verifyAndSavePlan(pending).catch(() => {});
  }
  recordActivity({
    txid: expectedTxid,
    title: prepared.title,
    at: Date.now(),
    plan: prepared.planCategory || "",
    status: "accepted",
  });
  return expectedTxid;
}
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
  const { heirs, feeBudget } = handle.policy;
  const funding = claimFunding(result.protectedChange, heirs.map(({ share }) => share), feeBudget, feeBudget);
  return {
    title: "Swap BCH for PSK",
    validUntil: quote.expiresAt,
    builder: result.builder,
    fee: result.fee,
    planCategory: metadata.planCategoryHex,
    warning: funding.shortfall > 0n
      ? `Allow for a top-up of ${bch(funding.shortfall)} after this swap to leave enough BCH for a wallet-free claim.`
      : undefined,
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
    rebuild: () => prepareTokenPayout(metadata, receipt),
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
      ["BCH from this receipt", `${bch(receipt.satoshis)} stays in the token vault and cannot be withdrawn`],
      ["Rounding per receipt", "Indivisible units go to the final configured heir for each receipt"],
    ],
  };
}
export async function prepareTokenSend(
  metadata: PusakaV2PlanMetadata,
  receipt: Utxo,
  recipient: string,
  units: bigint,
): Promise<Prepared> {
  const destination = paymentAddress(recipient, NETWORK);
  const { handle, state, now } = await loadPlan(metadata),
    { w, unlocker } = signing("Pusaka: send protected tokens");
  if (binToHex(pkhOfAddress(w.ownerAddress())) !== metadata.ownerPkhHex)
    throw new Error("Connect the owner wallet.");
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
    recipient: destination,
    units,
    locktime: now - 1,
  });
  return {
    title: "Send tokens",
    builder: result.builder,
    fee: result.fee,
    rebuild: () => prepareTokenSend(metadata, receipt, recipient, units),
    planCategory: metadata.planCategoryHex,
    rows: [
      ["Recipient", destination],
      ["Send", `${units} base units`],
      ["Protected token change", `${result.remaining} base units`],
      ["Network fee", bch(result.fee)],
      ["Activity", "Renewed in the same transaction"],
    ],
  };
}
