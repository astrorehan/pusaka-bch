import {
  Contract,
  TransactionBuilder,
  type Utxo,
  type Unlocker,
} from "@solidcash/solidcash";
import {
  binToHex,
  hexToBin,
  NonFungibleTokenCapability,
} from "@bitauth/libauth";
import {
  ExchangeLab,
  buildPoolV0RedeemScriptBytecode,
  buildPoolV0UnlockingBytecode,
} from "@cashlab/cauldron";
import type { Artifact } from "@solidcash/utils";
import artifact from "./PusakaTokenVault.json" with { type: "json" };
import {
  type PusakaV2PlanHandle,
  decodePlanStateCommitment,
  encodePlanStateCommitment,
  checkedDeadline,
  p2pkhLockingBytecode,
  lockToCashAddress,
  resolveLockingBytecode,
} from "./pusaka-v2.ts";

export const TOKEN_CARRIER = 800n;
export type Pool = { utxo: Utxo; withdrawPkh: string; address: string };
export type Quote = {
  pool: Pool;
  supply: bigint;
  receive: bigint;
  minimum: bigint;
  poolFee: bigint;
  expiresAt: number;
  category: string;
};
export function tokenVault(handle: PusakaV2PlanHandle) {
  if (handle.metadata.protocolRevision !== "assets-1")
    throw new Error(
      "This older plan supports BCH only. Create a separate asset-enabled wallet to use Swap.",
    );
  return new Contract(
    artifact as Artifact,
    [
      handle.contracts.planCategoryVmBytes,
      handle.contracts.planLockingBytecode,
      handle.contracts.ownerPkh,
    ],
    { provider: handle.provider, addressType: "p2sh32" },
  );
}
export function poolScripts(withdrawPkh: string) {
  if (!/^[a-f0-9]{40}$/i.test(withdrawPkh))
    throw new Error("Pool withdrawal key hash must be 20 bytes.");
  const params = { withdraw_pubkey_hash: hexToBin(withdrawPkh) };
  const lab = new ExchangeLab();
  const lock = lab.generatePoolV0LockingBytecode(params);
  const unlocker: Unlocker = {
    generateLockingBytecode: () => lock,
    generateUnlockingBytecode: () => buildPoolV0UnlockingBytecode(params),
  };
  return { lock, unlocker, redeem: buildPoolV0RedeemScriptBytecode(params) };
}
export function quoteBuy(pool: Pool, supply: bigint, slippageBps = 50): Quote {
  if (!pool.utxo.token || pool.utxo.token.nft || pool.utxo.token.amount <= 1n)
    throw new Error("Select a fungible-only Cauldron V0 pool.");
  if (supply < 1000n || supply > 100000000n)
    throw new Error(
      "This integration supports 1,000 to 100,000,000 sats per trade.",
    );
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 500)
    throw new Error("Slippage must be between 0 and 5%.");
  const scripts = poolScripts(pool.withdrawPkh);
  if (binToHex(scripts.lock) !== binToHex(resolveLockingBytecode(pool.address)))
    throw new Error("Pool address does not match its Cauldron script.");
  const poolFee = (supply * 3n) / 1000n;
  const effective = pool.utxo.satoshis + supply - poolFee;
  const k = pool.utxo.satoshis * pool.utxo.token.amount;
  const remaining = (k + effective - 1n) / effective;
  const receive = pool.utxo.token.amount - remaining;
  const minimum = (receive * BigInt(10000 - slippageBps)) / 10000n;
  if (minimum <= 0n || remaining < 1n)
    throw new Error("Pool liquidity is insufficient for this trade.");
  return {
    pool,
    supply,
    receive,
    minimum,
    poolFee,
    expiresAt: Date.now() + 60000,
    category: pool.utxo.token.category,
  };
}
function successor(handle: PusakaV2PlanHandle, plan: Utxo, locktime: number) {
  if (!plan.token?.nft) throw new Error("Missing plan identity");
  const state = decodePlanStateCommitment(plan.token.nft.commitment);
  if (state.status !== "ACTIVE")
    throw new Error(
      "Stop the pending claim or reactivate the wallet before swapping.",
    );
  if (state.policyHashHex !== handle.policy.policyHashHex)
    throw new Error("Plan rules changed. Import the updated plan.");
  return binToHex(
    encodePlanStateCommitment({
      status: 0,
      round: state.round + 1,
      approvalsMask: 0,
      deadline: Math.max(
        state.deadline,
        checkedDeadline(locktime, state.inactivityPeriodSeconds),
      ),
      inactivityPeriodSeconds: state.inactivityPeriodSeconds,
      policyHashBytes: hexToBin(state.policyHashHex),
    }),
  );
}
function planToken(handle: PusakaV2PlanHandle, commitment: string) {
  return {
    category: handle.metadata.planCategoryHex,
    amount: 0n,
    nft: { capability: NonFungibleTokenCapability.minting, commitment },
  };
}
function measure(build: (fee: bigint) => TransactionBuilder) {
  return BigInt(build(0n).build().length / 2) + 30n;
}
export function buildSwapTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  ownerUtxo: Utxo;
  ownerUnlocker: Unlocker;
  ownerAddress: string;
  quote: Quote;
  locktime: number;
  fee?: bigint;
}) {
  const {
    handle,
    planUtxo,
    ownerUtxo,
    ownerUnlocker,
    ownerAddress,
    quote,
    locktime,
  } = params;
  const vault = tokenVault(handle);
  if (Date.now() > quote.expiresAt)
    throw new Error("Quote expired. Get a fresh quote.");
  if (quote.receive < quote.minimum || quote.minimum <= 0n)
    throw new Error("Minimum return is not satisfied.");
  if (quote.category === handle.metadata.planCategoryHex)
    throw new Error("Plan identity cannot be traded.");
  if (ownerUtxo.token || ownerUtxo.satoshis < 600n)
    throw new Error("Retain a plain 600-sat owner authorization coin.");
  const commit = successor(handle, planUtxo, locktime);
  const pool = quote.pool.utxo;
  if (!pool.token || pool.token.nft) throw new Error("Unsupported pool");
  const scripts = poolScripts(quote.pool.withdrawPkh);
  const build = (fee: bigint) => {
    const debit = quote.supply + TOKEN_CARRIER + fee;
    if (planUtxo.satoshis - debit < 1000n)
      throw new Error("Insufficient protected BCH including carrier and fee.");
    if (fee > 10000n) throw new Error("Swap fee exceeds 10,000 sats.");
    return (
      new TransactionBuilder({ provider: handle.provider })
        .addInput(planUtxo, handle.contracts.plan.unlock.assetAction(debit))
        .addInput(ownerUtxo, ownerUnlocker)
        .addInput(pool, scripts.unlocker)
        .addOutput({
          to: handle.contracts.planAddress,
          amount: planUtxo.satoshis - debit,
          token: planToken(handle, commit),
        })
        .addOutput({ to: ownerAddress, amount: ownerUtxo.satoshis })
        // Cauldron requires the recreated pool at its input index (2).
        .addOutput({
          to: lockToCashAddress(scripts.lock, handle.metadata.network, true),
          amount: pool.satoshis + quote.supply,
          token: {
            category: quote.category,
            amount: pool.token!.amount - quote.receive,
          },
        })
        .addOutput({
          to: vault.tokenAddress,
          amount: TOKEN_CARRIER,
          token: { category: quote.category, amount: quote.receive },
        })
        .setLocktime(locktime)
    );
  };
  const fee = params.fee ?? measure(build);
  return {
    builder: build(fee),
    fee,
    vaultAddress: vault.tokenAddress,
    protectedChange: planUtxo.satoshis - quote.supply - TOKEN_CARRIER - fee,
    receive: quote.receive,
    minimum: quote.minimum,
  };
}
export function tokenPayouts(handle: PusakaV2PlanHandle, amount: bigint) {
  let paid = 0n;
  return handle.policy.heirs.map((heir, i) => {
    const units =
      i === handle.policy.heirs.length - 1
        ? amount - paid
        : (amount * heir.share) / handle.policy.totalShares;
    paid += units;
    return {
      address: lockToCashAddress(
        p2pkhLockingBytecode(heir.pkh),
        handle.metadata.network,
        true,
      ),
      units,
    };
  });
}
export function buildTokenSendTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  tokenUtxo: Utxo;
  ownerUtxo: Utxo;
  ownerUnlocker: Unlocker;
  ownerAddress: string;
  recipient: string;
  units: bigint;
  locktime: number;
  fee?: bigint;
}) {
  const {
    handle,
    planUtxo,
    tokenUtxo,
    ownerUtxo,
    ownerUnlocker,
    ownerAddress,
    units,
  } = params;
  const vault = tokenVault(handle),
    token = tokenUtxo.token;
  if (!token || token.nft || units <= 0n || units > token.amount)
    throw new Error("Choose a positive amount from this fungible receipt.");
  if (ownerUtxo.token || ownerUtxo.satoshis < 600n)
    throw new Error("Keep an ordinary 600-sat authorization coin.");
  const recipient = lockToCashAddress(
    resolveLockingBytecode(params.recipient),
    handle.metadata.network,
    true,
  );
  const commit = successor(handle, planUtxo, params.locktime),
    remaining = token.amount - units;
  const build = (fee: bigint) => {
    const balanceCost =
      fee + TOKEN_CARRIER * (remaining > 0n ? 2n : 1n) - tokenUtxo.satoshis;
    const debit = balanceCost > 0n ? balanceCost : 0n;
    if (debit < 0n || debit > 10000n || planUtxo.satoshis - debit < 1000n)
      throw new Error("Insufficient protected BCH for this token transaction.");
    const builder = new TransactionBuilder({ provider: handle.provider })
      .addInput(planUtxo, handle.contracts.plan.unlock.assetAction(debit))
      .addInput(ownerUtxo, ownerUnlocker)
      .addInput(tokenUtxo, vault.unlock.ownerSpend())
      .addOutput({
        to: handle.contracts.planAddress,
        amount: planUtxo.satoshis - balanceCost,
        token: planToken(handle, commit),
      })
      .addOutput({ to: ownerAddress, amount: ownerUtxo.satoshis })
      .addOutput({
        to: recipient,
        amount: TOKEN_CARRIER,
        token: { category: token.category, amount: units },
      });
    if (remaining > 0n)
      builder.addOutput({
        to: vault.tokenAddress,
        amount: TOKEN_CARRIER,
        token: { category: token.category, amount: remaining },
      });
    return builder.setLocktime(params.locktime);
  };
  const fee = params.fee ?? measure(build);
  return { builder: build(fee), fee, remaining, recipient };
}
export function buildTokenPayoutTx(params: {
  handle: PusakaV2PlanHandle;
  planUtxo: Utxo;
  tokenUtxo: Utxo;
  sponsorUtxo: Utxo;
  sponsorUnlocker: Unlocker;
  sponsorAddress: string;
  fee?: bigint;
}) {
  const {
    handle,
    planUtxo,
    tokenUtxo,
    sponsorUtxo,
    sponsorUnlocker,
    sponsorAddress,
  } = params;
  const vault = tokenVault(handle);
  if (
    !tokenUtxo.token ||
    tokenUtxo.token.nft ||
    tokenUtxo.token.category === handle.metadata.planCategoryHex
  )
    throw new Error("Only foreign fungible receipts can be distributed.");
  if (
    !planUtxo.token?.nft ||
    decodePlanStateCommitment(planUtxo.token.nft.commitment).status !==
      "PAID_OUT"
  )
    throw new Error("Complete the BCH claim before distributing tokens.");
  if (sponsorUtxo.token) throw new Error("Sponsor must use ordinary BCH.");
  const payouts = tokenPayouts(handle, tokenUtxo.token.amount);
  const build = (fee: bigint) => {
    const change =
      sponsorUtxo.satoshis - BigInt(payouts.length) * TOKEN_CARRIER - fee;
    if (change < 546n)
      throw new Error(
        "Sponsor needs enough BCH for token carriers, fees and change.",
      );
    const builder = new TransactionBuilder({ provider: handle.provider })
      .addInput(planUtxo, handle.contracts.plan.unlock.assetDistribution())
      .addInput(tokenUtxo, vault.unlock.distribute(handle.policy.policyBytes))
      .addInput(sponsorUtxo, sponsorUnlocker)
      .addOutput({
        to: handle.contracts.planAddress,
        amount: planUtxo.satoshis,
        token: planUtxo.token,
      });
    for (const payout of payouts)
      builder.addOutput({
        to: payout.address,
        amount: TOKEN_CARRIER,
        ...(payout.units > 0n
          ? {
              token: {
                category: tokenUtxo.token!.category,
                amount: payout.units,
              },
            }
          : {}),
      });
    builder
      .addOutput({ to: vault.address, amount: tokenUtxo.satoshis })
      .addOutput({ to: sponsorAddress, amount: change });
    return builder;
  };
  const fee = params.fee ?? measure(build);
  return { builder: build(fee), fee, payouts };
}
