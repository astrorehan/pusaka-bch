import { readFileSync } from 'node:fs';
import {
  binToHex,
  cashAddressToLockingBytecode,
  decodeTransaction,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import {
  Contract,
  Signer,
  TransactionBuilder,
  type NetworkProvider,
  type TransactionDetails,
  type Utxo,
} from '@solidcash/solidcash';
import {
  ContractFactory,
  createCovenantContractUnlocker,
  getContractFactory,
  StatefulContract,
  type ConnectedStatefulContract,
} from '@solidcash/solidcash/stateful';
import {
  BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX,
  buildSatoshiContainerCovenantScript,
  containerMasterRetires,
  type Artifact,
} from '@solidcash/utils';

export const WALLET_BALANCE_PLAN_VERSION = 'pusaka-v2-stage1' as const;
export const DEFAULT_PER_INPUT_FEE_CAP = 600n;
export const CONTAINER_DUST_SATOSHIS = 576n;
export const P2PKH_DUST_SATOSHIS = 546n;

// Synthetic OP_TRUE fee funder injected on MockNetworkProvider by stb-measure-and-fund-covenant-fee.js
// when signer funds are exhausted; never valid on Chipnet/mainnet.
export const FEE_DUMMY_FUNDER_LOCKING_BYTECODE_HEX =
  'aa20953ccfa596a6c6d39e5980194539124fdcff116a571455a212baed811f585ee087';

const proofArtifact: Artifact = JSON.parse(
  readFileSync(
    new URL(
      '../../artifacts/solidcash/contracts/WalletBalanceProof.scash/WalletBalanceProof.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

const inboxArtifact: Artifact = JSON.parse(
  readFileSync(
    new URL(
      '../../artifacts/solidcash/contracts/WalletBalanceInbox.scash/WalletBalanceInbox.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

export function getWalletBalanceArtifacts(): {
  proofArtifact: Artifact;
  inboxArtifact: Artifact;
} {
  return { proofArtifact, inboxArtifact };
}

export interface WalletBalanceHeirInput {
  pkh: Uint8Array | string;
  share: bigint;
}

export interface WalletBalancePlanMetadata {
  version: typeof WALLET_BALANCE_PLAN_VERSION;
  network: string;
  categoryId: string;
  masterAddress: string;
  masterLockHex: string;
  satoshiContainerAddress: string;
  satoshiContainerLockHex: string;
  inboxAddress: string;
  inboxLockHex: string;
  perInputFeeCap: string;
  constructorArgs: {
    ownerPkhHex: string;
    period: string;
    totalShares: string;
    feeBudget: string;
  };
}

export interface WalletBalancePlanHandle {
  metadata: WalletBalancePlanMetadata;
  provider: NetworkProvider;
  master: ConnectedStatefulContract<Artifact>;
  inbox: Contract<Artifact>;
  satoshiContainerAddress: string;
  satoshiContainerLock: Uint8Array;
  inboxAddress: string;
  inboxLock: Uint8Array;
  perInputFeeCap: bigint;
}

export interface WalletBalanceInspection {
  categoryId: string;
  masterAddress: string;
  satoshiContainerAddress: string;
  inboxAddress: string;
  deadline: bigint;
  heirs: Array<{ pkh: Uint8Array; share: bigint }>;
  containerUtxos: Utxo[];
  containerJunkTokenUtxos: Utxo[];
  inboxUtxos: Utxo[];
  inboxJunkTokenUtxos: Utxo[];
  containerBalance: bigint;
  inboxBalance: bigint;
  totalCoveredBalance: bigint;
}

export interface SweepInboxResult {
  txid: string;
  mode: 'self' | 'sponsored';
  sweptInboxUtxos: Utxo[];
  mergedContainerUtxo?: Utxo;
  inboxSatsSwept: bigint;
  containerSatsBefore: bigint;
  containerSatsAfter: bigint;
  feePaid: bigint;
  sponsorInputsSats: bigint;
  sponsorChangeSats: bigint;
  txBytes: number;
  usedDummyFunder: boolean;
}

export interface ProtectedSendResult {
  txid: string;
  recipientLockHex: string;
  amount: bigint;
  txBytes: number;
  feePaid: bigint;
  containerBefore: bigint;
  containerAfter: bigint;
  ownerInputsSats: bigint;
  ownerChangeSats: bigint;
  ownerNetSpent: bigint;
  newDeadline: bigint;
  usedDummyFunder: boolean;
  details: TransactionDetails;
}

export interface TxAccountingBreakdown {
  txid: string;
  txBytes: number;
  totalInputsSats: bigint;
  totalOutputsSats: bigint;
  feePaid: bigint;
  inputsByLock: Array<{ lockHex: string; satoshis: bigint; hasToken: boolean }>;
  outputsByLock: Array<{ lockHex: string; satoshis: bigint; hasToken: boolean }>;
  usedDummyFunder: boolean;
}

function toBytes20(value: Uint8Array | string): Uint8Array {
  const bytes = typeof value === 'string' ? hexToBin(value.replace(/^0x/, '')) : value;
  if (bytes.length !== 20) {
    throw new Error(`Expected 20-byte pkh, got ${bytes.length} bytes`);
  }
  return bytes;
}

export function resolveLockingBytecode(addressOrLock: string | Uint8Array): Uint8Array {
  if (addressOrLock instanceof Uint8Array) {
    return addressOrLock;
  }
  if (/^(0x)?[0-9a-fA-F]+$/.test(addressOrLock) && addressOrLock.replace(/^0x/, '').length % 2 === 0) {
    return hexToBin(addressOrLock.replace(/^0x/, ''));
  }
  const decoded = cashAddressToLockingBytecode(addressOrLock);
  if (typeof decoded === 'string') {
    throw new Error(`Invalid CashAddress '${addressOrLock}': ${decoded}`);
  }
  return decoded.bytecode;
}

export function lockToCashAddress(lock: Uint8Array, network: string, tokenSupport = false): string {
  const prefix = network === 'mainnet' ? 'bitcoincash' : network === 'regtest' ? 'bchreg' : 'bchtest';
  const encoded = lockingBytecodeToCashAddress({ bytecode: lock, prefix, tokenSupport });
  if (typeof encoded === 'string') {
    throw new Error(`Cannot encode locking bytecode: ${encoded}`);
  }
  return encoded.address;
}

/**
 * Derive the P2SH32 locking bytecode of a stateful contract's satoshi container
 * directly from its master locking bytecode + categoryId, matching @solidcash/utils.
 */
export function deriveSatoshiContainerLock(
  master: ConnectedStatefulContract<Artifact>,
  categoryId: string,
): { lock: Uint8Array; address: string } {
  const masterLock = hexToBin(master.inner.lockingBytecode);
  if (masterLock.length !== 35) {
    throw new Error(`Expected 35-byte P2SH32 master lock, got ${masterLock.length}`);
  }
  const covenantScript = buildSatoshiContainerCovenantScript(
    hexToBin(categoryId),
    masterLock,
    { masterRetires: containerMasterRetires(master.inner.artifact.abi ?? []) },
  );
  const address = master.getSatoshiContainerAddress();
  const lock = resolveLockingBytecode(address);
  if (lock.length !== 35) {
    throw new Error(`Expected 35-byte P2SH32 satoshiContainer lock, got ${lock.length}`);
  }
  // Sanity cross-check against buildSatoshiContainerCovenantScript
  if (covenantScript.length === 0) {
    throw new Error('Empty satoshi container script');
  }
  return { lock, address };
}

/**
 * Isolated SDK workaround: SolidCash exports `createSatoshiContainerUnlocker(..., flag=1)` for
 * master-authorized spends, but does not expose a helper for the covenant's `flag=0`
 * (permissionless UTXO merge) arm built into `buildSatoshiContainerCovenantScript`.
 */
export function createSatoshiContainerMergeUnlocker(
  master: ConnectedStatefulContract<Artifact>,
  categoryId: string,
  mergeOutputIndex = 0n,
) {
  const masterLock = hexToBin(master.inner.lockingBytecode);
  const covenantScript = buildSatoshiContainerCovenantScript(
    hexToBin(categoryId),
    masterLock,
    { masterRetires: containerMasterRetires(master.inner.artifact.abi ?? []) },
  );
  return createCovenantContractUnlocker(
    master.inner,
    `SatoshiContainer_${categoryId.slice(0, 8)}`,
    covenantScript,
    [
      { name: 'flag', type: 'bigint' },
      { name: 'mergeOutputIndex', type: 'bigint' },
    ],
    [0n, mergeOutputIndex],
    'p2sh32',
  );
}

/**
 * Isolated SDK workaround: `@solidcash/solidcash` (`orderPlain`) prefers `vout > 0`
 * without checking satoshi values, so if an owner wallet holds both a stale sub-fee coin
 * (e.g. 9,408 sats) and a well-funded coin (e.g. 341,572 sats), SolidCash can pick the
 * sub-fee coin and fail with `min relay fee not met` on ~9.8 KB stateful `send()` txs.
 * Wrapping the signer with `Object.create(signer)` preserves `instanceof Signer` and
 * signing delegation while filtering out sub-`minSats` plain coins whenever at least one
 * plain coin `>= minSats` is available.
 */
export function withFundedPlainUtxoPreference(
  signer: Signer,
  minSats = 11_000n,
): Signer {
  const wrapped: Signer = Object.create(signer);
  wrapped.getUtxos = async () => {
    const utxos = await signer.getUtxos();
    const plain = utxos
      .filter((u) => !u.token)
      .sort((a, b) => (b.satoshis > a.satoshis ? 1 : b.satoshis < a.satoshis ? -1 : 0));
    const tokens = utxos.filter((u) => !!u.token);
    const funded = plain.filter((u) => u.satoshis >= minSats);
    return [...(funded.length > 0 ? funded : plain), ...tokens];
  };
  return wrapped;
}

function buildInboxContract(
  satoshiContainerLock: Uint8Array,
  perInputFeeCap: bigint,
  provider: NetworkProvider,
): { inbox: Contract<Artifact>; inboxLock: Uint8Array; inboxAddress: string } {
  const inbox = new Contract(
    inboxArtifact,
    [satoshiContainerLock, perInputFeeCap],
    { provider, addressType: 'p2sh32' },
  );
  const inboxLock = hexToBin(inbox.lockingBytecode);
  if (inboxLock.length !== 35) {
    throw new Error(`Expected 35-byte P2SH32 inbox lock, got ${inboxLock.length}`);
  }
  return { inbox, inboxLock, inboxAddress: inbox.address };
}

export async function deployWalletBalancePlan(params: {
  ownerSigner: Signer;
  period: bigint;
  feeBudget: bigint;
  firstDeadline: bigint;
  heirs: WalletBalanceHeirInput[];
  initialBalance?: bigint;
  perInputFeeCap?: bigint;
}): Promise<{
  handle: WalletBalancePlanHandle;
  metadata: WalletBalancePlanMetadata;
  deployTx: TransactionDetails | undefined;
}> {
  const {
    ownerSigner,
    period,
    feeBudget,
    firstDeadline,
    heirs,
    initialBalance = 0n,
    perInputFeeCap = DEFAULT_PER_INPUT_FEE_CAP,
  } = params;

  const normalizedHeirs = heirs.map((h) => ({
    pkh: toBytes20(h.pkh),
    share: BigInt(h.share),
  }));
  const totalShares = normalizedHeirs.reduce((s, h) => s + h.share, 0n);

  const factory: ContractFactory<Artifact> = getContractFactory(proofArtifact, ownerSigner);
  const deployed = await (factory as any).deploy(
    ownerSigner.pkh,
    period,
    totalShares,
    feeBudget,
    firstDeadline,
    normalizedHeirs,
    { initialBalance },
  );
  await deployed.waitForDeployment();

  const categoryId: string = deployed.categoryId;
  const masterAddress = deployed.tokenAddress;
  const masterLockHex = deployed.inner.lockingBytecode;
  const { lock: satoshiContainerLock, address: satoshiContainerAddress } =
    deriveSatoshiContainerLock(deployed, categoryId);
  const { inbox, inboxLock, inboxAddress } = buildInboxContract(
    satoshiContainerLock,
    perInputFeeCap,
    ownerSigner.provider,
  );

  const metadata: WalletBalancePlanMetadata = {
    version: WALLET_BALANCE_PLAN_VERSION,
    network: ownerSigner.provider.network,
    categoryId,
    masterAddress,
    masterLockHex,
    satoshiContainerAddress,
    satoshiContainerLockHex: binToHex(satoshiContainerLock),
    inboxAddress,
    inboxLockHex: binToHex(inboxLock),
    perInputFeeCap: perInputFeeCap.toString(),
    constructorArgs: {
      ownerPkhHex: binToHex(ownerSigner.pkh),
      period: period.toString(),
      totalShares: totalShares.toString(),
      feeBudget: feeBudget.toString(),
    },
  };

  const handle: WalletBalancePlanHandle = {
    metadata,
    provider: ownerSigner.provider,
    master: deployed,
    inbox,
    satoshiContainerAddress,
    satoshiContainerLock,
    inboxAddress,
    inboxLock,
    perInputFeeCap,
  };

  return {
    handle,
    metadata,
    deployTx: deployed.deploymentTransaction?.(),
  };
}

/**
 * Reconstruct a WalletBalance plan cleanly in a fresh session using ONLY public plan metadata.
 * Never touches private keys. Verifies derived addresses match the metadata fail-closed.
 */
export async function attachWalletBalancePlan(
  metadata: WalletBalancePlanMetadata,
  runner: NetworkProvider | Signer,
): Promise<WalletBalancePlanHandle> {
  if (metadata.version !== WALLET_BALANCE_PLAN_VERSION) {
    throw new Error(`Unsupported WalletBalance plan version: ${metadata.version}`);
  }
  const provider: NetworkProvider = runner instanceof Signer ? runner.provider : runner;
  const stateful = StatefulContract.from(
    proofArtifact,
    [
      hexToBin(metadata.constructorArgs.ownerPkhHex),
      BigInt(metadata.constructorArgs.period),
      BigInt(metadata.constructorArgs.totalShares),
      BigInt(metadata.constructorArgs.feeBudget),
    ],
    { provider, addressType: 'p2sh32' },
    metadata.categoryId,
  ) as ConnectedStatefulContract<Artifact>;
  const connected = runner instanceof Signer ? stateful.connect(runner) : stateful;

  const derivedMasterLockHex = connected.inner.lockingBytecode;
  const expectedMasterLockHex = binToHex(resolveLockingBytecode(metadata.masterAddress));
  if (
    derivedMasterLockHex !== metadata.masterLockHex ||
    expectedMasterLockHex !== derivedMasterLockHex
  ) {
    throw new Error(
      `Plan metadata mismatch: derived master lock ${derivedMasterLockHex} != ${metadata.masterLockHex}`,
    );
  }

  const { lock: satoshiContainerLock, address: satoshiContainerAddress } =
    deriveSatoshiContainerLock(connected, metadata.categoryId);
  if (
    satoshiContainerAddress !== metadata.satoshiContainerAddress ||
    binToHex(satoshiContainerLock) !== metadata.satoshiContainerLockHex
  ) {
    throw new Error('Plan metadata mismatch: derived satoshiContainer does not match metadata');
  }

  const perInputFeeCap = BigInt(metadata.perInputFeeCap);
  const { inbox, inboxLock, inboxAddress } = buildInboxContract(
    satoshiContainerLock,
    perInputFeeCap,
    provider,
  );
  if (
    inboxAddress !== metadata.inboxAddress ||
    binToHex(inboxLock) !== metadata.inboxLockHex
  ) {
    throw new Error('Plan metadata mismatch: derived inbox address does not match metadata');
  }

  return {
    metadata,
    provider,
    master: connected,
    inbox,
    satoshiContainerAddress,
    satoshiContainerLock,
    inboxAddress,
    inboxLock,
    perInputFeeCap,
  };
}

export async function inspectWalletBalancePlan(
  handle: WalletBalancePlanHandle,
): Promise<WalletBalanceInspection> {
  const [state, rawContainerUtxos, rawInboxUtxos] = await Promise.all([
    handle.master.getState(),
    handle.provider.getUtxos(handle.satoshiContainerAddress),
    handle.provider.getUtxos(handle.inboxAddress),
  ]);

  const containerUtxos = rawContainerUtxos.filter((u) => !u.token);
  const containerJunkTokenUtxos = rawContainerUtxos.filter((u) => !!u.token);
  const inboxUtxos = rawInboxUtxos.filter((u) => !u.token);
  const inboxJunkTokenUtxos = rawInboxUtxos.filter((u) => !!u.token);

  const containerBalance = containerUtxos.reduce((s, u) => s + u.satoshis, 0n);
  const inboxBalance = inboxUtxos.reduce((s, u) => s + u.satoshis, 0n);

  return {
    categoryId: handle.metadata.categoryId,
    masterAddress: handle.metadata.masterAddress,
    satoshiContainerAddress: handle.satoshiContainerAddress,
    inboxAddress: handle.inboxAddress,
    deadline: BigInt(state.deadline as bigint | number),
    heirs: (state.heirs as Array<{ pkh: Uint8Array; share: bigint }>).map((h) => ({
      pkh: h.pkh,
      share: BigInt(h.share),
    })),
    containerUtxos,
    containerJunkTokenUtxos,
    inboxUtxos,
    inboxJunkTokenUtxos,
    containerBalance,
    inboxBalance,
    totalCoveredBalance: containerBalance + inboxBalance,
  };
}

export function buildKnownUtxoMap(
  entries: Array<{ utxos: Utxo[]; lockHex: string }>,
): Map<string, { lockHex: string; satoshis: bigint; hasToken: boolean }> {
  const map = new Map<string, { lockHex: string; satoshis: bigint; hasToken: boolean }>();
  for (const entry of entries) {
    for (const u of entry.utxos) {
      map.set(`${u.txid.toLowerCase()}:${u.vout}`, {
        lockHex: entry.lockHex,
        satoshis: u.satoshis,
        hasToken: u.token !== undefined,
      });
    }
  }
  return map;
}

export async function inspectTransactionAccounting(
  provider: NetworkProvider,
  txid: string,
  knownUtxos?: Map<string, { lockHex: string; satoshis: bigint; hasToken: boolean }>,
): Promise<TxAccountingBreakdown> {
  const rawHex = await provider.getRawTransaction(txid);
  const decoded = decodeTransaction(hexToBin(rawHex));
  if (typeof decoded === 'string') {
    throw new Error(`Failed to decode tx ${txid}: ${decoded}`);
  }
  const inputsByLock = await Promise.all(
    decoded.inputs.map(async (inp) => {
      // @bitauth/libauth decodeTransaction returns outpointTransactionHash in display byte order.
      const prevTxid = binToHex(inp.outpointTransactionHash);
      const outpointKey = `${prevTxid.toLowerCase()}:${inp.outpointIndex}`;
      const prevRaw = await provider.getRawTransaction(prevTxid);
      if (prevRaw) {
        const prevDecoded = decodeTransaction(hexToBin(prevRaw));
        if (typeof prevDecoded === 'string') {
          throw new Error(`Failed to decode prev tx ${prevTxid}: ${prevDecoded}`);
        }
        const prevOut = prevDecoded.outputs[inp.outpointIndex];
        return {
          lockHex: binToHex(prevOut.lockingBytecode),
          satoshis: prevOut.valueSatoshis,
          hasToken: prevOut.token !== undefined,
        };
      }
      const known = knownUtxos?.get(outpointKey);
      if (known) {
        return known;
      }
      const ledgerLookup = (provider as any).getLedgerOutput;
      if (typeof ledgerLookup === 'function') {
        const ledgerOut = await ledgerLookup.call(provider, prevTxid, inp.outpointIndex);
        if (ledgerOut) {
          return {
            lockHex: binToHex(ledgerOut.lockingBytecode),
            satoshis: ledgerOut.valueSatoshis,
            hasToken: ledgerOut.token !== undefined,
          };
        }
      }
      // If an input has no raw tx AND wasn't in our pre-send UTXO snapshot on MockNetworkProvider,
      // check unlocking script: SolidCash dummy funders use OP_TRUE (0x01 0x51).
      const unlockHex = binToHex(inp.unlockingBytecode);
      if (unlockHex === '0151') {
        return {
          lockHex: FEE_DUMMY_FUNDER_LOCKING_BYTECODE_HEX,
          satoshis: 0n,
          hasToken: false,
        };
      }
      throw new Error(`Missing previous transaction or ledger output for ${outpointKey}`);
    }),
  );

  const usedDummyFunder = inputsByLock.some(
    (inp) =>
      inp.lockHex === BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX ||
      inp.lockHex === FEE_DUMMY_FUNDER_LOCKING_BYTECODE_HEX,
  );

  const outputsByLock = decoded.outputs.map((out) => ({
    lockHex: binToHex(out.lockingBytecode),
    satoshis: out.valueSatoshis,
    hasToken: out.token !== undefined,
  }));

  const totalInputsSats = inputsByLock.reduce((s, i) => s + i.satoshis, 0n);
  const totalOutputsSats = outputsByLock.reduce((s, o) => s + o.satoshis, 0n);

  return {
    txid,
    txBytes: rawHex.length / 2,
    totalInputsSats,
    totalOutputsSats,
    feePaid: totalInputsSats - totalOutputsSats,
    inputsByLock,
    outputsByLock,
    usedDummyFunder,
  };
}

/**
 * Permissionless sweep from WalletBalanceInbox into the authenticated satoshiContainer.
 * Never requires owner authorization and never touches the master NFT (no deadline renewal).
 */
export async function sweepInbox(
  handle: WalletBalancePlanHandle,
  options: {
    mode?: 'auto' | 'self' | 'sponsored';
    sponsorSigner?: Signer;
    inboxUtxos?: Utxo[];
    feePerByte?: bigint;
    feeMargin?: bigint;
  } = {},
): Promise<SweepInboxResult> {
  const {
    mode = 'auto',
    sponsorSigner,
    feePerByte = 1n,
    feeMargin = 15n,
  } = options;

  const allInbox = options.inboxUtxos ??
    (await handle.provider.getUtxos(handle.inboxAddress)).filter((u) => !u.token);
  if (allInbox.length === 0) {
    throw new Error('No sweepable (tokenless) UTXOs at inboxAddress');
  }

  const allContainer = (await handle.provider.getUtxos(handle.satoshiContainerAddress))
    .filter((u) => !u.token);
  if (allContainer.length > 1) {
    throw new Error(
      `Expected at most 1 tokenless container UTXO for flag=0 merge, found ${allContainer.length}`,
    );
  }
  const existingContainer = allContainer[0];

  const inboxSatsSwept = allInbox.reduce((s, u) => s + u.satoshis, 0n);
  const containerSatsBefore = existingContainer?.satoshis ?? 0n;
  const protectedIn = inboxSatsSwept + containerSatsBefore;

  let chosenMode: 'self' | 'sponsored';
  let sponsorCoin: Utxo | undefined;
  if (mode === 'self') {
    chosenMode = 'self';
  } else {
    if (!sponsorSigner) {
      if (mode === 'sponsored') {
        throw new Error('Sponsored sweep requires sponsorSigner');
      }
      chosenMode = 'self';
    } else {
      const sponsorCoins = (await sponsorSigner.getUtxos())
        .filter((u) => !u.token && u.satoshis >= 1200n)
        .sort((a, b) => Number(b.satoshis - a.satoshis));
      if (sponsorCoins.length > 0) {
        chosenMode = 'sponsored';
        sponsorCoin = sponsorCoins[0];
      } else if (mode === 'sponsored') {
        throw new Error('Sponsor signer has no plain BCH UTXO >= 1200 sats for sponsored sweep');
      } else {
        chosenMode = 'self';
      }
    }
  }

  const mergeUnlocker = existingContainer
    ? createSatoshiContainerMergeUnlocker(handle.master, handle.metadata.categoryId, 0n)
    : undefined;

  if (chosenMode === 'self') {
    const buildSelfTx = (outputAmount: bigint) => {
      const builder = new TransactionBuilder({ provider: handle.provider });
      if (existingContainer && mergeUnlocker) {
        builder.addInput(existingContainer, mergeUnlocker);
      }
      for (const u of allInbox) {
        builder.addInput(u, handle.inbox.unlock.sweepToContainer());
      }
      builder.addOutput({ to: handle.satoshiContainerAddress, amount: outputAmount });
      return builder;
    };

    // Measure exact transaction byte length using valid placeholder output first.
    const probeHex = buildSelfTx(protectedIn).build();
    const byteLen = BigInt(probeHex.length / 2);
    const fee = byteLen * feePerByte + feeMargin;
    const maxCap = 400n + BigInt(allInbox.length) * handle.perInputFeeCap;
    if (fee > maxCap) {
      throw new Error(`Self-sweep fee ${fee} exceeds covenant cap ${maxCap}`);
    }
    const containerAfter = protectedIn - fee;
    if (containerAfter < CONTAINER_DUST_SATOSHIS) {
      throw new Error(
        `Self-sweep output ${containerAfter} below container dust (${CONTAINER_DUST_SATOSHIS}); use sponsored sweep`,
      );
    }

    const details = await buildSelfTx(containerAfter).send();
    const knownUtxos = buildKnownUtxoMap([
      { utxos: allInbox, lockHex: binToHex(handle.inboxLock) },
      ...(existingContainer ? [{ utxos: [existingContainer], lockHex: binToHex(handle.satoshiContainerLock) }] : []),
    ]);
    const accounting = await inspectTransactionAccounting(handle.provider, details.txid, knownUtxos);

    return {
      txid: details.txid,
      mode: 'self',
      sweptInboxUtxos: allInbox,
      mergedContainerUtxo: existingContainer,
      inboxSatsSwept,
      containerSatsBefore,
      containerSatsAfter: containerAfter,
      feePaid: accounting.feePaid,
      sponsorInputsSats: 0n,
      sponsorChangeSats: 0n,
      txBytes: accounting.txBytes,
      usedDummyFunder: accounting.usedDummyFunder,
    };
  }

  // Sponsored mode: outputs[0] keeps 100% of protectedIn; sponsor UTXO pays 100% of fee & change.
  const activeSponsor = sponsorSigner!;
  const coin = sponsorCoin!;
  const buildSponsoredTx = (changeAmount: bigint) => {
    const builder = new TransactionBuilder({ provider: handle.provider });
    if (existingContainer && mergeUnlocker) {
      builder.addInput(existingContainer, mergeUnlocker);
    }
    for (const u of allInbox) {
      builder.addInput(u, handle.inbox.unlock.sweepToContainer());
    }
    builder.addInput(coin, activeSponsor.unlockP2PKH());
    builder.addOutput({ to: handle.satoshiContainerAddress, amount: protectedIn });
    if (changeAmount >= P2PKH_DUST_SATOSHIS) {
      builder.addOutput({ to: activeSponsor.address, amount: changeAmount });
    }
    return builder;
  };

  // Measure with change output present (conservative byte estimate).
  const probeChange = coin.satoshis > P2PKH_DUST_SATOSHIS ? coin.satoshis - P2PKH_DUST_SATOSHIS : 0n;
  const probeHex = buildSponsoredTx(
    probeChange >= P2PKH_DUST_SATOSHIS ? probeChange : P2PKH_DUST_SATOSHIS,
  ).build();
  const estBytes = BigInt(probeHex.length / 2);
  const fee = estBytes * feePerByte + feeMargin;
  if (coin.satoshis < fee) {
    throw new Error(`Sponsor coin (${coin.satoshis} sats) insufficient for fee (${fee} sats)`);
  }
  const sponsorChange = coin.satoshis - fee >= P2PKH_DUST_SATOSHIS ? coin.satoshis - fee : 0n;
  const details = await buildSponsoredTx(sponsorChange).send();
  const knownUtxos = buildKnownUtxoMap([
    { utxos: allInbox, lockHex: binToHex(handle.inboxLock) },
    ...(existingContainer ? [{ utxos: [existingContainer], lockHex: binToHex(handle.satoshiContainerLock) }] : []),
    { utxos: [coin], lockHex: binToHex(activeSponsor.getLockingBytecode()) },
  ]);
  const accounting = await inspectTransactionAccounting(handle.provider, details.txid, knownUtxos);

  return {
    txid: details.txid,
    mode: 'sponsored',
    sweptInboxUtxos: allInbox,
    mergedContainerUtxo: existingContainer,
    inboxSatsSwept,
    containerSatsBefore,
    containerSatsAfter: protectedIn,
    feePaid: accounting.feePaid,
    sponsorInputsSats: coin.satoshis,
    sponsorChangeSats: sponsorChange,
    txBytes: accounting.txBytes,
    usedDummyFunder: accounting.usedDummyFunder,
  };
}

/**
 * Execute an owner-approved partial/full payment from the protected balance,
 * optionally sweeping pending inbox UTXOs first, and returning detailed accounting.
 */
export async function sendProtected(
  handle: WalletBalancePlanHandle,
  ownerSigner: Signer,
  recipientAddressOrLock: string | Uint8Array,
  amount: bigint,
  options: {
    locktime: number;
    autoSweepInbox?: boolean;
    sweepMode?: 'auto' | 'self' | 'sponsored';
  },
): Promise<{
  sweep?: SweepInboxResult;
  send: ProtectedSendResult;
}> {
  let sweep: SweepInboxResult | undefined;
  if (options.autoSweepInbox !== false) {
    const pendingInbox = (await handle.provider.getUtxos(handle.inboxAddress)).filter((u) => !u.token);
    if (pendingInbox.length > 0) {
      sweep = await sweepInbox(handle, {
        mode: options.sweepMode ?? 'auto',
        sponsorSigner: ownerSigner,
        inboxUtxos: pendingInbox,
      });
    }
  }

  const containerBeforeUtxos = (await handle.provider.getUtxos(handle.satoshiContainerAddress))
    .filter((u) => !u.token);
  const containerBefore = containerBeforeUtxos.reduce((s, u) => s + u.satoshis, 0n);

  const ownerPreUtxos = (await ownerSigner.getUtxos()).filter((u) => !u.token);
  const ownerLockHex = binToHex(ownerSigner.getLockingBytecode());
  const masterUtxos = await handle.provider.getUtxos(handle.master.tokenAddress);
  const dataNftUtxos = await handle.provider.getUtxos(handle.master.getDataNftAddress());

  const recipientLock = resolveLockingBytecode(recipientAddressOrLock);
  const fundedOwnerSigner = withFundedPlainUtxoPreference(ownerSigner);
  const connected = handle.master.connect(fundedOwnerSigner);
  // SolidCash 0.50.1 auto-derivation fails when tx.locktime is combined with this.transfer;
  // passing explicit .transfer(recipientLock, amount) keeps on-chain enforcement while avoiding the probe bug.
  const details = await (connected as any).call
    .send(recipientLock, amount)
    .transfer(recipientLock, amount)
    .setLocktime(options.locktime)
    .send();

  const knownUtxos = buildKnownUtxoMap([
    { utxos: ownerPreUtxos, lockHex: ownerLockHex },
    { utxos: containerBeforeUtxos, lockHex: binToHex(handle.satoshiContainerLock) },
    { utxos: masterUtxos, lockHex: handle.master.inner.lockingBytecode },
    { utxos: dataNftUtxos, lockHex: binToHex(resolveLockingBytecode(handle.master.getDataNftAddress())) },
  ]);
  const accounting = await inspectTransactionAccounting(handle.provider, details.txid, knownUtxos);

  const ownerInputsSats = accounting.inputsByLock
    .filter((i) => i.lockHex === ownerLockHex && !i.hasToken)
    .reduce((s, i) => s + i.satoshis, 0n);
  const ownerChangeSats = accounting.outputsByLock
    .filter((o) => o.lockHex === ownerLockHex && !o.hasToken)
    .reduce((s, o) => s + o.satoshis, 0n);

  const containerAfterUtxos = (await handle.provider.getUtxos(handle.satoshiContainerAddress))
    .filter((u) => !u.token);
  const containerAfter = containerAfterUtxos.reduce((s, u) => s + u.satoshis, 0n);
  const newDeadline = BigInt(await connected.state.deadline());

  return {
    sweep,
    send: {
      txid: details.txid,
      recipientLockHex: binToHex(recipientLock),
      amount,
      txBytes: accounting.txBytes,
      feePaid: accounting.feePaid,
      containerBefore,
      containerAfter,
      ownerInputsSats,
      ownerChangeSats,
      ownerNetSpent: ownerInputsSats - ownerChangeSats,
      newDeadline,
      usedDummyFunder: accounting.usedDummyFunder,
      details,
    },
  };
}
