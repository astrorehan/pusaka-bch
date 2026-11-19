import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth/build/lib/address/cash-address.js';
import { hexToBin } from '@bitauth/libauth/build/lib/format/hex.js';

export function addressPrefix(network: string) {
  if (network === 'mainnet') return 'bitcoincash';
  if (network === 'regtest') return 'bchreg';
  return 'bchtest';
}

export function toBytes20(value: Uint8Array | string): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.length !== 20) throw new Error(`Expected 20-byte PKH, got ${value.length} bytes`);
    return value;
  }
  const clean = value.trim();
  if (/^(0x)?[0-9a-fA-F]{40}$/.test(clean)) return hexToBin(clean.replace(/^0x/, ''));
  const decoded = decodeCashAddress(clean);
  if (typeof decoded === 'string') throw new Error(`Invalid P2PKH address: ${decoded}`);
  if (decoded.type !== 'p2pkh' && decoded.type !== 'p2pkhWithTokens') {
    throw new Error(`Expected P2PKH CashAddress, got ${decoded.type}`);
  }
  return decoded.payload;
}

export function p2pkhCashAddressFromPkh(pkh: Uint8Array | string, network = 'chipnet'): string {
  const encoded = encodeCashAddress({ prefix: addressPrefix(network), type: 'p2pkh', payload: toBytes20(pkh) });
  if (typeof encoded === 'string') throw new Error(encoded);
  return encoded.address;
}
