// Write the mainnet example plans the web app's demo offers (app/src/lib/protocol/demo-plans.mainnet.json)
// from the live runner's public records: the current revision's demo plans first, then the earlier ones.
//
//   node scripts/v2/demo-list.mjs [--drop <planAddress,...>]
//
// --drop leaves out plans that have already paid their heirs, so the demo does not read them on every visit.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const here = resolve(import.meta.dirname);
const records = ['.live-mainnet-assets-2.json', '.live-mainnet.json'];
const out = resolve(here, '../../../app/src/lib/protocol/demo-plans.mainnet.json');

const at = process.argv.indexOf('--drop');
const drop = new Set(at > 0 ? (process.argv[at + 1] ?? '').split(',').filter(Boolean) : []);

// Each entry is the plan's metadata, plus the transactions that created it and opened its claim, which the demo
// links as proof of those steps.
const plans = records.flatMap((file) =>
  JSON.parse(readFileSync(resolve(here, file), 'utf8')).demo.map((d) => {
    const created = d.steps?.find((step) => step.step === 'create')?.txid;
    const claim = d.steps?.find((step) => step.step.startsWith('open claim'))?.txid;
    return { ...d.metadata, ...(created && { createdTxid: created }), ...(claim && { claimTxid: claim }) };
  }),
);
const kept = plans.filter((metadata) => !drop.has(metadata.planAddress));
if (kept.length === 0) throw new Error('Keep at least one example plan.');
writeFileSync(out, JSON.stringify(kept, null, 2) + '\n');
console.log(`${kept.length} example plans written (${plans.length - kept.length} left out)`);
