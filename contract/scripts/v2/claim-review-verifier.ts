import {
  TransactionBuilder,
  type NetworkProvider,
} from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import {
  binToHex,
  createVirtualMachineBch2026,
  decodeTransactionBch,
  encodeTransaction,
  hexToBin,
  type Output as LibauthOutput,
  type Transaction as LibauthTransaction,
} from '@bitauth/libauth';
import {
  checkDustOutputs,
  checkLocktimeFinality,
  checkMinRelayFee,
  checkSequenceLocks,
  DEFAULT_MIN_RELAY_FEE_PER_KB,
  MTP_BLOCK_COUNT,
  SEQUENCE_LOCKTIME_DISABLE_FLAG,
  SEQUENCE_LOCKTIME_GRANULARITY,
  SEQUENCE_LOCKTIME_MASK,
  SEQUENCE_LOCKTIME_TYPE_FLAG,
} from '@mem-cash/validation';

export interface StrictSourceOutputInfo {
  sourceOutput: LibauthOutput;
  height: number; // 0 = unconfirmed mempool UTXO
  prevMtp: number; // MTP(height - 1) for confirmed, or spendMtp for unconfirmed
}

export interface StrictVerifyResult {
  ok: boolean;
  stage?: 'decode' | 'source-output' | 'vm' | 'locktime' | 'bip68-sequence' | 'dust';
  error?: string;
  inputIndex?: number;
  txid?: string;
  sizeBytes?: number;
  spendHeight?: number;
  spendMtp?: number;
  inputAges?: Array<{
    inputIndex: number;
    outpoint: string;
    sequenceNumber: number;
    confirmedHeight: number;
    prevMtp: number;
    elapsedMtpSeconds: number;
    requiredSeconds?: number;
  }>;
}

/**
 * Strict BCH 2026 consensus + BIP68 verification harness around `MockNetworkProvider`.
 *
 * Why this exists (without patching `node_modules`):
 * 1. `@mem-cash/core`'s `utxoToSourceOutput()` omits `medianTimePast`, so raw
 *    `MockNetworkProvider` always evaluates `prevMtp = 0` in `checkSequenceLocks()`
 *    and lets 0-second-old UTXOs pass time-based `OP_CHECKSEQUENCEVERIFY`.
 * 2. `MockNetworkProvider.keepSyntheticTimeWindow()` rewrites the last 11 block
 *    headers' timestamps on every `sendRawTransaction()` / `mine()`.
 *
 * This harness maintains an immutable historical block timestamp ledger and evaluates
 * real `@bitauth/libauth` `BCH_2026_05` VM + real `@mem-cash/validation` `checkSequenceLocks`
 * with true `prevMtp = MTP(utxoHeight - 1)` (and `prevMtp = spendMtp` for unconfirmed UTXOs).
 */
export class StrictBip68ChainVerifier {
  readonly provider: MockNetworkProvider;
  private readonly vm = createVirtualMachineBch2026(true);
  private readonly blockTimestamps = new Map<number, number>();
  private readonly outpointRecords = new Map<
    string,
    { height: number; prevMtp: number; blockTimestamp: number }
  >();
  private trackedTipHeight = 0;

  constructor(provider: MockNetworkProvider) {
    this.provider = provider;
  }

  async init(): Promise<void> {
    const height = await this.provider.getBlockHeight();
    const ts = this.provider.getBlockTime();
    for (let h = Math.max(0, height - 20); h <= height; h++) {
      this.blockTimestamps.set(h, ts);
    }
    this.trackedTipHeight = height;
  }

  private async syncTipFallback(): Promise<number> {
    const actualHeight = await this.provider.getBlockHeight();
    const ts = this.provider.getBlockTime();
    if (actualHeight > this.trackedTipHeight) {
      for (let h = this.trackedTipHeight + 1; h <= actualHeight; h++) {
        if (!this.blockTimestamps.has(h)) {
          this.blockTimestamps.set(h, ts);
        }
      }
      this.trackedTipHeight = actualHeight;
    }
    return actualHeight;
  }

  getMtpAtHeight(height: number): number {
    const window: number[] = [];
    const start = Math.max(0, height - (MTP_BLOCK_COUNT - 1));
    for (let h = start; h <= height; h++) {
      const ts = this.blockTimestamps.get(h);
      if (ts !== undefined) {
        window.push(ts);
      }
    }
    if (window.length === 0) {
      return this.provider.getBlockTime();
    }
    window.sort((a, b) => a - b);
    return window[Math.floor(window.length / 2)];
  }

  async getCurrentSpendContext(): Promise<{ spendHeight: number; spendMtp: number }> {
    const tip = await this.syncTipFallback();
    return {
      spendHeight: tip + 1,
      spendMtp: this.getMtpAtHeight(tip),
    };
  }

  /**
   * Record an externally funded/created UTXO (e.g. via `provider.addUtxo`) as confirmed
   * at a known height, or mark it unconfirmed (`height = 0`).
   */
  async recordOutpoint(txid: string, vout: number, confirmedHeight?: number): Promise<void> {
    const tip = await this.syncTipFallback();
    const height = confirmedHeight ?? tip;
    if (height <= 0) {
      this.outpointRecords.set(`${txid}:${vout}`, {
        height: 0,
        prevMtp: this.getMtpAtHeight(tip),
        blockTimestamp: this.provider.getBlockTime(),
      });
      return;
    }
    const prevMtp = this.getMtpAtHeight(Math.max(0, height - 1));
    const blockTimestamp = this.blockTimestamps.get(height) ?? this.provider.getBlockTime();
    this.outpointRecords.set(`${txid}:${vout}`, { height, prevMtp, blockTimestamp });
  }

  /**
   * Advance the chain timestamp by `deltaSeconds` and mine `blocks` blocks,
   * preserving immutable historical block timestamps for MTP calculation.
   *
   * Note: With Bitcoin Cash's 11-block median, mining 6 blocks at `T + delta`
   * shifts MTP to `T + delta`, whereas mining <= 5 blocks keeps MTP at `T`.
   */
  async advanceTimeAndMine(deltaSeconds: number, blocks = 6): Promise<{
    height: number;
    tipTimestamp: number;
    mtp: number;
  }> {
    if (blocks < 1) {
      throw new Error(`Must mine >= 1 block to advance chain; got ${blocks}`);
    }
    await this.syncTipFallback();
    const nextTs =
      deltaSeconds !== 0
        ? this.provider.increaseTime(deltaSeconds)
        : this.provider.getBlockTime();
    for (let i = 0; i < blocks; i++) {
      await this.provider.mine(1);
      this.trackedTipHeight += 1;
      this.blockTimestamps.set(this.trackedTipHeight, nextTs);
    }
    return {
      height: this.trackedTipHeight,
      tipTimestamp: nextTs,
      mtp: this.getMtpAtHeight(this.trackedTipHeight),
    };
  }

  /**
   * Resolve source outputs and verify a raw or decoded transaction against:
   * - `@bitauth/libauth` `BCH_2026_05` VM (every input)
   * - `@mem-cash/validation` `checkLocktimeFinality`
   * - `@mem-cash/validation` `checkSequenceLocks` with true historical `prevMtp`
   * - `@mem-cash/validation` `checkDustOutputs`
   */
  async verifyTxStrict(
    txHexOrTx: string | LibauthTransaction,
    overrides?: {
      sourceOutputs?: LibauthOutput[];
      outpointOverrides?: Map<string, { height: number; prevMtp: number }>;
    },
  ): Promise<StrictVerifyResult> {
    let tx: LibauthTransaction;
    let rawBytes: Uint8Array;
    if (typeof txHexOrTx === 'string') {
      rawBytes = hexToBin(txHexOrTx);
      const decoded = decodeTransactionBch(rawBytes);
      if (typeof decoded === 'string') {
        return { ok: false, stage: 'decode', error: decoded };
      }
      tx = decoded;
    } else {
      tx = txHexOrTx;
      rawBytes = encodeTransaction(tx);
    }

    const { spendHeight, spendMtp } = await this.getCurrentSpendContext();
    const sourceOutputs: LibauthOutput[] = [];
    const sequenceInputs: Array<{
      sequenceNumber: number;
      height: number;
      medianTimePast: number;
    }> = [];
    const inputAges: NonNullable<StrictVerifyResult['inputAges']> = [];

    for (let i = 0; i < tx.inputs.length; i++) {
      const inp = tx.inputs[i];
      const txid = binToHex(inp.outpointTransactionHash);
      const key = `${txid}:${inp.outpointIndex}`;

      let so = overrides?.sourceOutputs?.[i];
      if (!so) {
        const ledger = await this.provider.getLedgerOutput(txid, inp.outpointIndex);
        if (!ledger) {
          return {
            ok: false,
            stage: 'source-output',
            inputIndex: i,
            error: `Missing source output for ${key}`,
          };
        }
        so = {
          lockingBytecode: ledger.lockingBytecode,
          valueSatoshis: ledger.satoshis,
          token: ledger.token
            ? {
                category: hexToBin(ledger.token.category),
                amount: ledger.token.amount,
                nft: ledger.token.nft
                  ? {
                      capability: ledger.token.nft.capability,
                      commitment: hexToBin(ledger.token.nft.commitment),
                    }
                  : undefined,
              }
            : undefined,
        };
      }
      sourceOutputs.push(so);

      const overrideAge = overrides?.outpointOverrides?.get(key);
      const recorded = overrideAge ?? this.outpointRecords.get(key);
      // Fallback: if coin was added via MockNetworkProvider before any explicit recordOutpoint,
      // treat as confirmed at initial tip - 10 if ledger exists; if explicitly height=0, unconfirmed.
      const height = recorded ? recorded.height : Math.max(1, this.trackedTipHeight - 10);
      const prevMtp = recorded
        ? recorded.height <= 0
          ? spendMtp
          : recorded.prevMtp
        : this.getMtpAtHeight(Math.max(0, height - 1));

      sequenceInputs.push({
        sequenceNumber: inp.sequenceNumber,
        height,
        medianTimePast: prevMtp,
      });

      const disabled = (inp.sequenceNumber & SEQUENCE_LOCKTIME_DISABLE_FLAG) !== 0;
      const isTime = (inp.sequenceNumber & SEQUENCE_LOCKTIME_TYPE_FLAG) !== 0;
      const units = inp.sequenceNumber & SEQUENCE_LOCKTIME_MASK;
      inputAges.push({
        inputIndex: i,
        outpoint: key,
        sequenceNumber: inp.sequenceNumber,
        confirmedHeight: height,
        prevMtp,
        elapsedMtpSeconds: spendMtp - prevMtp,
        requiredSeconds: !disabled && isTime ? units * SEQUENCE_LOCKTIME_GRANULARITY : undefined,
      });
    }

    // 1. Evaluate every input with libauth BCH_2026_05 VM
    for (let i = 0; i < tx.inputs.length; i++) {
      const vmResult = this.vm.verify({
        inputIndex: i,
        sourceOutputs,
        transaction: tx,
      });
      if (typeof vmResult === 'string') {
        return {
          ok: false,
          stage: 'vm',
          inputIndex: i,
          error: vmResult,
          sizeBytes: rawBytes.length,
          spendHeight,
          spendMtp,
          inputAges,
        };
      }
    }

    // 2. Locktime finality against actual spendHeight / spendMtp
    const locktimeCheck = checkLocktimeFinality(
      tx.locktime,
      tx.inputs.map((inp) => ({ sequenceNumber: inp.sequenceNumber })),
      spendHeight,
      spendMtp,
    );
    if (!locktimeCheck.ok) {
      return {
        ok: false,
        stage: 'locktime',
        error: locktimeCheck.debugMessage ?? locktimeCheck.error,
        sizeBytes: rawBytes.length,
        spendHeight,
        spendMtp,
        inputAges,
      };
    }

    // 3. Strict BIP68 sequence lock enforcement with real prevMtp
    const seqCheck = checkSequenceLocks(tx.version, sequenceInputs, spendHeight, spendMtp);
    if (!seqCheck.ok) {
      return {
        ok: false,
        stage: 'bip68-sequence',
        error: seqCheck.debugMessage ?? seqCheck.error,
        sizeBytes: rawBytes.length,
        spendHeight,
        spendMtp,
        inputAges,
      };
    }

    // 4. Dust output policy
    const dustCheck = checkDustOutputs(
      tx.outputs.map((out) => ({
        valueSatoshis: out.valueSatoshis,
        lockingBytecode: out.lockingBytecode,
      })),
    );
    if (!dustCheck.ok) {
      return {
        ok: false,
        stage: 'dust',
        error: dustCheck.debugMessage ?? dustCheck.error,
        sizeBytes: rawBytes.length,
        spendHeight,
        spendMtp,
        inputAges,
      };
    }

    // 5. Minimum relay fee check
    const totalIn = sourceOutputs.reduce((s, o) => s + o.valueSatoshis, 0n);
    const totalOut = tx.outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
    const fee = totalIn - totalOut;
    const feeCheck = checkMinRelayFee(fee, rawBytes.length, DEFAULT_MIN_RELAY_FEE_PER_KB);
    if (!feeCheck.ok) {
      return {
        ok: false,
        stage: 'dust',
        error: feeCheck.debugMessage ?? feeCheck.error,
        sizeBytes: rawBytes.length,
        spendHeight,
        spendMtp,
        inputAges,
      };
    }

    return {
      ok: true,
      sizeBytes: rawBytes.length,
      spendHeight,
      spendMtp,
      inputAges,
    };
  }

  async sendTxStrict(txHex: string): Promise<{
    txid: string;
    txHex: string;
    sizeBytes: number;
    confirmedHeight: number;
    prevMtpForOutputs: number;
    spendMtpAtBroadcast: number;
  }> {
    const strict = await this.verifyTxStrict(txHex);
    if (!strict.ok) {
      throw new Error(`Strict consensus rejection [${strict.stage}]: ${strict.error}`);
    }

    const rawBytes = hexToBin(txHex);
    const decoded = decodeTransactionBch(rawBytes);
    if (typeof decoded === 'string') {
      throw new Error(decoded);
    }

    await this.syncTipFallback();
    const blockTs = this.provider.getBlockTime();
    const prevMtpForOutputs = this.getMtpAtHeight(this.trackedTipHeight);

    const txid = await this.provider.sendRawTransaction(txHex);
    const actualHeight = await this.provider.getBlockHeight();
    // MockNetworkProvider.sendRawTransaction auto-mines 1 block at current blockTime
    for (let h = this.trackedTipHeight + 1; h <= actualHeight; h++) {
      this.blockTimestamps.set(h, blockTs);
    }
    this.trackedTipHeight = actualHeight;

    for (let vout = 0; vout < decoded.outputs.length; vout++) {
      this.outpointRecords.set(`${txid}:${vout}`, {
        height: actualHeight,
        prevMtp: prevMtpForOutputs,
        blockTimestamp: blockTs,
      });
    }

    return {
      txid,
      txHex,
      sizeBytes: rawBytes.length,
      confirmedHeight: actualHeight,
      prevMtpForOutputs,
      spendMtpAtBroadcast: prevMtpForOutputs,
    };
  }

  async sendBuilderStrict(builder: TransactionBuilder) {
    const txHex = builder.build();
    return this.sendTxStrict(txHex);
  }
}

export function buildMutatedTxHex(
  txHex: string,
  mutate: (tx: LibauthTransaction) => LibauthTransaction,
): string {
  const decoded = decodeTransactionBch(hexToBin(txHex));
  if (typeof decoded === 'string') {
    throw new Error(`Failed to decode tx for mutation: ${decoded}`);
  }
  const mutated = mutate(decoded);
  return binToHex(encodeTransaction(mutated));
}
