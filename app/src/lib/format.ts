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
  const s = input.trim();
  if (!/^\d{0,8}(\.\d{0,8})?$/.test(s) || s === '' || s === '.') return null;
  const [w, f = ''] = s.split('.');
  const sats = BigInt(w || '0') * SATS_PER_BCH + BigInt(f.padEnd(8, '0'));
  return sats <= 21_000_000n * SATS_PER_BCH ? sats : null;
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

/**
 * Seconds -> "1 year", "18 months", "30 days", "2 hours". Years and months are used only when the period is a
 * whole number of them, so 18 months never reads as "1 year".
 */
export function formatDuration(seconds: bigint): string {
  const s = Number(seconds < 0n ? -seconds : seconds);
  const DAY = 86400;
  const word = (n: number, name: string) => `${n} ${name}${n === 1 ? '' : 's'}`;
  const whole = (size: number, slack: number) => {
    const n = Math.round(s / size);
    return n >= 1 && Math.abs(s - n * size) <= slack ? n : 0;
  };
  // Average Gregorian year and month, as the create flow counts; 365 days still reads as a year.
  const years = whole(31_556_952, 6 * 3600);
  if (years) return word(years, 'year');
  const months = whole(2_629_746, 3600);
  if (months) return word(months, 'month');
  const units: [number, string][] = [[DAY, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [size, name] of units) {
    if (s >= size) return word(Math.floor(s / size), name);
  }
  return s === 1 ? '1 second' : `${s} seconds`;
}

/** "17 May 2028": day first, the same order as the plan page's dates. */
export function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function explorerTxUrl(txid: string, network: 'mainnet' | 'chipnet'): string {
  return network === 'mainnet' ? `https://explorer.bch.ninja/tx/${txid}` : `https://chipnet.chaingraph.cash/tx/${txid}`;
}
