# Create a plan (`/new`)

Owner: the create-flow worker. Files: `app/src/screens/create/**`. Rules: [`../DESIGN.md`](../DESIGN.md).

## Who is here, and what they must get in seconds

- **A BCH holder with a family**, often on a phone with Paytaca. They want to know three things before they
  trust us with savings: who gets what, when, and what it costs. Nothing else.
- **A judge** with a minute or two. They click fast and click oddly (back, reload, disconnect, cancel in the
  wallet). Every path must land on a designed screen, and nothing they typed may be lost.

What they must understand at each step, in one glance:

| Step | Heading | The one thing to understand |
|---|---|---|
| 1 Wallet | Connect your wallet | Your BCH stays in your wallet until you sign at the end. About two minutes. |
| 2 Heirs | Who gets your BCH? | Each heir, their colour, and their share of the whole (the bar always adds to 100%). |
| 3 Amount | How much, and for how long? | What each heir receives in BCH (≈ USD), and the date they can receive it. |
| Review | Check your plan | Every satoshi that leaves the wallet now, and every satoshi each heir gets later. |
| Done | Your plan is ready | Save the plan link. Without it nobody can claim. |

## Decisions

1. **Wallet first, then skip it.** DESIGN.md puts connect first. If the wallet is already connected when the
   flow opens, step 1 is marked done and the flow starts at step 2, so a returning user spends zero taps on it.
2. **One heir card to start, Equal preselected.** An empty card is the empty state; "Add heir" sits right under
   it. Up to 10 (contract limit); at 10 the button says why it is disabled.
3. **Preset tabs are short** ("Equal", "Custom %", "Faraid") because "Islamic inheritance (faraid)" does not fit
   three across at 320 px. The full name is said once, in the line under the tabs when that tab is chosen.
4. **Equal to Custom carries the numbers over** (3 heirs become 33.34 / 33.33 / 33.33), so switching never
   starts from a broken total. The custom total is shown live as neutral text ("90% of 100%. 10% left") and
   turns into an error only after Continue is pressed. Fields show errors on blur, never while typing.
5. **Faraid is a family form, not a share form.** The owner says who is in the family (spouse, parents,
   sons, daughters, full brothers and sisters); `faraid.ts` returns exact integer shares over one total
   (wife 15, father 20, mother 20, sons 26, daughter 13 over 120). The cards that follow carry the relation as
   their title and a one-line reason ("1/8, as there are children"). Relatives who inherit nothing are listed
   with the reason, so the result never looks like a bug. Awl and radd are named in one plain sentence.
   Families it does not cover (only a spouse, grandchildren, grandparents, half-siblings) get a plain note
   and a "Use Custom % instead" button.
6. **Names and addresses survive mode changes.** Faraid cards are keyed by relation (`son-2`), so changing the
   number of sons keeps what was typed for the others.
7. **Amount means "what my heirs share".** The fee budget (15,000 sats, enough for a 10-heir payout of about
   12 KB) is added on top and named, so the number the owner types is the number the heirs split. Each heir
   gets `floor(amount × share ÷ total)`, the same math as the contract (`lib/shares.ts`); the rounding
   leftover is shown on the review as going to the network fee.
8. **Dust is checked with the exact minimum.** The error names the smallest amount that works for this split,
   not just "too small".
9. **Waiting time in words.** 6 months, 1 year (default), 2 years, or a custom number of days, months or
   years (1 day to 20 years). Under it: the earliest date heirs can receive, the honest "about an hour off"
   note, and that each "I'm still here" starts the wait again.
10. **Review shows two lists**: "Leaving your wallet now" (from `previewCreate`: plan, fee budget, any Pusaka
    fee line, network fee, total) and "Your heirs receive later" (per heir, BCH and ≈ USD). It also says that
    later actions cost 9,000 to 12,000 sats, paid by whoever presses the button.
11. **Waiting for the wallet** replaces only the button area (40 px blooming logo, "Waiting for your wallet…"),
    so the plan stays visible. Cancel in the wallet comes back as a calm note, not an error, with input kept.
    Failure shows the reason, a "Details" fold and "Try again".
12. **The plan-link gate.** Success shows the bloom in heir colours, then a gold-edged plan-link card. "Save
    plan link" (downloads a small HTML file with the link and the plan in words) is the primary button until
    the link is saved, shared or copied; then "Open my plan" takes over. Until then, header links, the
    browser back button and closing the tab all ask "Leave without saving?".
13. **The draft lives in sessionStorage.** On a phone, WizardConnect may switch apps and the tab may reload.
    Heirs, amount and waiting time come back; a lost wallet shows "Your wallet disconnected. Everything you
    entered is kept." with a reconnect button. The draft is cleared once the plan exists.

## States covered

| Area | States and how to reach them |
|---|---|
| Wallet | not connected (step 1), connecting (bloom), connected (skip to 2), cancelled (`?mock=cancel` on step 1), disconnected mid-flow (header wallet button on step 2+) |
| Forms | empty (first card), invalid on blur (name, address, wrong network, duplicate, share), total not 100% (Custom, then Continue), below dust (tiny amount), over balance |
| Transaction | review, waiting for signature, cancelled (`?mock=cancel`), failed (`?mock=fail`), slow (`?mock=slow`), sent (success) |
| Faraid | empty family, normal, awl, radd, excluded relatives, unsupported family, more than 10 heirs |

Wrong network is not detectable from `WalletInfo` today; heir addresses are checked against the app's
network instead (a `bchtest:` address on mainnet is refused with a plain message).

## Rejected

- **Amount in step 2.** It would give live BCH in the heirs step, but it breaks the agreed order. Step 2 shows
  percentages (and amounts once an amount exists); step 3 shows the full bar in BCH and ≈ USD.
- **A sticky bottom bar with the share total.** It hides behind the phone keyboard and fights the header.
- **Two columns on desktop.** DESIGN.md fixes the flow column at 560 px; one column reads the same everywhere.
- **Animating the share bar.** Widths would need layout animation, and money never animates.
- **Asking the owner's gender for faraid.** The spouse picker (husband or wife, up to four wives) already says it.
- **A disabled "Done" button before saving.** Disabled buttons do not say why; swapping the primary does.

## Contract with other screens

- Home "Start with this" opens `/new?split=equal|custom|faraid`.
- Success links to the plan page with `planUrl(plan)` (`/plan#…`).

## Requests for shared files

1. `src/lib/planService.ts`, doc comment on `previewCreate` and `createPlan`: say that `amount` is what the
   heirs share and that the plan also holds `plan.feeBudget` on top. In the mock `createPlan`, set
   `balance: amount + plan.feeBudget` (today it stores `amount`, so a later payout would deduct the fee budget
   from the heirs and the review would not add up).
2. Mock `previewCreate`: add the Pusaka fee line (`{ label: 'Pusaka fee', amount: <≈ $1>, kind: 'service' }`),
   which DESIGN.md puts on the review. The review already renders `service` lines.
3. `src/App.tsx`: move to `createBrowserRouter` so screens can use `useBlocker`. The create flow's gate then
   needs no history trick. Until then it uses a pushed history entry and a click guard on links.
4. `src/lib/wallet.tsx`: expose the wallet's network (or an address prefix) so the flow can show "wrong network".
5. `src/components/AppShell.tsx` / `shell.css`: at 320 px the header's "Connect wallet" button pushes the page
   35 px wide (horizontal scroll on every screen while disconnected). Suggest showing only the wallet icon
   (with `aria-label="Connect wallet"`) below 360 px, or dropping the theme toggle into a menu there.
6. Mock `connectWallet` returns a `bitcoincash:` owner address while `NETWORK` defaults to chipnet. Heir
   addresses are checked against `NETWORK`, so the mock owner never matches them; harmless, but the real
   wallet layer should return the address for the app's network.
