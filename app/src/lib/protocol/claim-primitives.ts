import {
  TransactionBuilder,
  type NetworkProvider,
  type Utxo,
  type Unlocker,
} from "@solidcash/solidcash";
import { hexToBin, binToHex } from "@bitauth/libauth";
export const BIP68_DISABLE_FLAG = 0x80000000;
export const BIP68_TIME_FLAG = 0x00400000; // 4_194_304
export const BIP68_MASK = 0x0000ffff; // 65_535
export const BIP68_UNIT_SECONDS = 512;
export const MAX_BIP68_UNITS = 0xffff; // 65_535 (~388.355 days)
export const MIN_REVIEW_SECONDS = BIP68_UNIT_SECONDS; // 512s (1 unit)
export const MAX_REVIEW_SECONDS = MAX_BIP68_UNITS * BIP68_UNIT_SECONDS; // 33_553_920s

export interface Bip68SequenceEncoding {
  sequence: number;
  units: number;
  effectiveSeconds: number;
  requestedSeconds: number;
}

export function encodeReviewDurationToBip68Sequence(
  durationSeconds: number,
): Bip68SequenceEncoding {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(
      `Review duration must be > 0 seconds; got ${durationSeconds}`,
    );
  }
  const units = Math.ceil(durationSeconds / BIP68_UNIT_SECONDS);
  if (units < 1 || units > MAX_BIP68_UNITS) {
    throw new Error(
      `Review duration ${durationSeconds}s requires ${units} 512s units, outside BIP68 range [1, ${MAX_BIP68_UNITS}]`,
    );
  }
  const sequence = (BIP68_TIME_FLAG | units) >>> 0;
  return {
    sequence,
    units,
    effectiveSeconds: units * BIP68_UNIT_SECONDS,
    requestedSeconds: durationSeconds,
  };
}

export function decodeBip68TimeSequence(sequence: number): {
  disabled: boolean;
  isTimeBased: boolean;
  units: number;
  effectiveSeconds: number;
} {
  const u = sequence >>> 0;
  const disabled = (u & BIP68_DISABLE_FLAG) !== 0;
  const isTimeBased = (u & BIP68_TIME_FLAG) !== 0;
  const units = u & BIP68_MASK;
  return {
    disabled,
    isTimeBased,
    units,
    effectiveSeconds: isTimeBased ? units * BIP68_UNIT_SECONDS : units,
  };
}

/**
 * CashTokens VM opcodes (`OP_UTXOTOKENCATEGORY` / `OP_OUTPUTTOKENCATEGORY`) push
 * the 32-byte category ID in raw wire byte order (reversed from display txid hex).
 */
export function categoryDisplayHexToVmBytes(categoryHex: string): Uint8Array {
  const bytes = hexToBin(categoryHex);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32-byte category hex; got ${bytes.length} bytes`);
  }
  return bytes.reverse();
}

export function categoryVmBytesToDisplayHex(vmBytes: Uint8Array): string {
  if (vmBytes.length !== 32) {
    throw new Error(
      `Expected 32-byte VM category; got ${vmBytes.length} bytes`,
    );
  }
  return binToHex(Uint8Array.from(vmBytes).reverse());
}

export async function ensureGenesisUtxo(params: {
  provider: NetworkProvider;
  ownerAddress: string;
  ownerUnlocker: Unlocker;
  minimumSats: bigint;
  fee?: bigint;
}): Promise<{ genesisUtxo: Utxo; preTxid?: string }> {
  const fee = params.fee ?? 500n;
  const utxos = await params.provider.getUtxos(params.ownerAddress);
  const eligible = utxos.find(
    (u) => !u.token && u.vout === 0 && u.satoshis >= params.minimumSats,
  );
  if (eligible) return { genesisUtxo: eligible };

  const funding = utxos
    .filter((u) => !u.token && u.satoshis >= params.minimumSats + fee)
    .sort((a, b) => Number(b.satoshis - a.satoshis))[0];
  if (!funding) {
    throw new Error(
      `Owner ${params.ownerAddress} lacks a plain UTXO with >= ${params.minimumSats + fee} sats`,
    );
  }
  const preTx = new TransactionBuilder({ provider: params.provider })
    .addInput(funding, params.ownerUnlocker)
    .addOutput({ to: params.ownerAddress, amount: funding.satoshis - fee });
  const details = await preTx.send();
  const refreshed = await params.provider.getUtxos(params.ownerAddress);
  const created = refreshed.find(
    (u) => u.txid === details.txid && u.vout === 0,
  );
  if (!created) {
    throw new Error(
      `Failed to locate vout=0 genesis UTXO after pre-split ${details.txid}`,
    );
  }
  return { genesisUtxo: created, preTxid: details.txid };
}
