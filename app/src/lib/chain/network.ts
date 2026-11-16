// Network access for the chain layer: one Electrum provider per app load, the network clock, address helpers.
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import {
  binToHex,
  cashAddressToLockingBytecode,
  decodeCashAddress,
  encodeCashAddress,
  hash160,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import type { NetworkName } from '../types';

let provider: ElectrumNetworkProvider | null = null;
let providerNetwork: NetworkName | null = null;

export function getProvider(network: NetworkName): ElectrumNetworkProvider {
  if (!provider || providerNetwork !== network) {
    provider = new ElectrumNetworkProvider(network);
    providerNetwork = network;
  }
  return provider;
}

export const addressPrefix = (network: NetworkName) => (network === 'mainnet' ? 'bitcoincash' : 'bchtest');

/** The 20-byte public key hash inside a P2PKH cashaddr; throws for anything else. */
export function pkhOfAddress(address: string): Uint8Array {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error(`Not a BCH address: ${decoded}`);
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') throw new Error('Only ordinary (P2PKH) BCH addresses can be heirs or owners.');
  return decoded.payload;
}

export function lockOfAddress(address: string): Uint8Array {
  const r = cashAddressToLockingBytecode(address);
  if (typeof r === 'string') throw new Error(r);
  return r.bytecode;
}

export function addressOfPubkey(publicKey: Uint8Array, network: NetworkName): string {
  return encodeCashAddress({ prefix: addressPrefix(network), type: 'p2pkh', payload: hash160(publicKey) }).address;
}

export function addressOfLock(lock: Uint8Array, network: NetworkName): string | null {
  const r = lockingBytecodeToCashAddress({ bytecode: lock, prefix: addressPrefix(network) });
  return typeof r === 'string' ? null : r.address;
}

/** Plain (token-free) satoshis at an address. */
export async function plainBalance(network: NetworkName, address: string): Promise<bigint> {
  const utxos = await getProvider(network).getUtxos(address);
  return utxos.filter((u) => !u.token).reduce((t, u) => t + u.satoshis, 0n);
}

/**
 * The network clock: median time past of the last 11 blocks. A timestamp locktime is final only below it,
 * so every time check in the contract is measured against this, not the wall clock (about an hour behind on Chipnet).
 */
export async function medianTimePast(network: NetworkName): Promise<bigint> {
  const p = getProvider(network);
  const height = Number(await p.getBlockHeight());
  const heights = Array.from({ length: 11 }, (_, i) => height - i);
  const headers = await Promise.all(heights.map((h) => p.performRequest('blockchain.block.header', h)));
  const times = headers.map((hex) => {
    const bytes = hexToBin(String(hex));
    return new DataView(bytes.buffer, bytes.byteOffset).getUint32(68, true);
  });
  times.sort((a, b) => a - b);
  return BigInt(times[5]);
}

export { binToHex, hexToBin };
