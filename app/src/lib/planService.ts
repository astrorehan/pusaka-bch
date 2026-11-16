// The seam between screens and the network. Screens call only this interface.
// `mockPlanService` simulates the network for UI work; the real implementation
// (SolidCash contract + WizardConnect wallet) replaces it without screen changes.

import type { PlanData, PlanState, TxPreview, TxResult } from './types';
import { heirAmounts } from './shares';

export interface WalletInfo {
  address: string;
  balance: bigint;
  name: string; // e.g. "Paytaca"
}

export interface PlanService {
  /** BCH price in USD, or null if unknown */
  usdPerBch(): Promise<number | null>;

  connectWallet(): Promise<WalletInfo | { cancelled: true }>;
  disconnectWallet(): Promise<void>;
  wallet(): WalletInfo | null;

  /** What creating this plan will move. `amount` is what the heirs share; the plan also holds `feeBudget` on top. */
  previewCreate(plan: PlanData, amount: bigint): Promise<TxPreview>;
  /** Deploys and funds the plan. Returns the plan with contractAddress and createdTxid filled in. */
  createPlan(plan: PlanData, amount: bigint): Promise<{ ok: true; plan: PlanData; txid: string } | Extract<TxResult, { ok: false }>>;

  readPlan(plan: PlanData): Promise<PlanState | null>;

  previewCheckIn(plan: PlanData): Promise<TxPreview>;
  checkIn(plan: PlanData): Promise<TxResult>;
  previewTakeBack(plan: PlanData): Promise<TxPreview>;
  takeBack(plan: PlanData): Promise<TxResult>;
  previewSendToHeirs(plan: PlanData): Promise<TxPreview>;
  sendToHeirs(plan: PlanData): Promise<TxResult>;
}

// ---------------------------------------------------------------- mock

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fakeTxid = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
const now = () => BigInt(Math.floor(Date.now() / 1000));

/** Network clock lag seen on Chipnet: median time past is about 74 minutes behind. */
const NETWORK_LAG = 4449n;
const STATEFUL_CALL_FEE = 12_000n; // measured: 9-12 KB per call at 1 sat/byte
const DEMO_OWNER = 'bitcoincash:qz7m2nq4y8j9k3l5x0w6e2r8t4y6u8i0o2p4a6s8d0';

interface MockRecord { state: PlanState; plan: PlanData }
const store = new Map<string, MockRecord>();
let currentWallet: WalletInfo | null = null;

function key(plan: PlanData) { return plan.contractAddress ?? ''; }

function status(rec: MockRecord): PlanState['status'] {
  const s = rec.state;
  if (s.status === 'sent' || s.status === 'taken-back') return s.status;
  const t = now() - NETWORK_LAG;
  if (t >= s.deadline) return 'claimable';
  if (s.deadline - t < rec.plan.period / 10n) return 'ending-soon';
  return 'active';
}

/** Mock knobs for UI work: `?mock=cancel` makes the wallet cancel, `?mock=fail` makes sends fail, `?mock=slow` adds delay. */
function mockMode(): string { return new URLSearchParams(window.location.search).get('mock') ?? ''; }

async function signAndSend(): Promise<TxResult> {
  await sleep(mockMode() === 'slow' ? 4000 : 1200);
  if (mockMode() === 'cancel') return { ok: false, reason: 'cancelled', message: 'Cancelled in your wallet. Nothing was sent.' };
  if (mockMode() === 'fail') return { ok: false, reason: 'failed', message: 'The network did not accept this transaction. Nothing was sent.', details: 'mock: Program failed an OP_VERIFY operation' };
  return { ok: true, txid: fakeTxid() };
}

export const mockPlanService: PlanService = {
  async usdPerBch() { return 449.6; },

  async connectWallet() {
    await sleep(900);
    if (mockMode() === 'cancel') return { cancelled: true };
    currentWallet = { address: DEMO_OWNER, balance: 52_000_000n, name: 'Paytaca' };
    return currentWallet;
  },
  async disconnectWallet() { currentWallet = null; },
  wallet() { return currentWallet; },

  async previewCreate(plan, amount) {
    return {
      lines: [
        { label: 'Into your inheritance plan', amount, kind: 'plan' },
        { label: 'Kept for the network fee when heirs are paid', amount: plan.feeBudget, kind: 'fee' },
      ],
      networkFee: 3_000n,
    };
  },
  async createPlan(plan, amount) {
    const r = await signAndSend();
    if (!r.ok) return r;
    const created: PlanData = { ...plan, categoryId: r.txid, contractAddress: `bitcoincash:p${r.txid.slice(0, 41)}`, createdTxid: r.txid };
    store.set(key(created), {
      plan: created,
      // `amount` is what the heirs share; the fee budget sits in the plan on top of it.
      state: { status: 'active', balance: amount + plan.feeBudget, deadline: now() - NETWORK_LAG + plan.period, networkTime: now() - NETWORK_LAG, lastTxid: r.txid },
    });
    return { ok: true, plan: created, txid: r.txid };
  },

  async readPlan(plan) {
    await sleep(500);
    if (!plan.contractAddress) return null;
    let rec = store.get(key(plan));
    if (!rec) {
      // Unknown plan from a link: pretend it exists, already past its waiting time (the judge path).
      rec = { plan, state: { status: 'claimable', balance: 60_000n, deadline: now() - NETWORK_LAG - 3600n, networkTime: now() - NETWORK_LAG } };
      store.set(key(plan), rec);
    }
    rec.state = { ...rec.state, networkTime: now() - NETWORK_LAG, status: status(rec) };
    return { ...rec.state };
  },

  async previewCheckIn() {
    return { lines: [], networkFee: STATEFUL_CALL_FEE };
  },
  async checkIn(plan) {
    const r = await signAndSend();
    const rec = store.get(key(plan));
    if (r.ok && rec) rec.state = { ...rec.state, deadline: now() - NETWORK_LAG + plan.period, lastTxid: r.txid };
    return r;
  },

  async previewTakeBack(plan) {
    const rec = store.get(key(plan));
    return { lines: [{ label: 'Back to your wallet', address: plan.ownerAddress, amount: rec?.state.balance ?? 0n, kind: 'owner' }], networkFee: STATEFUL_CALL_FEE };
  },
  async takeBack(plan) {
    const r = await signAndSend();
    const rec = store.get(key(plan));
    if (r.ok && rec) rec.state = { ...rec.state, status: 'taken-back', balance: 0n, lastTxid: r.txid };
    return r;
  },

  async previewSendToHeirs(plan) {
    const rec = store.get(key(plan));
    const pot = (rec?.state.balance ?? 0n) - plan.feeBudget;
    const { amounts } = heirAmounts(pot, plan.heirs.map((h) => h.share), plan.shareTotal);
    return {
      lines: plan.heirs.map((h, i) => ({ label: h.name, address: h.address, amount: amounts[i], kind: 'heir' as const })),
      networkFee: STATEFUL_CALL_FEE,
    };
  },
  async sendToHeirs(plan) {
    const r = await signAndSend();
    const rec = store.get(key(plan));
    if (r.ok && rec) rec.state = { ...rec.state, status: 'sent', balance: 0n, lastTxid: r.txid };
    return r;
  },
};

// ---------------------------------------------------------------- selection

/**
 * Mock mode, for UI work only: `VITE_MOCK=1`, or in the dev server any `?mock` in the URL (e.g. `?mock=1`,
 * `?mock=cancel`), which sticks for the tab. A production build ignores `?mock`, so a shared link can never
 * show simulated results as if they were real.
 */
export function isMockMode(): boolean {
  if (import.meta.env.VITE_MOCK === '1') return true;
  if (!import.meta.env.DEV) return false;
  try {
    if (new URLSearchParams(window.location.search).has('mock')) sessionStorage.setItem('pusaka-mock', '1');
    return sessionStorage.getItem('pusaka-mock') === '1';
  } catch {
    return new URLSearchParams(window.location.search).has('mock');
  }
}

/** The real service lives in a separate chunk (the SolidCash SDK is large), loaded on first use. */
let chain: Promise<typeof import('./chain/chainPlanService')> | null = null;
export function loadChain() {
  chain ??= import('./chain/chainPlanService');
  return chain;
}

let chainWallet: WalletInfo | null = null;
/** Set by the wallet provider when a WizardConnect session is ready, so `wallet()` can answer synchronously. */
export function setChainWallet(info: WalletInfo | null) {
  chainWallet = info;
}

const realPlanService: PlanService = {
  usdPerBch: async () => (await loadChain()).chainPlanService.usdPerBch(),
  connectWallet: async () => (await loadChain()).chainPlanService.connectWallet(),
  disconnectWallet: async () => (await loadChain()).chainPlanService.disconnectWallet(),
  wallet: () => chainWallet,
  previewCreate: async (p, a) => (await loadChain()).chainPlanService.previewCreate(p, a),
  createPlan: async (p, a) => (await loadChain()).chainPlanService.createPlan(p, a),
  readPlan: async (p) => (await loadChain()).chainPlanService.readPlan(p),
  previewCheckIn: async (p) => (await loadChain()).chainPlanService.previewCheckIn(p),
  checkIn: async (p) => (await loadChain()).chainPlanService.checkIn(p),
  previewTakeBack: async (p) => (await loadChain()).chainPlanService.previewTakeBack(p),
  takeBack: async (p) => (await loadChain()).chainPlanService.takeBack(p),
  previewSendToHeirs: async (p) => (await loadChain()).chainPlanService.previewSendToHeirs(p),
  sendToHeirs: async (p) => (await loadChain()).chainPlanService.sendToHeirs(p),
};

/** The service the app uses: the real network, or the mock for UI work. */
export const planService: PlanService = isMockMode() ? mockPlanService : realPlanService;
