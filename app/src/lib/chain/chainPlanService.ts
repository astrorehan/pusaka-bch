// The real PlanService: the Pusaka SolidCash contract on Chipnet or mainnet, signed by the user's
// WizardConnect wallet. Loaded lazily (the SDK is large), so the first screen stays fast.
//
// Contract facts this file relies on (contract/contracts/Pusaka.scash, docs/solidcash-dx-log.md):
// - constructor(ownerPkh, period, totalShares, feeBudget) static; (firstDeadline, heirs[]) at deploy.
// - checkIn/withdraw: the owner's wallet must spend a coin at the owner address in the same transaction.
// - distribute: anyone, once the network clock passes the deadline; one explicit output per heir of
//   floor((balance - feeBudget) * share / totalShares). The presser's wallet pays the network fee.
// - Re-attaching from a plan link needs the four static args and the category id.
import { Contract, Signer, TransactionBuilder } from '@solidcash/solidcash';
import { StatefulContract } from '@solidcash/solidcash/stateful';
import { getContractFactory } from '@solidcash/solidcash/contract-factory';
import { externallySignedUnlocker } from '@solidcash/solidcash/walletconnect';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import artifact from './Pusaka.json';
import type { PlanService, WalletInfo } from '../planService';
import type { NetworkName, PlanData, PlanState, TxPreview, TxResult } from '../types';
import { heirAmounts } from '../shares';
import { getProvider, lockOfAddress, medianTimePast, pkhOfAddress, plainBalance } from './network';
import { WalletCancelledError, WizardWallet } from './wizard';

/** Measured on Chipnet: each stateful call is 9-12 KB at about 1 sat/byte. A margin on top for coin selection. */
const CALL_FEE = 12_000n;
const CALL_COINS_NEEDED = CALL_FEE + 6_000n;
const CONSOLIDATE_FEE_PER_INPUT = 200n;

const ART = artifact as never;

let wallet: WizardWallet | null = null;
let usdCache: { at: number; value: number | null } | null = null;

/** Called by the wallet provider when a WizardConnect session is ready (or gone). */
export function setWizardManager(manager: DappConnectionManager | null, network: NetworkName) {
  wallet = manager ? new WizardWallet(manager, network) : null;
}

function requireWallet(): WizardWallet {
  if (!wallet) throw new Error('Connect your wallet first.');
  return wallet;
}

function externalSigner(w: WizardWallet, prompt: string): Signer {
  return Signer.external(
    { wallet: w.signer(prompt), address: w.ownerAddress(), publicKey: w.ownerPublicKey(), userPrompt: prompt },
    getProvider(w.network),
  );
}

function staticArgs(plan: PlanData) {
  return [pkhOfAddress(plan.ownerAddress), plan.period, plan.shareTotal, plan.feeBudget];
}

function attach(plan: PlanData, runner?: Signer): any {
  if (!plan.categoryId) throw new Error('This plan link is missing its plan id.');
  const provider = getProvider(plan.network);
  const base = new Contract(ART, staticArgs(plan) as never, { provider });
  const sc = new StatefulContract(base as never, plan.categoryId) as any;
  return runner ? sc.connect(runner) : sc;
}

/**
 * The contract only sees coins at the owner address, but an HD wallet spreads its coins over many addresses.
 * When the owner address holds less than `needed`, move the wallet's other coins there first (one extra
 * signature). Returns true when a move was made.
 */
async function ensureCoinsAtOwner(w: WizardWallet, needed: bigint): Promise<boolean> {
  const provider = getProvider(w.network);
  const owner = w.ownerAddress();
  const have = await plainBalance(w.network, owner);
  if (have >= needed) return false;

  const others = w.derivedAddresses().filter((d) => d.address !== owner);
  const signer = w.signer('Pusaka: gather your coins in one address');
  const builder = new TransactionBuilder({ provider });
  let total = 0n;
  let inputs = 0;
  for (const d of others) {
    const utxos = (await provider.getUtxos(d.address)).filter((u) => !u.token);
    for (const u of utxos) {
      builder.addInput(u, externallySignedUnlocker({ lockingBytecode: lockOfAddress(d.address), signer }));
      total += u.satoshis;
      inputs++;
    }
  }
  const fee = 300n + BigInt(inputs) * CONSOLIDATE_FEE_PER_INPUT;
  if (inputs === 0 || have + total - fee < needed) {
    throw new NotEnoughFundsError(needed, have + total);
  }
  builder.addOutput({ to: owner, amount: total - fee });
  await builder.send();
  return true;
}

export class NotEnoughFundsError extends Error {
  readonly needed: bigint;
  readonly available: bigint;
  constructor(needed: bigint, available: bigint) {
    super(`Your wallet needs at least ${needed} satoshis for this, and it holds ${available}.`);
    this.needed = needed;
    this.available = available;
  }
}

function toResult(e: unknown): Extract<TxResult, { ok: false }> {
  if (e instanceof WalletCancelledError) return { ok: false, reason: 'cancelled', message: e.message };
  if (e instanceof NotEnoughFundsError) {
    return { ok: false, reason: 'failed', message: 'Your wallet does not hold enough BCH for this, including the network fee.', details: e.message };
  }
  const details = e instanceof Error ? e.message : String(e);
  return { ok: false, reason: 'failed', message: 'The network did not accept this transaction. Nothing was sent.', details };
}

async function statusOf(plan: PlanData, deadline: bigint, balance: bigint, now: bigint): Promise<PlanState['status']> {
  if (balance === 0n) return now >= deadline ? 'sent' : 'taken-back';
  if (now >= deadline) return 'claimable';
  if (deadline - now < plan.period / 10n) return 'ending-soon';
  return 'active';
}

export const chainPlanService: PlanService = {
  async usdPerBch() {
    if (usdCache && Date.now() - usdCache.at < 5 * 60_000) return usdCache.value;
    let value: number | null = null;
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd');
      value = (await r.json())?.['bitcoin-cash']?.usd ?? null;
    } catch {
      value = null;
    }
    usdCache = { at: Date.now(), value };
    return value;
  },

  // The WizardConnect pairing is driven by the React wallet provider (it shows the QR code); by the time a
  // screen asks, the session is either there or not.
  async connectWallet() {
    const w = wallet;
    if (!w) return { cancelled: true } as const;
    return this.wallet() as WalletInfo;
  },
  async disconnectWallet() {
    wallet = null;
  },
  wallet() {
    if (!wallet) return null;
    return { address: wallet.ownerAddress(), balance: 0n, name: wallet.name };
  },

  async previewCreate(plan, amount) {
    return {
      lines: [
        { label: 'Into your inheritance plan, for your heirs', amount, kind: 'plan' },
        { label: 'Kept in the plan for the network fee when heirs are paid', amount: plan.feeBudget, kind: 'fee' },
      ],
      networkFee: 3_000n,
    };
  },

  async createPlan(plan, amount) {
    try {
      const w = requireWallet();
      const owner = externalSigner(w, 'Pusaka: create your inheritance plan');
      await ensureCoinsAtOwner(w, amount + plan.feeBudget + 20_000n);
      const now = await medianTimePast(plan.network);
      const heirs = plan.heirs.map((h) => ({ pkh: pkhOfAddress(h.address), share: h.share }));
      const factory = getContractFactory(ART, owner);
      const deployed: any = await factory.deploy(
        pkhOfAddress(plan.ownerAddress), plan.period, plan.shareTotal, plan.feeBudget, now + plan.period, heirs,
        { initialBalance: amount + plan.feeBudget },
      );
      await deployed.waitForDeployment();
      const txid = deployed.deploymentTransaction()?.txid as string;
      const created: PlanData = {
        ...plan,
        categoryId: deployed.categoryId,
        contractAddress: await deployed.getAddress(),
        createdTxid: txid,
      };
      return { ok: true, plan: created, txid };
    } catch (e) {
      return toResult(e);
    }
  },

  async readPlan(plan) {
    if (!plan.categoryId) return null;
    try {
      const sc = attach(plan);
      const [deadline, balance, now] = await Promise.all([
        sc.state.deadline() as Promise<bigint>,
        sc.getBalance() as Promise<bigint>,
        medianTimePast(plan.network),
      ]);
      return { status: await statusOf(plan, deadline, balance, now), balance, deadline, networkTime: now };
    } catch {
      return null;
    }
  },

  async previewCheckIn() {
    return { lines: [], networkFee: CALL_FEE };
  },
  async checkIn(plan) {
    try {
      const w = requireWallet();
      if (w.ownerAddress() !== plan.ownerAddress) throw new Error('Only the wallet that made this plan can say "I\'m still here".');
      await ensureCoinsAtOwner(w, CALL_COINS_NEEDED);
      const sc = attach(plan, externalSigner(w, "Pusaka: I'm still here"));
      const lock = Number((await medianTimePast(plan.network)) - 1n);
      const tx = await sc.call.checkIn().setLocktime(lock).send();
      return { ok: true, txid: tx.txid };
    } catch (e) {
      return toResult(e);
    }
  },

  async previewTakeBack(plan) {
    const state = await this.readPlan(plan);
    return {
      lines: [{ label: 'Back to your wallet', address: plan.ownerAddress, amount: state?.balance ?? 0n, kind: 'owner' }],
      networkFee: CALL_FEE,
    };
  },
  async takeBack(plan) {
    try {
      const w = requireWallet();
      if (w.ownerAddress() !== plan.ownerAddress) throw new Error('Only the wallet that made this plan can take the BCH back.');
      await ensureCoinsAtOwner(w, CALL_COINS_NEEDED);
      const sc = attach(plan, externalSigner(w, 'Pusaka: take my BCH back'));
      const tx = await sc.call.withdraw().send();
      return { ok: true, txid: tx.txid };
    } catch (e) {
      return toResult(e);
    }
  },

  async previewSendToHeirs(plan) {
    const state = await this.readPlan(plan);
    const pot = (state?.balance ?? 0n) - plan.feeBudget;
    const { amounts } = heirAmounts(pot > 0n ? pot : 0n, plan.heirs.map((h) => h.share), plan.shareTotal);
    return {
      lines: plan.heirs.map((h, i) => ({ label: h.name, address: h.address, amount: amounts[i], kind: 'heir' as const })),
      networkFee: CALL_FEE,
    } satisfies TxPreview;
  },
  async sendToHeirs(plan) {
    try {
      const w = requireWallet();
      await ensureCoinsAtOwner(w, CALL_COINS_NEEDED);
      const sc = attach(plan, externalSigner(w, 'Pusaka: send to heirs'));
      const balance: bigint = await sc.getBalance();
      const pot = balance - plan.feeBudget;
      const { amounts } = heirAmounts(pot, plan.heirs.map((h) => h.share), plan.shareTotal);
      let call = sc.call.distribute().setLocktime(Number((await medianTimePast(plan.network)) - 1n));
      plan.heirs.forEach((h, i) => { call = call.transfer(lockOfAddress(h.address), amounts[i]); });
      const tx = await call.send();
      return { ok: true, txid: tx.txid };
    } catch (e) {
      return toResult(e);
    }
  },
};
