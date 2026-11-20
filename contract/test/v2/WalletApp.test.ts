import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hash160, secp256k1 } from '@bitauth/libauth';
import { SignatureTemplate, type TransactionBuilder, type Utxo } from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import { prepareAction, checkPlanSubmission, submit } from '../../../app/src/lib/chain/v2';
import { NETWORK } from '../../../app/src/lib/networkName';
import { claimFunding } from '../../../app/src/lib/protocol/claim-funding';
import {
  attachPusakaV2Plan, buildGenesisV2PlanTx, buildSweepInboxTx, buildUpdatePolicyTx,
  p2pkhCashAddressFromPkh, type PusakaV2PlanMetadata, type PusakaV2PolicyInput,
} from '../../../app/src/lib/protocol/pusaka-v2';
import { tokenVault } from '../../../app/src/lib/protocol/assets';
import { pendingPlanSubmissions, savedPlans, savePlan } from '../../../app/src/lib/walletData';

vi.mock('../../../app/src/lib/chain/network', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../app/src/lib/chain/network')>(),
  getProvider: () => provider,
  getFreshProvider: () => provider,
  medianTimePast: async () => 1_800_100_000n,
}));
vi.mock('../../../app/src/lib/chain/wizard', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../app/src/lib/chain/wizard')>(),
  getWizardWallet: () => wallet,
}));

const ownerKey = new Uint8Array(32).fill(11);
const ownerPublicKey = secp256k1.derivePublicKeyCompressed(ownerKey) as Uint8Array;
const ownerPkh = hash160(ownerPublicKey);
const ownerUnlocker = new SignatureTemplate(ownerKey).unlockP2PKH();
const ownerAddress = p2pkhCashAddressFromPkh(ownerPkh, NETWORK);
const policy: PusakaV2PolicyInput = {
  inactivityPeriodSeconds: 600,
  reviewPeriodSeconds: 512,
  feeBudget: 5000n,
  contacts: [12, 13, 14].map((n) => new Uint8Array(20).fill(n)) as PusakaV2PolicyInput['contacts'],
  heirs: [15, 16, 17].map((n) => ({ pkh: new Uint8Array(20).fill(n), share: 1 })),
};

const ownerCoin = { txid: '80'.repeat(32), vout: 0, satoshis: 100_000n };
let provider: MockNetworkProvider;
let wallet: { network: string; ownerAddress(): string; ownerPublicKey(): Uint8Array; signer(): object } | null;
let storage: Record<string, string>;

beforeEach(() => {
  provider = new MockNetworkProvider();
  provider.network = NETWORK;
  wallet = null;
  storage = {};
  Object.defineProperties(storage, {
    getItem: { value: (key: string) => storage[key] ?? null },
    setItem: { value: (key: string, value: string) => { storage[key] = value; }, configurable: true },
    removeItem: { value: (key: string) => { delete storage[key]; } },
  });
  vi.stubGlobal('localStorage', storage);
});

async function genesis(deposit: bigint) {
  const utxo = await provider.addUtxo(ownerAddress, ownerCoin);
  return buildGenesisV2PlanTx({
    provider,
    protocolRevision: 'assets-1',
    genesisUtxo: utxo,
    ownerUnlocker,
    ownerAddress,
    ownerPkh,
    policy,
    createdAtLocktime: 1_800_000_000,
    initialDepositSats: deposit,
  });
}

async function putPlan(builder: TransactionBuilder, plan: PusakaV2PlanMetadata, txid: string) {
  const { amount, token } = builder.outputs[0];
  return provider.addUtxo(plan.planAddress, { txid, vout: 0, satoshis: amount, token });
}

function connectOwner() {
  wallet = { network: NETWORK, ownerAddress: () => ownerAddress, ownerPublicKey: () => ownerPublicKey, signer: () => ({}) };
}

describe('wallet claim funding', () => {
  it('requires enough BCH for the smallest share when the split is uneven', () => {
    const shares = [1n, 9n];
    expect(claimFunding(16_459n, shares, 5_000n, 5_000n)).toEqual({
      minimum: 16_460n, shortfall: 1n, smallestPayout: 545n,
    });
    expect(claimFunding(16_460n, shares, 5_000n, 5_000n).smallestPayout).toBe(546n);
  });

  it.each([8_000n, 22_000n])('checks the actual wallet-free payout before opening a %s-sat plan', async (deposit) => {
    const { builder, metadata } = await genesis(deposit);
    await putPlan(builder, metadata, '81'.repeat(32));
    const review = prepareAction(metadata, 'open');
    if (deposit === 8_000n) {
      await expect(review).rejects.toThrow(/more in its protected balance/);
    } else {
      await expect(review).resolves.toMatchObject({
        walletApproval: false,
        rows: expect.arrayContaining([['Smallest heir’s estimated payout after fees', expect.any(String)]]),
      });
    }
  });

  it('can sponsor the opening when its anchor leaves the plan enough to pay out without a wallet', async () => {
    const { builder, metadata } = await genesis(8_000n);
    await putPlan(builder, metadata, '81'.repeat(32));
    connectOwner();
    const review = await prepareAction(metadata, 'open');
    expect(review.walletApproval).toBe(true);
    expect(review.builder.outputs[0].amount).toBe(8_000n);
  });

  it('warns about the BCH top-up when exit leaves only tokens and the carrier', async () => {
    const { builder, metadata } = await genesis(22_000n);
    await putPlan(builder, metadata, '81'.repeat(32));
    const handle = await attachPusakaV2Plan(metadata, provider);
    await provider.addUtxo(tokenVault(handle).address, {
      txid: '82'.repeat(32), vout: 0, satoshis: 800n, token: { category: '89'.repeat(32), amount: 10n },
    });
    connectOwner();
    const review = await prepareAction(metadata, 'exit');
    expect(review.warning).toContain('only after a BCH payout');
    expect(review.warning).toContain('0.00011638 BCH');
  });

  it.each([1, 2])('sponsors collection when %s receipt(s) cannot cover the fee', async (count) => {
    const { builder, metadata } = await genesis(22_000n);
    const planUtxo = await putPlan(builder, metadata, '81'.repeat(32));
    const inboxUtxos: Utxo[] = [];
    for (let i = 0; i < count; i++) {
      inboxUtxos.push(await provider.addUtxo(metadata.inboxAddress, {
        txid: (82 + i).toString(16).repeat(32), vout: 0, satoshis: 3_000n,
      }));
    }
    const handle = await attachPusakaV2Plan(metadata, provider);
    expect(() => buildSweepInboxTx({ handle, planUtxo, inboxUtxos, mode: 'self' })).toThrow();
    connectOwner();
    const review = await prepareAction(metadata, 'sweep');
    expect(review.walletApproval).toBe(true);
    expect(review.builder.outputs[0].amount).toBe(22_000n + 3_000n * BigInt(count));
  });
});

describe('wallet broadcast recovery', () => {
  it.each(['create', 'edit'])('keeps the %s candidate when the broadcast reply is lost', async (kind) => {
    const original = await genesis(22_000n);
    let { metadata, builder } = original;
    if (kind === 'edit') {
      const previous = await putPlan(original.builder, original.metadata, '81'.repeat(32));
      const handle = await attachPusakaV2Plan(original.metadata, provider);
      const updated = buildUpdatePolicyTx({
        handle, planUtxo: previous, ownerUtxo: ownerCoin, ownerUnlocker, ownerChangeAddress: ownerAddress,
        newPolicy: { ...policy, inactivityPeriodSeconds: 1_200 }, locktime: 1_800_100_000,
      });
      metadata = updated.nextMetadata;
      builder = updated.builder;
      savePlan(original.metadata);
    }
    let raw = '';
    let beforeBroadcast: ReturnType<typeof pendingPlanSubmissions> = [];
    provider.sendRawTransaction = async (hex) => {
      beforeBroadcast = pendingPlanSubmissions();
      raw = hex;
      throw new Error('socket closed');
    };
    Object.assign(provider, { performRequest: async () => raw });

    await expect(submit({ builder, metadata, title: kind, fee: 0n, rows: [] })).rejects.toThrow(/recovery data is saved/);
    expect(Object.keys(storage)).toContainEqual(expect.stringMatching(/^pusaka\.v2\.pending\./));
    expect(beforeBroadcast).toMatchObject([{ metadata }]);
    const [record] = pendingPlanSubmissions();
    expect(record.metadata).toEqual(metadata);
    await expect(checkPlanSubmission(record)).rejects.toThrow(/new rules are not visible/);
    expect(savedPlans()).toEqual(kind === 'edit' ? [original.metadata] : []);

    vi.spyOn(provider, 'getUtxos').mockImplementation(async (address) => address === metadata.planAddress
      ? [{ txid: record.txid, vout: 0, satoshis: builder.outputs[0].amount, token: builder.outputs[0].token }]
      : []);
    await expect(checkPlanSubmission(record)).resolves.toBe(record.txid);
    expect(savedPlans()).toEqual([metadata]);
    expect(pendingPlanSubmissions()).toEqual([]);
  });

  it('stops a broadcast if browser storage cannot retain the recovery data', async () => {
    const { builder, metadata } = await genesis(22_000n);
    const broadcast = vi.spyOn(provider, 'sendRawTransaction');
    Object.defineProperty(storage, 'setItem', { value: () => { throw new Error('quota'); } });
    await expect(submit({ builder, metadata, title: 'Create', fee: 0n, rows: [] })).rejects.toThrow(/could not save/);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it('stops before saving or broadcasting when an input was spent during approval', async () => {
    const { builder, metadata } = await genesis(22_000n);
    const broadcast = vi.spyOn(provider, 'sendRawTransaction');
    vi.spyOn(provider, 'getUtxosForLockingBytecode').mockResolvedValue([]);
    await expect(submit({ builder, metadata, title: 'Create', fee: 0n, rows: [] })).rejects.toThrow(/input was spent/);
    expect(broadcast).not.toHaveBeenCalled();
    expect(pendingPlanSubmissions()).toEqual([]);
  });
});
