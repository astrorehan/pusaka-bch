// Display formatting. Money stays bigint satoshis until this point.

export const SATS_PER_BCH = 100_000_000n;
export const DUST = 546n;

/** 25_000_000n -> "0.25". Up to 8 decimals, trailing zeros dropped. */
export function formatBch(sats: bigint): string {
  const neg = sats < 0n;
  const abs = neg ? -sats : sats;
  const whole = abs / SATS_PER_BCH;
  const frac = (abs % SATS_PER_BCH).toString().padStart(8, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? '.' + frac : ''}`;
}

/** "0.25" -> 25_000_000n. Returns null for invalid input or more than 8 decimals. */
export function parseBch(input: string): bigint | null {
  const s = input.trim().replace(/,/g, '');
  if (!/^\d*(\.\d{0,8})?$/.test(s) || s === '' || s === '.') return null;
  const [w, f = ''] = s.split('.');
  return BigInt(w || '0') * SATS_PER_BCH + BigInt(f.padEnd(8, '0'));
}

/** Dollar value, always approximate. `usdPerBch` may be unknown. */
export function formatUsd(sats: bigint, usdPerBch: number | null): string | null {
  if (usdPerBch == null) return null;
  const usd = (Number(sats) / 1e8) * usdPerBch;
  const digits = usd < 1 ? 3 : 2;
  return `≈ $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

/** "bitcoincash:qr4x9...8f2k": prefix kept, shortened in the middle. */
export function shortAddress(address: string, head = 4, tail = 4): string {
  const [prefix, body] = address.includes(':') ? address.split(':') : ['', address];
  if (body.length <= head + tail + 1) return address;
  return `${prefix ? prefix + ':' : ''}${body.slice(0, head)}…${body.slice(-tail)}`;
}

/** Seconds -> "30 days", "2 hours". */
export function formatDuration(seconds: bigint): string {
  const s = Number(seconds < 0n ? -seconds : seconds);
  const units: [number, string][] = [[86400 * 365, 'year'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size);
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return 'less than a minute';
}

export function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function explorerTxUrl(txid: string, network: 'mainnet' | 'chipnet'): string {
  return network === 'mainnet' ? `https://explorer.bch.ninja/tx/${txid}` : `https://chipnet.chaingraph.cash/tx/${txid}`;
}
