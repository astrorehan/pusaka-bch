# Pusaka × BCH BLAZE 2026: private notes

**Private.** This `notes/` folder is gitignored and never published: plans, research, checklists, drafts. The public repo is the parent folder (https://github.com/astrorehan/pusaka-bch), with only public-facing files (README, LICENSE, `prototype/`, later the app and `docs/`). Keep strategy and drafts here, and keep the public history clean (no force pushes).

Entry for **BCH BLAZE 2026**, an online Bitcoin Cash hackathon. Pusaka: decide today who gets your BCH; if you stop checking in, a contract splits it among your heirs by the shares you chose (equal, custom, or Islamic faraid). Contract in SolidCash, wallet via WizardConnect, browser app with no backend.

The git tag `blaze-start` marks the public repo as it stood before hacking began (14 Nov 2026, 14:00 UTC). Everything after that tag is BLAZE work.

## Start here (status 14 Nov 2026, morning WIB)

Decided:

- Mainnet Track + **Best SolidCash Application** bounty. XO is optional, only if time is left.
- Positioning: universal first; faraid is the "hardest split" proof, not the headline (`IDEA.md`).
- Contract in SolidCash, **stateful** (Solidity style) as the target, because mainnet_pat recommends it (14 Nov). The stateless `prototype/` is the fallback; the day-1 rule in `IDEA.md` still applies.
- WizardConnect for SolidCash does not exist yet (mainnet_pat, 14 Nov). We build it (Build order step 3) and offer it upstream as a PR.
- Public repo https://github.com/astrorehan/pusaka-bch, recreated clean on 14 Nov (README, LICENSE, `prototype/` only), tag `blaze-start` pushed.
- DoraHacks Build: created 14 Nov with the GitHub link and the text in `notes/dorahacks-build.md`; not submitted yet. The organiser confirmed (14 Nov) it can be edited freely until the deadline and that he looks only after it. Plan: submit **Sat 21 Nov after the final check-in stream** (so the judges' remarks are in), and keep the remaining hours until Sun 22 Nov 14:00 UTC (21:00 WIB) for checks only.

Next, in order:

1. Sat 14 Nov 21:00 WIB: Kick-off Stream roll call (checklist below). No product code before then.
2. After 21:00 WIB: start `IDEA.md` → Build order, step 1 (SolidCash day).
3. Both pending replies are in (mainnet_pat and the organiser, 14 Nov) and folded into `IDEA.md` and `FINDINGS.md`. Nothing pending.

Open questions live in `IDEA.md` → "Still open". Facts with sources live in `FINDINGS.md`.

## Files

Private (this folder):

- `IDEA.md`: product, scope, prize targets, build order, open questions.
- `FINDINGS.md`: checked facts about the event, judges, bounties, SolidCash and technical tests (with sources and timestamps).
- `dorahacks-build.md`: text for the DoraHacks Build page.

Public (parent folder, on GitHub):

- `../README.md`: public project page with the before/after explanation.
- `../prototype/`: CashScript test contract proving the N-heir split works (pre-hackathon; not the final code). Also compiles in SolidCash.

## Schedule (all at 14:00 UTC = 21:00 WIB)

| Date | Event |
|---|---|
| Sat 14 Nov | Kick-off stream + judge interviews, hacking starts |
| Sat 21 Nov | Final check-in stream ("what the judges have been thinking") |
| Sun 22 Nov | Hacking ends; the DoraHacks submit button closes automatically |
| 23–27 Nov | Judging |
| Sat 28 Nov | Showcase & results |

## Links

- DoraHacks: https://dorahacks.io/hackathon/bchblaze2026 (Rules, Tracks, Resources tabs)
- Official site: https://bchblaze.cash/ (forge, schedule, bounties, archive)
- Telegram: https://t.me/bchblaze
- Information Session recording (17 Oct, 92 min; the organiser points everyone here before answering questions): https://www.youtube.com/watch?v=9qudgWloY1g
- Bitcoin Cash Podcast #195, SolidCash with mainnet_pat: https://www.youtube.com/watch?v=C6rn01LOwQs
- XO workshop recording: https://www.youtube.com/live/MuWEHO5Ufrk
- BCH tooling: https://bitcoincashpodcast.com/code
- BLAZE 2025 projects: https://dorahacks.io/hackathon/bchblaze2025/buidl
- SolidCash bounty: https://bchblaze.cash/bounties/best-solidcash-application/ (sponsor: t.me/mainnet_pat)
- SolidCash: https://github.com/solidcash/solidcash, docs https://solidcash.org/docs/
- Old Pusaka (Monad, the "before"): repo https://github.com/astrorehan/pusaka, demo https://pusaka-faraid.vercel.app (the domain pusakafaraid.xyz is down: its nameservers point to the registrar's parking servers after a WHOIS-verification suspension; fix in the Exabytes panel if wanted)

## Material from the old Pusaka (reference only, do not copy as-is)

- Faraid spec: `../pusaka-blitz/docs/faraid-spec.md`
- Monad-era PRD & architecture: `../pusaka-blitz/docs/PRD.md`, `../pusaka-blitz/docs/arsitektur.md`
- Faraid calculator (web): `../pusaka-blitz/web-next/lib/halaman/kalkulator.js`, `../pusaka-blitz/web/kalkulator.html`
- On-chain faraid logic (Solidity): `../pusaka-blitz/contracts/src/FaraidLib.sol`, `PusakaVault.sol`
- Pitch & Q&A material: `../pusaka-materi/`, `../pusaka-blitz/Pusaka_Demo_Pitch_dan_QnA_v3.pdf`

These are in Indonesian.

## Checklist

Eligibility (details in `FINDINGS.md`):

- [x] Register on DoraHacks (12 Nov)
- [x] Join the BLAZE Telegram (12 Nov)
- [x] Post in the BLAZE Telegram to confirm the project is real (12 Nov; organiser: posting is enough)
- [x] Public repo + `blaze-start` tag before hacking starts (recreated clean 14 Nov, morning WIB)
- [ ] Install Paytaca (or Cashonize) with a little BCH. Roll call likely needs only a connected wallet. Buy BCH on Indodax/Tokocrypto (IDR), withdraw on the Bitcoin Cash network (not BEP20), about 2× the exchange's withdrawal minimum; keep leftovers as BCH.
- [ ] **Sat 14 Nov 21:00 WIB: Kick-off Stream roll call** at https://bchblaze.cash/live/ (the last of the 5 streams that count). Open the page by 20:45 WIB, connect the wallet, type the DoraHacks username, stay to the end.
- [ ] Banner at the top of the home page: Widget Factory link, repo link, token-aware CashTokens address (`bitcoincash:z...`, prizes are paid here in PUSD), before repo + demo.
- [ ] Live demo where a judge can make a useful mainnet transaction; WizardConnect button at the top right.
- [ ] DoraHacks Build submitted and applied to "Best SolidCash Application" (Sat 21 Nov after the final stream; editable until the deadline, Sun 22 Nov 14:00 UTC).

During the hackathon:

- [x] Message mainnet_pat on Telegram about the SolidCash plan (sent 14 Nov morning WIB; replied 14 Nov: go stateful, no WizardConnect tooling yet).
- [ ] Sat 21 Nov 21:00 WIB: watch the final check-in stream.

Optional:

- [ ] XO bounty (only if time is left)
- [ ] Ask in Telegram how people plan to pass on their BCH (market check, Community Choice visibility)

## Draft message to mainnet_pat

(A draft Telegram message was removed from this published copy. The two questions it asked, and the answers, are in `FINDINGS.md`.)
