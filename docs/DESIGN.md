# Pusaka design rules

These rules apply to every screen of the Pusaka web app. Read them before you build or change UI, and update this file in the same change when a rule changes.

The goal is the one the BLAZE judges set: **instant, slick, and it just works**. A judge should understand Pusaka within seconds and reach a real mainnet transaction in about a minute. One flow that works every time beats many features with rough edges.

**Visual direction:** minimal and modern, in the Apple manner: clean surfaces, generous space, one main button per screen, solid near-black primary buttons (cream in dark mode), and warmth from warm neutrals rather than many colours. The bar is a polished, finished product: every state designed, motion that follows the rules below.

## Principles

1. **Clear in seconds.** The first screen answers "what happens to my BCH when I die?" and shows a family and its shares visually. There is no tutorial.
2. **Calm and trustworthy.** Pusaka holds someone's savings for their family. It should feel like a family heirloom, not a trading app: warm neutrals, plenty of space, and no neon, gradients or hype.
3. **Always say what happens next, and when.** Every action ends by telling the user the next step and its date or countdown.
4. **No surprises before signing.** Before a wallet asks for a signature, the app lists every coin that will move, where it goes, and every fee.
5. **Plain words.** Nothing on screen uses blockchain jargon (see [Words](#words)).
6. **Mobile first.** Paytaca lives on the phone, so every screen is designed at phone width first.

## Words

| Say | Never say on screen |
|---|---|
| inheritance plan | vault, covenant, contract (except on the technical "How it works" page) |
| heirs | beneficiaries, recipients, outputs |
| I'm still here (the check-in action) | check in, reset timer, `checkIn` |
| send to heirs (the distribute action) | distribute, trigger, execute |
| take my BCH back (the withdraw action) | withdraw, reclaim |
| waiting time | inactivity period, locktime, timelock |
| plan link | will file, contract data, JSON |
| network fee | miner fee, tx fee |

- Buttons are short verbs in sentence case: "Add heir", "Create plan", "I'm still here". Never "Submit" or "OK".
- Don't use em dashes in UI copy. Use a full stop or a comma.
- Errors say what went wrong and how to fix it: "This amount is too small. Each heir must get at least 546 satoshis (about $0.003)." Never show a raw error code alone. If there is a code, it goes in a collapsible "Details".
- Faraid is named once, as a preset: "Islamic inheritance (faraid)". The product is for every family. Faraid is never the headline.
- On Chipnet the app shows a permanent "Test network: no real money" badge. On mainnet it shows nothing extra.

## Brand

- **Name:** Pusaka (Indonesian for "heirloom"). It is never shortened or styled differently, and it carries no suffix such as "Faraid" or "BCH".
- **Logo:** a four-petal flower with a seed at its centre, carried over from the earlier Pusaka (Monad). It was made before BLAZE and is listed as reused in the README. The files live in [`brand/`](../brand):
  - `logo-light.svg`: indigo petals and a bronze seed, for light backgrounds.
  - `logo-dark.svg`: cream petals and a gold seed, for dark backgrounds.
  - `favicon.svg`: switches between the two with `prefers-color-scheme`.
- In the app, inline the logo and colour it with `--text` (petals) and `--gold` (seed), so that it follows the in-app theme toggle and not only the system setting.
- Give the logo clear space of at least half its width on every side. The smallest size is 16 px (favicon); in the header it is 24 to 28 px, next to the word "Pusaka".
- Don't recolour the petals green, add glows or shadows to the logo, or rotate it. The only motion the logo has is the bloom below.

### The bloom (logo animation)

The logo is the app's one piece of character animation. It tells the product story in a second: the seed is the owner's BCH, and the four petals are the heirs it grows into.

- **The motion:** the seed appears first (an opacity fade plus `scale` from 0.6 to 1, 200 ms). Then the four petals unfold from the centre one after another, clockwise from the top right. Each petal fades in, slides out from the seed, and scales from 0.8 to 1 over 240 ms, starting 80 ms after the previous one. The whole bloom takes about 700 ms. It uses only `transform` and `opacity`, with `--ease-out`.
- **Where it plays:**
  - **Splash:** on first load the app shows a centred logo, 72 px on phones and 96 px on desktop, on `--bg`. Under it is a thin progress line, 120 px wide and 2 px high, with a `--border` track and a `--gold` fill. The splash appears only if loading takes longer than 300 ms, and it is never added just to show the animation. If loading finishes during the bloom, the bloom completes and then the splash fades out (150 ms).
  - **Waiting state:** while the app waits for a wallet signature or for the network, a 40 px logo blooms, closes and blooms again. It pauses for 600 ms between cycles and sits above the status text ("Waiting for your wallet…", "Sending…").
  - **Plan created and Sent to heirs:** the bloom plays once, at 120 px, above the success message. Each petal takes the colour of one heir. With more than four heirs, the petals use the first four heir colours and the heir list below shows everyone.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the logo appears whole with a 150 ms fade. The waiting state shows a static logo with its text, and the progress line still moves, because it carries information.
- The splash is plain HTML and CSS inlined in `index.html`, so it appears before any JavaScript has loaded. The app removes it when it is ready.

## Colour

The palette grows out of the logo: indigo ink, warm paper, cream, and a gold seed. Colours come from semantic tokens on `:root`, never from raw hex values in components. Every text pair below was checked for WCAG AA contrast (at least 4.5:1).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAF7F2` | `#0E1222` | page background (warm paper / deep indigo) |
| `--surface` | `#FFFFFF` | `#161B2C` | cards, sheets |
| `--surface-2` | `#F2EDE4` | `#1E2438` | inputs, subtle fills |
| `--border` | `#E3DCD0` | `#2C3349` | dividers, card edges |
| `--text` | `#131B33` | `#FFF8EC` | body, headings and logo petals (16:1 and 17.6:1) |
| `--text-muted` | `#5E574D` | `#9AA0B4` | secondary text (at least 5.9:1) |
| `--primary` / `--on-primary` | `#131B33` / `#FAF7F2` | `#FFF8EC` / `#0E1222` | the one main button per screen |
| `--gold` | `#93633A` | `#E3CA8E` | brand: logo seed, small heirloom details (at least 4.8:1) |
| `--accent` | `#0AC18E` | `#0AC18E` | BCH green: fills, the countdown ring, success marks. Text on it uses `#131B33` |
| `--accent-text` | `#067A5A` | `#2FD9A6` | green text and links (at least 5:1) |
| `--danger` | `#B42318` | `#F97066` | errors, "take my BCH back" |
| `--warning` | `#C2410C` | `#FB923C` | "waiting time ends soon" |
| `--focus` | `#067A5A` | `#2FD9A6` | keyboard focus ring |

- **Gold is the brand and green is state.** Gold marks Pusaka itself: the logo seed, a thin rule under a heading, the plan-link card. BCH green appears only where something is alive or done: the countdown, success, an heir who received their share. Neither is used as background decoration.
- No gradients on UI elements. No glow effects.
- Heirs get colours in this order: blue `#2563EB`/`#60A5FA`, violet `#7C3AED`/`#A78BFA`, cyan `#0E7490`/`#22D3EE`, pink `#BE185D`/`#F472B6`, olive `#4D7C0F`/`#A3E635` (light/dark). Orange is left out because it is the warning colour. The colours repeat after five heirs, so colour never carries meaning alone: an heir's name always sits next to their colour.
- Both themes follow `prefers-color-scheme`, and a toggle overrides it. Check every screen in both.

## Type

- **Body and UI:** Geist (self-hosted through `@fontsource-variable/geist`), at 16 px base. Inputs are never below 16 px, so iOS does not zoom on focus.
- **Headings:** Fraunces, a serif for the heirloom feel, used only for headings 24 px and up. Smaller headings use Geist at weight 600.
- **Mono:** Geist Mono.
- Mono is used only for BCH addresses and transaction IDs.
- **Numbers:** all amounts, percentages and countdowns use `font-variant-numeric: tabular-nums`, so digits don't jump.
- Scale: 13 / 15 / 16 / 20 / 24 / 32 / 40 px. Line height is 1.5 for body and 1.2 for headings.

## Money and addresses

- Amounts are `bigint` satoshis in code and are formatted only at display time.
- BCH comes first, with dollars second and muted: **0.25 BCH** ≈ $112.40. The dollar value always says "≈".
- Show up to 8 decimals and drop trailing zeros (`0.25`, not `0.25000000`).
- The heirs' shares on screen add up exactly to what they will receive on-chain. Rounding is down per heir, and leftover satoshis go to the network fee; the review screen shows this.
- **Money never animates.** Balances never count up, bounce or shake. A new value simply replaces the old one.
- Addresses are shortened in the middle (`bitcoincash:qr4x…8f2k`), always with a copy button and the full address on tap or hover. The `bitcoincash:` prefix is kept.
- Every transaction gets a "View on explorer" link once it has been broadcast.

## Layout

- Designed at **390 px** first, then 768 px and 1280 px. Every screen is checked at **320 px** with no horizontal scroll.
- The flow content column is at most 560 px wide and centred. Side gutters are 16 px on phones and 24 px from 768 px.
- Spacing comes from a 4-px scale: 4, 8, 12, 16, 24, 32, 48, 64. Radius: 8 (inputs), 12 (buttons), 16 (cards), 24 (sheets), full (badges).
- Touch targets are at least 44 × 44 px.
- The wallet button is always at the top right, because the organiser asks for it there.
- Each screen has one primary button, placed where the thumb reaches: on phones it sits at the bottom of the content, full width.

## Home page

The home page is the app's front door and its landing page. There is no separate marketing site, so a visitor is one tap away from trying it.

1. **Header:** the logo and "Pusaka" on the left, at most three text links ("How it works", "Docs", "GitHub"), and the wallet button on the right. On phones the links move into a menu, but the wallet button stays visible.
2. **Hero:**
   - One headline promise in plain words, for example "Your BCH reaches your family. Even if you can't." The headline is at most 8 words.
   - One supporting sentence under it, for example "Choose your heirs and their shares. If you stop checking in, they receive it automatically, with no company in between."
   - Two buttons: **Try it now** (primary; it leads to the judge path) and **Watch the demo** (secondary, with a play icon).
   - One large illustration built from the logo: the flower as a family tree, with each petal standing for one heir. On phones it sits above the headline and takes at most 40% of the screen height.
3. **Built with:** a quiet row of logos (Bitcoin Cash, SolidCash, WizardConnect, Paytaca and other tested wallets), labelled in small caps and shown in monochrome so they don't compete with the hero.
4. **Choose how to split:** three cards, one per preset:
   - Equal: "Everyone gets the same."
   - Custom: "You pick each share."
   - Islamic inheritance (faraid): "Shares follow faraid."

   Each card has a soft background tint taken from the heir palette, a small illustration of a family with its shares, an example split ("3 heirs · 33.3% each"), and one **Start with this** button that opens the create flow with that preset already chosen.
5. **How it works:** three steps, each with an icon and one line: "Choose heirs", "Check in now and then", "Missed it? They receive their shares". Under the steps, a link to the full explanation in the docs.
6. **Footer:** the repository, the docs, the donation address (shortened, with a copy button) and "Open source, MIT".

Rules:

- The first screen, before any scrolling, holds only the header, the hero and the two buttons, on both phones and desktop.
- Illustrations are original and drawn from the Pusaka logo: the four petals and the seed. They use flat or soft shapes in the brand palette, and no stock photos.
- Large images are lazy-loaded below the fold. The hero image is preloaded and at most 200 KB, so the first screen is ready in under 2 seconds on a phone connection.
- Scrolling never triggers animations beyond the standard enter fade (see [Motion](#motion)).

## The flows

**Create a plan: three steps, with a progress indicator.**

1. *Connect wallet* (WizardConnect, one scan or one tap).
2. *Heirs and shares*: name, address and share for each heir. Preset tabs: Equal (the default), Custom %, Islamic inheritance (faraid). A live preview shows each heir's amount in BCH and dollars as a stacked share bar.
3. *Amount and waiting time*, then **Review**: a list of every output (each heir's future share, the Pusaka fee of about $1, the network fee), followed by "Sign in your wallet".

**Success screen with the plan-link gate.** The plan link is the only way to claim later, so the user can't leave this screen until they have downloaded or shared it ("Save plan link" or "Share with my heirs"). Closing the screen before that asks "Leave without saving? Your heirs can't claim without this link."

**Plan page.** A large countdown ring shows when heirs can claim. It has two views:

- *Owner:* "I'm still here" (primary), "Take my BCH back" (secondary, danger, asks for confirmation).
- *Heir or visitor:* who gets what, and "Send to heirs" once the waiting time has passed.

**Judge path.** The home page has one "Try it now" entry that reaches a plan whose waiting time has already passed. Pressing "Send to heirs" there makes a real mainnet transaction.

## States

Every screen and component has all of its states designed, not only the happy path. Judges click unexpected things.

| Area | States |
|---|---|
| Wallet | not connected, connecting (QR or deep link), connected, wrong network, rejected in wallet, disconnected mid-flow |
| Transaction | review, waiting for signature, broadcasting, sent (with explorer link), failed (with the reason and a "Try again") |
| Plan | active (countdown), ending soon (under 10% of the waiting time left, warning colour), claimable, sent to heirs, taken back, not found (bad or broken plan link) |
| Forms | empty, invalid (inline message under the field, shown on blur, not while typing), share total not 100%, amount below dust |
| Data | loading (skeletons shaped like the content, not spinners, for anything over 300 ms), empty, offline, network error |

- Empty, not-found and error states fill the content area, are centred, and offer a way forward ("Create a plan", "Open another link").
- A rejected signature is not an error. Say "Cancelled in your wallet. Nothing was sent." and keep the user's input.
- Never say something happened on-chain until the network confirms it. While waiting, say "Sending…".

## Motion

- Animate only `transform` and `opacity`. UI motion stays under 300 ms. Easing tokens: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for anything entering or responding, `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for things moving on screen, and `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` for sheets. Hover and colour changes use `ease`; never `ease-in`. Durations: press 100 to 160 ms, menus 150 ms, enter 200 ms, leave 150 ms, sheets 300 ms.
- A label change on a button (Sign, Sending…, Sent) is a 200 ms crossfade, not a jump.
- Menus and popovers scale from 0.96 to 1 from their trigger. Dialogs scale from the centre, starting at 0.95 or more.
- Keyboard actions (Enter, Escape) have no animation.
- The more often something is seen, the less it moves. Buttons and inputs barely move; a success screen may celebrate once, briefly.
- Elements enter with a fade and an 8 px rise, never from `scale(0)`. Sheets slide up from the bottom on phones.
- Buttons press to `scale(0.97)`. Hover effects apply only on `(hover: hover)` devices.
- The countdown ring updates in place without pulsing.
- Under `prefers-reduced-motion: reduce`, keep fades and drop all movement.

## Accessibility

- WCAG AA contrast everywhere (see [Colour](#colour)).
- A visible 2 px `--focus` ring on every focusable element via `:focus-visible`.
- Everything works with the keyboard. Dialogs trap focus and close on Escape.
- Transaction status changes are announced with `aria-live="polite"`.
- Colour never carries meaning alone: heirs have names, and statuses have words and icons.
- Every clickable thing has `cursor: pointer` and a real `<button>` or `<a>`.

## Icons

- Use one icon set (Lucide) at a 1.5 px stroke, sized 16 / 20 / 24.
- No shields, rockets, lightning, sparkles or padlocks as decoration. Trust comes from showing what happens, not from symbols.

## Before shipping a screen

- [ ] Works at 320 and 390 px, light and dark
- [ ] Every state in [States](#states) is reachable and designed
- [ ] No jargon from the [Words](#words) table
- [ ] Amounts add up exactly, with BCH first and dollars marked "≈"
- [ ] Keyboard and screen reader pass; reduced motion checked
- [ ] Tried once on a real phone with Paytaca
