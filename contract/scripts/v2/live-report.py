"""Write docs/proofs/v2-live.md from the public records of contract/scripts/v2/live.ts.

Run from the repository root: python contract/scripts/v2/live-report.py
The records hold transaction IDs and plan metadata, never keys.
"""
import json
import os
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
EXPLORER = {
    'chipnet': 'https://chipnet.chaingraph.cash/tx/',
    'mainnet': 'https://explorer.bch.ninja/tx/',
}
APP = {
    'chipnet': 'https://astrorehan.github.io/pusaka-bch/chipnet/',
    'mainnet': 'https://astrorehan.github.io/pusaka-bch/',
}


def load(network, revision='assets-1'):
    suffix = '' if revision == 'assets-1' else '-' + revision
    path = os.path.join(ROOT, 'contract', 'scripts', 'v2', f'.live-{network}{suffix}.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def when(iso):
    return datetime.fromisoformat(iso.replace('Z', '+00:00')).strftime('%d %b, %H:%M:%S UTC')


def tx(network, txid):
    return f'[`{txid[:8]}…{txid[-4:]}`]({EXPLORER[network]}{txid})'


def num(value):
    return f'{int(value):,}'


def steps_table(network, steps):
    rows = ['| Step | Time | Transaction | Size | Fee | Note |', '|---|---|---|---|---|---|']
    for s in steps:
        link = tx(network, s['txid']) if s.get('txid') else 'refused by the network'
        size = f"{num(s['bytes'])} bytes" if s.get('bytes') else ''
        fee = f"{num(s['fee'])} sats" if s.get('fee') else ''
        note = (s.get('note') or '').strip().replace('\n', ' ').replace('  ', ' ')
        rows.append(f"| {s['step']} | {when(s['at'])} | {link} | {size} | {fee} | {note} |")
    return '\n'.join(rows)


def plan_line(metadata):
    heirs = ', '.join(f"{h.get('label') or 'heir'} {h['share']}" for h in metadata['heirs'])
    days = int(metadata['inactivityPeriodSeconds']) / 86400
    wait = f'{days:g} days' if days >= 1 else f"{int(metadata['inactivityPeriodSeconds'])} seconds"
    return (f"Heirs and shares (of {metadata['totalShares']}): {heirs}. Three trusted contacts. "
            f"Waiting time {wait}; review {metadata['effectiveReviewSeconds']} seconds; "
            f"fee budget {num(metadata['feeBudget'])} sats. Revision `{metadata.get('protocolRevision', 'v2')}`.")


def section(network, record, heading='###', earlier=False):
    out = []
    proof = record.get('proof')
    if proof:
        out += [
            f'{heading} The whole lifecycle, one plan',
            '',
            plan_line(proof['metadata']),
            '',
            f"Plan link: [open it in the app]({proof['link']}). State now: **{proof['phase']}**.",
            '',
            steps_table(network, proof['steps']),
            '',
        ]
    demo = record.get('demo') or []
    if demo:
        demo_note = ('These earlier examples are available as fallbacks when the current revision has no action ready.'
                     if earlier else
                     f"[Open the live demo]({APP[network]}wallet/demo) to try a claim or a payout without a wallet.")
        out += [
            f'{heading} Example plans for visitors',
            '',
            f'{demo_note} Each plan has the same six-heir faraid family and a one-minute waiting time.',
            '',
            '| Plan | Review | Created | Claim opened | Heirs paid | Plan link |',
            '|---|---|---|---|---|---|',
        ]
        for entry in demo:
            created = next((s for s in entry['steps'] if s['step'].startswith('create')), None)
            opened = next((s for s in entry['steps'] if s['step'].startswith('open claim')), None)
            paid = next((s for s in entry['steps'] if s['step'] == 'pay the heirs'), None)
            left = 'left for a visitor' if entry.get('keepActive') else '—'
            out.append(
                f"| {entry['title']} | {entry['reviewSeconds']} s | "
                f"{tx(network, created['txid']) if created else '—'} | "
                f"{tx(network, opened['txid']) if opened else left} | "
                f"{tx(network, paid['txid']) if paid else '—'} | [link]({entry['link']}) |"
            )
        out.append('')
        out.append('Payouts made by visitors appear in each plan\'s history on the explorer.')
        out.append('')
    return out


def main():
    lines = [
        '# Pusaka v2 on the network',
        '',
        'Generated from the public records of [`contract/scripts/v2/live.ts`](../../contract/scripts/v2/live.ts) '
        '(`scripts/v2/.live-<network>[-assets-2].json`, transaction IDs and plan rules) by '
        '[`live-report.py`](../../contract/scripts/v2/live-report.py). The script builds every transaction with the '
        'same builders the app uses ([`app/src/lib/protocol/`](../../app/src/lib/protocol/)).',
        '',
    ]
    for network in ('mainnet', 'chipnet'):
        current, earlier = load(network, 'assets-2'), load(network)
        if not current and not earlier:
            continue
        name = 'Mainnet' if network == 'mainnet' else 'Chipnet (test network)'
        lines += [f'## {name}', '']
        if current:
            lines += ['### Revised review anchor (`assets-2`)', '']
            lines += section(network, current, heading='####')
            if earlier:
                lines += ['### Earlier release (`assets-1`)', '']
                lines += section(network, earlier, heading='####', earlier=True)
        else:
            lines += section(network, earlier)
    path = os.path.join(ROOT, 'docs', 'proofs', 'v2-live.md')
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines).rstrip() + '\n')
    print('wrote', path)


if __name__ == '__main__':
    main()
