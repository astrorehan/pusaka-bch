// CashAddr checks for heir addresses: prefix, alphabet, length and checksum (the BCH spec's polymod).
// Accepts P2PKH and P2SH, plain and token-aware. No network calls.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];

export function polymod(values: number[]): bigint {
  let c = 1n;
  for (const v of values) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
    for (let i = 0; i < 5; i++) if ((c0 >> BigInt(i)) & 1n) c ^= GEN[i];
  }
  return c ^ 1n;
}

export function prefixValues(prefix: string): number[] {
  return [...prefix].map((ch) => ch.charCodeAt(0) & 31).concat(0);
}

export type AddressCheck =
  | { ok: true; address: string }
  | { ok: false; why: 'empty' | 'invalid' | 'wrong-network' };

const PREFIX = { mainnet: 'bitcoincash', chipnet: 'bchtest' } as const;

/** Normalises (lower case, prefix added if missing) and checks an address for `network`. */
export function checkAddress(raw: string, network: 'mainnet' | 'chipnet'): AddressCheck {
  const s = raw.trim().toLowerCase();
  if (!s) return { ok: false, why: 'empty' };
  const want = PREFIX[network];
  let prefix: string = want;
  let body = s;
  if (s.includes(':')) {
    [prefix, body] = s.split(':', 2);
    if (prefix !== 'bitcoincash' && prefix !== 'bchtest' && prefix !== 'bchreg') return { ok: false, why: 'invalid' };
  }
  // 34 bytes of payload (version + 20-byte hash) + 8 checksum chars = 42 chars. 32-byte hashes give 61.
  if (body.length !== 42 && body.length !== 61) return { ok: false, why: 'invalid' };
  const values: number[] = [];
  for (const ch of body) {
    const v = CHARSET.indexOf(ch);
    if (v < 0) return { ok: false, why: 'invalid' };
    values.push(v);
  }
  if (!'qpzr'.includes(body[0]) && body.length === 42) return { ok: false, why: 'invalid' };
  if (polymod(prefixValues(prefix).concat(values)) !== 0n) {
    // Right body, other network? Say that instead of "invalid".
    const other = prefix === 'bitcoincash' ? 'bchtest' : 'bitcoincash';
    if (!s.includes(':') && polymod(prefixValues(other).concat(values)) === 0n) return { ok: false, why: 'wrong-network' };
    return { ok: false, why: 'invalid' };
  }
  if (prefix !== want) return { ok: false, why: 'wrong-network' };
  return { ok: true, address: `${prefix}:${body}` };
}
