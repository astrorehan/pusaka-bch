# Plan page and the judge path

Routes: `/plan#<data>` (a plan from its link) and `/try` (the judge path). Files: `app/src/screens/plan/`.

## Who is on this screen

| Person | Arrives from | Must understand in seconds | Must be able to do |
|---|---|---|---|
| Judge | "Try it now" on the home page | Whose BCH this is, who gets what, that the waiting time has passed, that one button pays everyone | Press "Send to heirs" within a minute, with a wallet that pays the network fee |
| Heir | A plan link the owner shared | What I get, and when | Nothing until the waiting time ends; then "Send to heirs" |
| Owner | Their own saved link, or a calendar reminder | How long until heirs can receive, and that one tap restarts it | "I'm still here", or "Take my BCH back" |

The judge is the hardest case: no context, no patience, maybe no wallet connected. The page is built for that
first minute, and the owner and heir views reuse the same layout.

## The page in one glance

Top to bottom on a phone (one column), and as two columns from 1024 px (left: the story and the button,
right: the family and the details):

1. **Status badge and one plain sentence.** The headline is the state ("Ready to send to heirs"), the sentence
   is the whole product in context: "The owner stopped checking in, so anyone with this link can now send
   0.0006 BCH to 6 heirs, in one transaction." For the owner: "If you don't press I'm still here by 14
   December, your 0.52 BCH goes to your 6 heirs."
2. **The countdown ring**, 220 px on phones and 260 px on desktop. The arc is the share of the waiting time
   still left: green while active, orange when under 10% is left, full green when ready, full green with a
   check once sent, an empty track once taken back. The centre says the number and its unit ("23 / days
   left / and 4 hours"); under the ring: "Heirs can receive from about 14 Dec 2026, 15:40".
3. **The one action**, directly under the ring so the judge sees it without scrolling at 390 x 844.
4. **Who receives what**: a stacked share bar in heir colours, then one row per heir (colour, name, relation
   for faraid, share, amount in BCH with dollars muted, shortened address with copy). After the payout each
   row says "Paid" with a check.
5. **Plan link card** (gold rule, the brand's "heirloom" detail): copy, native share, calendar reminder.
6. **Details** disclosure: waiting time, split, owner, plan address, first transaction, the clock note.

## States

| State | Ring | Headline | Primary (owner) | Primary (heir or visitor) |
|---|---|---|---|---|
| Loading | Skeleton ring and rows, faded in after 300 ms | | | |
| Active | Green arc | "Your heirs are waiting" / "Heirs receive in 23 days" | I'm still here | none: "Nothing to do yet", plus "Is this your plan? Connect your wallet" |
| Ending soon | Orange arc, "Ends soon" badge | "Waiting time ends soon" | I'm still here | none, same as active |
| Claimable | Full green, "Ready" | "Ready to send to heirs" | I'm still here (with a note that anyone can send now) | Send to heirs |
| Sent to heirs | Full green with check | "Sent to heirs" | Create a plan | Create a plan |
| Taken back | Empty track | "This plan is closed" | Create a plan | Create a plan |
| Broken link | none | "This plan link doesn't work" | Open another link, Create a plan | same |
| Not on the network | none | "We can't find this plan" | Open another link, Create a plan | same |
| Other network | none | "This plan is on the main network" (or test) | same | same |
| Offline / network error | none | "Can't reach the network" | Try again | same |

Transaction flow, in a sheet (bottom sheet on phones, centred dialog from 768 px):
review → waiting for your wallet (40 px looping bloom) → sending (the plan is read again; nothing is called
sent until the read confirms it) → sent with "View on explorer", or cancelled ("Cancelled in your wallet.
Nothing was sent.", neutral, not red), or failed (reason, "Details" disclosure, "Try again"). Each phase
change is announced through `aria-live="polite"`. The sheet can't be closed while the wallet or network is
working, because closing would hide a transaction still in flight.

"Sent to heirs" success: the bloom plays once at 120 px with the first four heir colours, the heirs are
listed with a check and their amount, and the page behind has already turned into its sent state.

## Decisions

- **The fee is said before the button, not after.** The review sheet has two blocks: "From the plan" (every
  heir and amount, rounding leftover if any) and "From your wallet" (the network fee). The demo page also
  says it once under the button when no wallet is connected: "Sending needs a BCH wallet, such as Paytaca
  or Cashonize. It pays the network fee of about 0.00012 BCH (≈ $0.05). The heirs' shares are not touched."
- **Connecting happens inside the review sheet.** The judge presses "Send to heirs" first and sees what will
  move; if no wallet is connected the sheet's button is "Connect wallet", then it becomes "Send to heirs".
  One path, no detour to the header.
- **The confirm button repeats the action** ("Send to heirs", "I'm still here", "Take my BCH back") with "Your
  wallet will ask you to sign" above it, so the label matches the button that opened the sheet.
- **Take my BCH back is confirmed by the review sheet itself**: a red-tinted warning ("This closes your plan.
  Your heirs will receive nothing from it."), a "Keep my plan" way out, and the destructive button last.
- **Dates are "about".** The network clock runs about an hour behind, so every date reads "about", and the
  Details say why. The countdown is computed from the network's own time, then ticks locally.
- **The page re-reads the plan every minute** (silently), so a plan someone else just paid shows as sent.
- **The judge path survives being used.** `/try` reads a list of demo plans and opens the first one that is
  still claimable. If every one is already paid, it shows the sent state with "Someone already sent this
  example plan" and "Create your own plan".
- **The calendar reminder** for the owner is set for when "ending soon" starts (90% of the waiting time), with
  a one-day alert; heirs and visitors get "Remind me when it ends" at the deadline.
- **Owner or not** is decided by comparing the connected wallet's address with `ownerAddress`, so the same
  link shows the right view on any device.

## Rejected

- A sticky bottom action bar on phones: the action already sits above the fold, and a bar would cover the
  heir list the judge is reading.
- Putting the heirs inside the ring as coloured arcs: the ring would carry two meanings (time and money).
- A separate "connect your wallet" step before the demo: one extra screen loses judges.
- A checkbox to confirm "Take my BCH back": the review sheet already asks once; two confirmations is a tutorial.
- Seconds ticking on the ring for long waits: it reads as anxious. Seconds show only in the last hour.

## Dev knob (development builds only)

`?state=loading|active|ending-soon|claimable|sent|taken-back|missing|error` overrides the first read of a plan, so
every state can be looked at without waiting. It is tree-shaken from production builds. Use it with the
service's own knobs, e.g. `/try?mock=cancel` or `/plan?state=active#...`.

## Requests for shared files

- `src/components/AppShell.tsx` / `shell.css`: at 320 px the header is 355 px wide (logo, theme toggle and
  "Connect wallet" don't fit), so every page scrolls sideways. Suggested: under 360 px hide `.brand__name`,
  or show the wallet button as icon only (`aria-label="Connect wallet"`).
- `src/lib/planService.ts` (mock): `?mock=cancel` also cancels the wallet connection, so the "cancelled in
  your wallet" transaction state is only reachable by connecting first and then adding the knob. A separate
  knob (`?mock=cancel-tx`) would make it easier to check.
- `src/lib/types.ts`: none needed. Nice to have: `PlanState.lastCheckIn?: bigint` so the owner view can say
  "You last pressed I'm still here on 2 Nov".
- The demo plan in `screens/plan/demoPlan.ts` carries placeholder addresses; the lead swaps in the real
  pre-funded mainnet plans (more than one, so judges don't collide).
