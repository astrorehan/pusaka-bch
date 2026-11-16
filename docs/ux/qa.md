# QA and polish of the merged app

Branch `ui-qa`. Scope: the whole app under `app/src` except `app/src/lib/chain/**`. Rules: [`../DESIGN.md`](../DESIGN.md).

## What I tested

Driven by playwright-core on the installed Chrome, with fresh browser contexts (so `?mock` never sticks between
runs), at 320, 390, 768 and 1280 px, light and dark, plus reduced motion and a throttled phone connection.

| Area | How |
|---|---|
| Judge path, mock | home, Try it now, Send to heirs, connect in the sheet, sign, sent, Done; with `?mock=1`, `cancel`, `cancel-tx`, `fail`, `slow` |
| Create flow, mock | home, each Start with this card (Equal, Custom, faraid with wife, parents, 2 sons, 1 daughter), empty Continue errors, custom total not 100%, dust amount, custom waiting time (18 months), review, sign, success, leave gate (header link and browser Back), save, Open my plan, I'm still here, Take my BCH back, closed plan |
| Plan page states | `?state=active|ending-soon|claimable|taken-back|missing|error|loading`, broken link, empty `/plan`, other network, offline |
| Real mode, read only | the Chipnet plan link from the brief, `/try`, the home page's network requests, the production build (`vite preview`), offline; the WizardConnect QR dialog opened and closed (no wallet paired) |
| Keyboard | tab order on home, `/try`, 404; Open a plan link and the transaction sheet by keyboard only; Escape returns focus |
| Consistency | words table, quotes, dates, amounts, units, button styles, full-area states, page titles |

Real mode results (production build): the plan link renders "Sent to heirs" with its three heirs in about 2.2 s
(2.9 to 3.4 s in the dev server); a skeleton shaped like the page shows from 300 ms; the console is clean. The home
page requests no chain code, and now not WizardConnect either until after the first paint.

## What I fixed

| Problem found | Fix |
|---|---|
| Home downloaded the whole SolidCash SDK on first load (the wallet provider called `loadChain()` while idle) | Load the chain only once a wallet session exists (`lib/wallet.tsx`) |
| First screen JS was about 343 KB gzipped (WizardConnect, nostr and libauth crypto in the first chunk) | WizardConnect moved to `lib/wizardBridge.tsx`, loaded after first paint as a sibling, so nothing remounts; pages other than home load on first use and the splash waits for them (`App.tsx`, `main.tsx`). First chunk now 70 KB gzipped |
| Real wallet would show 0 BCH and block Send to heirs ("Your wallet has 0 BCH") and the create flow | The bridge reads the wallet's real plain balance over its derived addresses after connect (see chain item 1) |
| `?mock=cancel|fail|slow` stopped working after the first in-app link (the knob was read from the current URL) | Knob remembered for the tab from the first URL; `?mock=1` resets it; added `?mock=cancel-tx` (connects, cancels signatures); mock plans survive a reload; the mock owner is a valid `bchtest:` address |
| `/try` in real mode showed "We can't find this plan" (placeholder mainnet plans on Chipnet) | On Chipnet `/try` reads the real, already-paid plan: "This example was already sent" with a way forward |
| Plan opened after its payout showed "0.00000001 BCH" and "0 BCH" per heir (the fee budget left behind was read as the pot) | No amounts from a finished plan's leftovers; shares and "Paid" only |
| Offline showed "We can't find this plan"; a failed quiet re-read could replace a live plan with "not found" | Offline says offline; a quiet re-read that fails keeps the page |
| Two sheets both styled `.sheet` (shared and the plan page's own); loading both would hide the transaction sheet | Plan sheet classes renamed `pl-sheet`; Open a plan link and Leave without saving now use the shared `Sheet` |
| Bare 404 (green text link, top of page) | `StateMessage`: icon, title, sentence, Back to home and Try it now; shared with every plan-page message |
| Empty `/plan` had a disabled Open button, its own error wording, no saved-file option | Same checks and words as the home sheet (`checkPlanLink`), Choose the saved file, no disabled button |
| Leave gate used a history trick: after saving, the first Back did nothing | Data router with `useBlocker`; Save plan link in the dialog saves and carries on |
| Links from the bottom of a long page opened the next page half-way down (footer How it works landed at 2,522 px) | `ScrollRestoration`: new pages start at the top, Back restores |
| 18 months read as "1 year" on the success screen and plan details | `formatDuration` says months and years only when whole |
| Same deadline as "May 17, 2028" (create) and "17 May 2028" (plan); 20/120 as 16.67% (create) and 16.66% (plan) | Day-first dates everywhere; shares round to nearest everywhere |
| Straight and curly quotes mixed; "sats" next to "satoshis"; three wordings for a cancelled connection | Curly quotes, "satoshis", "Cancelled in your wallet. Nothing was shared." |
| How it works promised "a small Pusaka fee of about $1" that the app never charges or shows | Says Pusaka takes no fee of its own (see chain item 10) |
| Banner had no CashTokens address (organiser's requirement) while the footer showed one | Banner shows it; footer reads it from `banner-config.ts` |
| Share with my heirs did nothing where the clipboard API is blocked | Falls back to a hidden textarea copy |
| Smaller: heir relation split from its share at 320 px, "2 satoshis" wrapped, Open my plan was a hand-written `btn` link, success list lacked relations, no titles on /new and /how-it-works, focus not moved to the success title, connect button in the sheet didn't bloom | Fixed |

DESIGN.md gained rules for quotes, dates, "satoshis", `StateMessage` and the router, each with its reason.

## Earlier requests for shared files

Applied: create 1 (already in code), 3 (router), 6 (mock owner); home 3 (`?split=` already worked), 7 (ButtonLink,
last hand-written link converted); plan `?mock=cancel-tx`; shell 3 (CashTokens address; slides still empty), 4
(OpenLinkDialog on Sheet). Already done by the shell before QA: home 1, 2, 4, 5, 8, 9; create 5; plan 320 px header.
Not applied, for the lead: create 2 (no Pusaka fee exists, see chain 10), create 4 and shell 1 (wallet network and lost
session), home 6 (brand logo files), plan `lastCheckIn`, mainnet demo plans.

## What is left (with steps)

1. **Slides link missing from the banner** (eligibility). `banner-config.ts` `slidesUrl` is empty, so "Slides" is hidden.
2. **Transaction sheet can't be dragged down on phones.** `/try` at 390 px, Send to heirs, drag the sheet down: nothing.
   It is still the plan page's own `pl-sheet`; moving it onto the shared `Sheet` needs per-phase titles lifted out of `Flow`.
3. **Bloom with fewer than four heirs repeats colours.** `/try?mock=1`, send: three heirs, heir 1's blue on two petals.
   DESIGN covers only "more than four"; suggest the spare petals in `--gold` or `--border-strong`.
4. **`index.html`** (outside `app/src`): the tab title is just "Pusaka", with no description or social preview. Suggest
   `<title>Pusaka: leave your BCH to the people you love</title>`, a meta description and `og:` tags.
5. **`app/README.md`**: add `?mock=cancel-tx`, and `src/lib/wizardBridge.tsx` to the layout table.
6. **Dev knob caveat:** `?state=active` on a plan whose waiting time is 1 second (the Chipnet test plan) flips to
   claimable at once; use a longer plan.
7. Closing the WizardConnect QR dialog logs "WebSocket is already in CLOSING or CLOSED state" twice (inside
   `@wizardconnect`, also before my changes).
8. Not tested: the real create, I'm still here, take back and send flows with a wallet (out of scope for this pass).

## Chain-layer problems for the lead (`app/src/lib/chain`)

1. **`chainPlanService.wallet()` returns `balance: 0n`.** Screens check it before signing. Worked around in
   `wizardBridge.tsx` (sums `plainBalance` over `WizardWallet.derivedAddresses()` once after connect). Please own it in
   the chain layer and refresh it after each action; the stopgap does not see the fees just paid.
2. **`readPlan` returns `null` for any error.** An Electrum timeout reads as "We can't find this plan". Please throw on
   network errors and return `null` only when the category has no plan. The screen now catches the offline case only.
3. **`readPlan` never sets `lastTxid`,** so a sent or closed plan opened from its link has no "View on explorer".
4. **A plan taken back after its deadline reads as "sent".** `statusOf`: balance 0 with `canPayOut` true skips the
   taken-back rule, then `0 - feeBudget < heirs` says sent. Repro: take a plan back once its waiting time has passed,
   reopen the link: "Sent to heirs" with every heir "Paid".
5. **Fee budget contradiction.** The create review says 15,000 satoshis are "Kept for the network fee when heirs are
   paid", but the presser's wallet pays that fee and the budget stays locked after the payout (DX log). The plan page
   says "Your wallet pays the network fee". Either pay the fee from the budget, or set `FEE_BUDGET` in
   `screens/create/model.ts` to 0 and the review line disappears.
6. **`toResult` turns every non-cancel error into "The network did not accept this transaction"**, including fixable
   ones: "Only the wallet that made this plan…", "Connect your wallet first.", "The wallet has not shared its
   addresses yet." Those should be the main message, with "Details" for the rest.
7. **Hidden extra signatures.** `ensureCoinsAtOwner` may ask for a gathering transaction first, and a payout needs 11
   coins (a split, then the payout), but previews show one network fee and the sheet says "Your wallet will ask you
   to sign". DESIGN principle 4 (no surprises before signing): the preview should say when a second request comes.
8. `previewCreate` network fee is a fixed 3,000 satoshis; `previewCheckIn` and payout a fixed 12,000.
9. Mainnet `/try`: `screens/plan/demoPlan.ts` `MAINNET` is a placeholder without `categoryId`; add the pre-funded plans.
10. **No Pusaka fee is charged.** If it ships, add the output and a `kind: 'service'` preview line (the review renders
    it), and restore the How it works sentence.
