# Home page and "How it works"

Routes: `/` (`HomeScreen`) and `/how-it-works` (`HowItWorksScreen`). Code: `app/src/screens/home/`.

## Who lands here, and what they must get in seconds

| Who | Arrives from | Must understand | Next tap |
|---|---|---|---|
| A judge (1 to 2 minutes per project) | The DoraHacks page or the deck | "Inheritance for BCH: pick heirs and shares, they get it if I stop checking in." | **Try it now** (`/try`) |
| A BCH holder with a family | A Telegram post | Same, plus "no company holds my coins" and what it costs | **Create a plan** (`/new`) |
| An heir | A plan link from a parent, often pasted or saved as a file | "I can open it here and see what I get" | **Open a plan link** |
| A technical reader (a SolidCash judge) | The home page, "How it works" | Where the shares are enforced, what the limits are | Contract source on GitHub |

The judges said it plainly: open the page, "in enormous text it says it does X, you click the button and it works";
"within a few seconds" a stranger should know what it is; every extra tap loses people. So the first screen is only
a promise, one sentence, an illustration that shows a family and its shares, and two buttons.

## Home page

1. **Hero** (fills the first screen on phone and desktop, nothing else above the fold):
   - Eyebrow "Inheritance plans for Bitcoin Cash" (gold, small caps): names the category before the headline.
   - Headline "Leave your BCH to the people you love." (8 words, the DESIGN limit).
   - The DESIGN supporting sentence, unchanged.
   - **Try it now** (primary) and **Create a plan** (secondary). Under them, a quiet text button
     "Have a plan link? Open it".
   - Illustration: `ShareFlower`, the logo flower drawn as a family. One petal per heir in the heir colours,
     each petal's area proportional to its share, with name and percentage chips at the petal tips. A small
     pill under it ("Waiting time: 6 months") carries the second half of the idea: the timer.
2. **Built with**: inside the hero, under the two actions (`app/public/brands/`).
3. **Family plan** (`SealedLetters.tsx`, data in `familyPlans.ts`): three example plans as sealed letters, kawung
   outside and a wax seal; in view the seal breaks and each unfolds into its card (`FamilyFace`); each opens
   `/new?split=equal|custom|faraid`.
4. **The paddy scene** (`TimeScroll.tsx`, `paddyParts.tsx`): on desktop the section holds while the day passes over
   a still `paddy-scene.webp`: the light, the sun's reflection and the glass shadows move, the plan card counts its
   days down, "I'm still here" rewinds to morning and adds a new day, and left alone it sets into night. Phones,
   tablets and reduced motion get the copy and the working card as a plain section.
5. **The night payout** (`SubakPayout.tsx`, heirs in `payoutHeirs.ts`): subak, a spring, a gated canal and a divider
   feeding four terraces through channels as wide as each share; fireflies; an heir inspector with exact BCH and
   satoshis.
6. **Light sheet** (`StepsFrame.tsx`, `CheatSection.tsx`, `ClosingSections.tsx`): the three steps over a terraces
   frame, "What if someone tries to cheat?" (`cheatScenarios.ts`), the heir band
   with **Open a plan link**, the closing call, then the footer on the terraces (`HomeFooter scene`).

The order, the copy rules and the motion limits are in `docs/DESIGN.md` (Home page). Section copy shared between
components (the night title, the pinned media query) is in `landingCopy.ts`. The first version of these sections
is kept in `work/landing-v1/` for comparison.

## Open a plan link (dialog)

Native `<dialog>`: focus trap and Escape come for free. Bottom sheet on phones (slides up, 300 ms, `--ease-drawer`),
centred dialog from 768 px (scale 0.96 to 1, 200 ms). Escape closes with no animation.

| State | What the user sees |
|---|---|
| empty | Field with placeholder `https://…/plan#…`, **Open plan** enabled |
| submit while empty | "Paste a plan link first." under the field |
| not a link | "This isn't a plan link. A plan link has /plan# in it, followed by a long code." |
| cut off or changed | "This plan link is incomplete or was changed. Copy the whole link again, from start to end." |
| wrong network | "This plan was made on the test network, so it can't be opened on this site." (and the reverse) |
| saved file | "Or choose the saved file" reads the file in the browser and finds the link in it |
| file without a link | "This file doesn't contain a plan link." |
| valid | Goes straight to `/plan#…`; the plan screen owns loading and "not found" |

Errors show on submit or blur, never while typing, and clear as soon as the text changes.
Nothing is sent anywhere: the link is checked with `decodePlan` in the browser.

## How it works page

The only page that may say "contract". Reading column of 640 px.

1. The lifecycle as a vertical timeline: Make a plan, I'm still here, Waiting time, Send to heirs, Take my BCH back.
2. "If the Pusaka website disappears": the BCH is not with us, the plan link carries everything, the code is open.
3. "Good to know": the honest limits (10 heirs, network fee paid by whoever presses, dates about an hour off, shares
   are a snapshot, 546-satoshi minimum, keep the link, the Pusaka fee, not a legal will, faraid is computed in the
   browser).
4. "Under the hood" for the technical reader: SolidCash contract, its state, the three functions, where the shares
   are enforced, why time is counted in seconds, how it is tested, and a short excerpt of `distribute`.

The dollar value of the fee comes from `planService.usdPerBch()`; if the price is unknown the "≈ $" part is left out.

## Decisions and why

- **Petal area shows the share, chips show the number.** A ring or pie would be more exact, but it stops looking like
  the logo. Area by `sqrt(share)` keeps the logo shape and is honest about size; the chips carry the exact numbers,
  so colour and size never carry meaning alone.
- **The hero family has four heirs** so the hero is exactly the logo geometry (petals on the diagonals) and the
  bloom is the DESIGN bloom: seed, then petals clockwise from the top right, 80 ms apart. The chips fade in after
  their petal. It plays once per load and only in the hero. Reduced motion: a 150 ms fade.
- **Names are mixed on purpose** (Sarah, Daniel, Mei, Leo): Pusaka is for every family; faraid is one card of three.
- **"Create a plan" is the secondary hero button, not "Watch the demo".** There is no video yet and a button to
  nowhere is the kind of rough edge judges punish. `DEMO_VIDEO_URL` in `HomeScreen.tsx` turns on a third
  "Watch the demo" link (play icon) as soon as a video exists.
- **Wordmarks, not logos**, in "Built on": we have no logo files with usage rights in `brand/`. Drawing other
  projects' logos from memory would look worse than clean text.
- **Footer before/after paragraph, not a banner.** The required hackathon banner belongs in the shared header
  (see requests). The footer only repeats the README's honesty in one quiet paragraph.
- **One reading width (640 px)** on How it works, wider than the 560 px flow column, because it is prose.
- **Code in mono on the technical section.** DESIGN reserves mono for addresses and txids; a code excerpt in a
  proportional font reads wrong. Proposed as a DESIGN exception below.

## Rejected

- A tutorial or carousel in the hero (judges: "losing people every click").
- Counting-up stats ("X BCH protected"): money never animates, and we have no real numbers yet.
- Scroll-triggered animations beyond the enter fade, outside the paddy scene and the one-time landing reveals.
- A separate "Open a plan link" page: a dialog keeps the heir one step from the plan.
- Shields, padlocks, sparkles as trust symbols (DESIGN Icons).

## Requests for shared files

1. **Hackathon banner on every page** (`AppShell.tsx`, `shell.css`). FINDINGS: required at the top of all pages,
   with links to the new repo, the old repo, the pre-hackathon demo, the deck and the CashTokens address.
   Suggested: one 13 px line above the header, `--surface-2` background: "Built for BCH BLAZE 2026 ·
   Before: code, demo · Now: code · Slides · Donate", wrapping on phones.
2. **Phone menu in the header** (`AppShell.tsx`). Below 768 px `.header__links` is `display: none` and nothing
   replaces it, so "How it works" is unreachable from the header on phones. DESIGN asks for a menu there. Until then
   the home page links to it from the steps section and the footer.
3. **Create flow reads `?split=`** (`screens/create/`): `/new?split=equal|custom|faraid` should preselect the preset.
   The "Start with this" buttons already send it.
4. **`DESIGN.md` Type**: "Mono is used only for BCH addresses, transaction IDs, and code excerpts on the technical
   How it works page."
5. **`DESIGN.md` Home page**: the example headline "Your BCH reaches your family. Even if you can't." is 9 words,
   over the 8-word rule. We use "Leave your BCH to the people you love." Update the example or the rule.
6. **`brand/`**: monochrome SVG wordmarks for Bitcoin Cash, SolidCash, WizardConnect, Paytaca and Cashonize, with
   their usage notes, so "Built on" can show real logos.
7. **`Button.tsx`**: an `as="link"` / `to` option, so links styled as buttons don't need to repeat the
   `btn btn--primary` class names (the home page does that today with `<Link className="btn …">`).
8. **Header overflow on phones**: done. Under 480 px the wallet button reads "Connect" (`AppShell.tsx`), and on the
   home page the header gaps tighten under 440 px (`home-hero.css`). Checked at 320, 390 and 430 px.
9. **`DESIGN.md` Type / `tokens.css`**: a display size (56 px) for the desktop hero headline. The judges asked for
   "enormous text"; 40 px is the scale's top, so the hero uses 40 px today.
