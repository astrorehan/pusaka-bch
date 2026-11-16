// Checks for faraid.ts and cashaddr.ts. Not bundled. Run from app/:
//   node src/screens/create/faraid.check.ts
import { faraid, EMPTY_FAMILY, type Family } from './faraid.ts';
import { checkAddress, polymod, prefixValues } from './cashaddr.ts';

let failed = 0;
function expect(name: string, family: Partial<Family>, want: Record<string, string> | string) {
  const r = faraid({ ...EMPTY_FAMILY, ...family });
  let got: Record<string, string> | string;
  if (!r.ok) got = r.kind;
  else {
    got = Object.fromEntries(r.heirs.map((h) => [h.label, `${h.share}/${r.total}`]));
    const sum = r.heirs.reduce((s, h) => s + h.share, 0n);
    if (sum !== r.total) { failed++; console.log(`FAIL ${name}: shares sum to ${sum}, not ${r.total}`); return; }
  }
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     want ${JSON.stringify(want)}\n     got  ${JSON.stringify(got)}`}`);
}

// The Chipnet test family.
expect('wife, father, mother, 2 sons, 1 daughter (Chipnet test)', { spouse: 'wife', father: true, mother: true, sons: 2, daughters: 1 },
  { Wife: '15/120', Father: '20/120', Mother: '20/120', 'Son 1': '26/120', 'Son 2': '26/120', Daughter: '13/120' });
// Sons get twice daughters.
expect('1 son, 2 daughters', { sons: 1, daughters: 2 }, { Son: '2/4', 'Daughter 1': '1/4', 'Daughter 2': '1/4' });
expect('husband, 1 son', { spouse: 'husband', sons: 1 }, { Husband: '1/4', Son: '3/4' });
// Daughters' fixed shares, father takes 1/6 and the rest.
expect('1 daughter, father', { daughters: 1, father: true }, { Father: '1/2', Daughter: '1/2' }); // father: 1/6 + the rest (1/3)
// Awl: wife, 2 daughters, father, mother (the Minbariyya case, 27 parts).
expect('awl: wife, 2 daughters, both parents', { spouse: 'wife', daughters: 2, father: true, mother: true },
  { Wife: '3/27', Father: '4/27', Mother: '4/27', 'Daughter 1': '8/27', 'Daughter 2': '8/27' });
expect('awl: husband, 2 sisters', { spouse: 'husband', sisters: 2 }, { Husband: '3/7', 'Sister 1': '2/7', 'Sister 2': '2/7' });
// The two Umar cases.
expect('husband, father, mother', { spouse: 'husband', father: true, mother: true }, { Husband: '3/6', Father: '2/6', Mother: '1/6' });
expect('wife, father, mother', { spouse: 'wife', father: true, mother: true }, { Wife: '1/4', Father: '2/4', Mother: '1/4' });
// Radd: the rest goes back, not to the spouse.
expect('radd: daughter, mother', { daughters: 1, mother: true }, { Mother: '1/4', Daughter: '3/4' });
expect('radd: husband, mother', { spouse: 'husband', mother: true }, { Husband: '1/2', Mother: '1/2' });
// Siblings.
expect('father excludes brothers; 2 siblings still lower the mother', { father: true, mother: true, brothers: 2 }, { Father: '5/6', Mother: '1/6' });
expect('brother and sister share the rest 2:1', { mother: true, brothers: 1, sisters: 1 }, { Mother: '3/18', Brother: '10/18', Sister: '5/18' });
expect('sister with a daughter takes the rest', { daughters: 1, sisters: 1 }, { Daughter: '1/2', Sister: '1/2' });
expect('son excludes sisters', { sons: 1, sisters: 2 }, { Son: '1/1' });
expect('4 wives, 2 sons', { spouse: 'wife', wives: 4, sons: 2 }, { 'Wife 1': '1/32', 'Wife 2': '1/32', 'Wife 3': '1/32', 'Wife 4': '1/32', 'Son 1': '14/32', 'Son 2': '14/32' });
// Outside what it covers.
expect('empty family', {}, 'empty');
expect('only a spouse', { spouse: 'wife' }, 'unsupported');
expect('more than 10 heirs', { spouse: 'wife', sons: 6, daughters: 4 }, 'too-many');

// Addresses: encode a few with the same polymod and check them back.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function encode(prefix: string, hash: number[], version = 0): string {
  const bytes = [version, ...hash];
  const data: number[] = []; let acc = 0, bits = 0;
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; data.push((acc >> bits) & 31); } }
  if (bits) data.push((acc << (5 - bits)) & 31);
  const mod = polymod(prefixValues(prefix).concat(data, [0, 0, 0, 0, 0, 0, 0, 0]));
  const checksum = Array.from({ length: 8 }, (_, i) => Number((mod >> BigInt(5 * (7 - i))) & 31n));
  return `${prefix}:${data.concat(checksum).map((v) => CHARSET[v]).join('')}`;
}
const sample = (seed: number) => Array.from({ length: 20 }, (_, i) => (seed * 37 + i * 11) & 255);
const main = encode('bitcoincash', sample(1));
const test = encode('bchtest', sample(1));
const addrCases: [string, string, 'mainnet' | 'chipnet', string][] = [
  ['known mainnet address', 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a', 'mainnet', 'ok'],
  ['generated mainnet', main, 'mainnet', 'ok'],
  ['generated chipnet', test, 'chipnet', 'ok'],
  ['no prefix', test.split(':')[1], 'chipnet', 'ok'],
  ['mainnet address on chipnet', main, 'chipnet', 'wrong-network'],
  ['mainnet body without prefix on chipnet', main.split(':')[1], 'chipnet', 'wrong-network'],
  ['one character changed', main.slice(0, -1) + (main.endsWith('q') ? 'p' : 'q'), 'mainnet', 'invalid'],
  ['empty', '  ', 'mainnet', 'empty'],
];
for (const [name, a, net, want] of addrCases) {
  const r = checkAddress(a, net);
  const got = r.ok ? 'ok' : r.why;
  if (got !== want) failed++;
  console.log(`${got === want ? 'ok  ' : 'FAIL'} address: ${name}${got === want ? '' : ` (want ${want}, got ${got})`}`);
}
console.log('\nSample chipnet addresses for screenshots:');
for (let i = 1; i <= 4; i++) console.log(' ', encode('bchtest', sample(i + 10)));

if (failed) throw new Error(`${failed} check(s) failed`);
console.log('\nAll checks passed.');
