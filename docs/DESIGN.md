# Pusaka design rules

These rules apply to every screen of the Pusaka web app. Read them before you build or change UI, and update this file in the same change when a rule changes.

**Product direction, 17 Nov 2026:** [PRODUCT.md](PRODUCT.md) defines the revised
wallet, activity and family-review behavior. It takes precedence over the older
three-action flow described below and in `docs/ux/`. The current app still runs that
older flow. Screens must not claim that the revised behavior is already available.
The next implementation priority is proving usable protected funds, incoming
payments and claim review before further visual polish.

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
- When a sentence names a button, it uses curly quotes: Press “I’m still here” before then. Why: the create flow and the plan page used different quote styles side by side.
- Dates are day first: "17 May 2028", and with a time "17 May 2028, 08:31". Plan deadlines always say "about". Why: two screens showed the same deadline as "May 17, 2028" and "17 May 2028".
- Amounts of a few satoshis say "satoshis", never "sats".
- Don't use em dashes in UI copy. Use a full stop or a comma.
- Errors say what went wrong and how to fix it: "This amount is too small. Each heir must get at least 546 satoshis (about $0.003)." Never show a raw error code alone. If there is a code, it goes in a collapsible "Details".
- Faraid is named once, as a preset: "Islamic inheritance (faraid)". The product is for every family. Faraid is never the headline.
- On Chipnet the app shows a permanent "Test network: no real money" badge. On mainnet it shows nothing extra.
- The hackathon banner is the one place that may say "BCH BLAZE 2026", "Before BLAZE" and show a CashTokens address, because the organiser requires those words there (see [Shell](#shell)).

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
  - **Splash:** every full page load, including a reload, opens on a centred logo, 72 px on phones and 96 px on desktop, on `--bg`. Under it is a thin progress line, 120 px wide and 2 px high, with a `--border` track and a `--gold` fill. It covers the very first paint and plays the bloom once; moving between pages inside the app never shows it. The app can't know its real progress, so the fill eases toward 90%, slowing as it goes. Once the app is ready and the bloom has finished, the fill glides to full from wherever it is. Then the splash lifts: the logo swells slightly and fades, the background dissolves (about 560 ms), and the page settles in underneath. The hero copy rises, the header fades in and the hero picture eases from 105% to its resting size. Under reduced motion the page only fades.
  - **Waiting state:** while the app waits for a wallet signature or for the network, a 40 px logo blooms, closes and blooms again. It pauses for 600 ms between cycles and sits above the status text ("Waiting for your wallet…", "Sending…").
  - **Plan created and Sent to heirs:** the bloom plays once, at 120 px, above the success message. Each petal takes the colour of one heir. With more than four heirs, the petals use the first four heir colours and the heir list below shows everyone.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, the logo appears whole with a 150 ms fade. The waiting state shows a static logo with its text, and the progress line still moves, because it carries information.
- The splash is plain HTML and CSS inlined in `index.html`, so it appears before any JavaScript has loaded. The app calls `window.__pusakaSplash.hide()` when it has rendered. Its colours repeat the token values, because `tokens.css` has not loaded yet: it is the only place raw hex is allowed. A tiny inline script applies the saved theme before first paint, so neither the splash nor the app flashes the wrong theme.

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
- **Headings:** the home hero uses Geist. Landing section headings below it use Fraunces, a warm serif also used for headings 24 px and up on other screens. Smaller headings use Geist at weight 600.
- **Mono:** Geist Mono.
- Mono is used only for BCH addresses, transaction IDs, and code excerpts on the technical How it works page. Why: code set in a proportional font reads wrong, and that page is the only one allowed to show code.
- **Numbers:** all amounts, percentages and countdowns use `font-variant-numeric: tabular-nums`, so digits don't jump.
- Scale: 13 / 15 / 16 / 20 / 24 / 32 / 40 px. Line height is 1.5 for body and 1.2 for headings.
- **Home display:** 48 to 76 px, responsive, with a single centered line on desktop and two lines on phones. Why: the headline and the flower need a shared vertical composition rather than a text/image split.

## Money and addresses

- Amounts are `bigint` satoshis in code and are formatted only at display time.
- BCH comes first, with dollars second and muted: **0.25 BCH** ≈ $112.40. The dollar value always says "≈".
- Show up to 8 decimals and drop trailing zeros (`0.25`, not `0.25000000`).
- The heirs' shares on screen add up exactly to what they will receive on-chain. Rounding is down per heir, and leftover satoshis stay in the plan next to its small minimum balance (1,000 satoshis, because a SolidCash contract may not be left below the network minimum); the review screen shows this.
- **Money never animates.** Balances never count up, bounce or shake. A new value simply replaces the old one.
- Addresses are shortened in the middle (`bitcoincash:qr4x…8f2k`), always with a copy button and the full address on tap or hover. The `bitcoincash:` prefix is kept.
- Every transaction gets a "View on explorer" link once it has been broadcast.

## Layout

- Designed at **390 px** first, then 768 px and 1280 px. Every screen is checked at **320 px** with no horizontal scroll.
- The flow content column is at most 560 px wide and centred. Side gutters are 16 px on phones and 24 px from 768 px.
- Spacing comes from a 4-px scale: 4, 8, 12, 16, 24, 32, 48, 64. Radius: 8 (inputs), 12 (buttons), 16 (cards), 24 (sheets), full (badges).
- Touch targets are at least 44 × 44 px.
- The wallet button is always at the top right, the rightmost control on every width, because the organiser asks for it there. Under 480 px it reads "Connect" (its accessible name stays "Connect wallet"); with the full label the phone header did not fit and pushed the page sideways.
- Each screen has one primary button, placed where the thumb reaches: on phones it sits at the bottom of the content, full width.

## Home page

The home page is the app's front door and its landing page. There is no separate marketing site, so a visitor is one tap away from trying it.

1. **Header:** the logo and "Pusaka" on the left, at most three text links ("How it works", "Docs", "GitHub"), and the wallet button on the right. On phones the links and the theme switch move into a menu, but the wallet button stays visible (see [Shell](#shell)).
2. **Centered hero:**
   - "Your BCH. Their future." above a supporting sentence that explains who receives the coins and when. Receiving still needs a transaction; do not imply that a timer broadcasts a payment by itself.
   - **Try it now** (primary) and **Create a plan** (secondary), both pill-shaped on the home page. A compact "Built with" logo row sits directly underneath, followed by the plan-link opener.
   - Keep the name explanation as a quiet eyebrow: a small uppercase "Pusaka", a thin gold divider, and "Indonesian for heirloom". Both headline lines and the supporting copy use `--text` for contrast over the landscape. The headline uses weight 550; the supporting sentence is 17 px on desktop and 16 px on phones. Reserve `--hero-gold` (`#E3CA8E` in both themes) for the small divider and arrow circle. Hero pills are 48 px tall, 44 px on phones; the primary uses `--hero-action` (`#090D16`) with `--hero-on-action` (`#FAF7F2`) in both themes.
   - On desktop, extend the hero sky to the top of the page behind the transparent banner and navigation. The header floats over the scene without a background fill, divider, or top fade. Keep the header above the scene so its links and menus remain usable. The water can soften into the family plan below.
   - The bloom stands in the paddy water beside the copy: a blue water lily grown from the logo, with four separate diagonal petals (white at the throat, blue-violet toward the tips) around a golden seed and its stamens, on a green stem among floating pads. From the front its silhouette stays faithful to the favicon. It is built in code (`app/src/screens/home/sawahFlower.ts`), so no model is downloaded. Its glow is light in the scene, not a UI effect: by day the low sun shines through the petals; after dark the seed lights the bloom, the water and the nearest seedlings. Character mascots are outside this direction.
   - The background and stone use `--hero-studio` (`#F3F0E9` / `#171B28`) and `--hero-stone` (`#DDD3C2` / `#343747`). Scene lights and physically shaded materials may use their own calibrated colors; UI surfaces still use tokens.
3. **Family plan:** three example plans, Equal shares, Your own split and Islamic inheritance (faraid), as sealed letters (a will in Indonesian is a *surat wasiat*, a letter of bequest). Each arrives folded in three, kawung on the outside (the old Javanese batik of four ovals around a point: the logo's own petals and seed, in gold on indigo) and closed with a wax seal stamped with the bloom. In view the seal breaks, the letter unfolds and its writing appears; the open letter keeps its two creases. Inside: its blooms on a tint of the heir palette, the heirs as chips with their exact percentages, and **Start**, which opens the create flow with that split. Say that these are examples and nothing moves. Reduced motion shows the letters open.
4. **Built with:** inside the hero, directly below the two actions, show a quiet row of Bitcoin Cash, SolidCash and WizardConnect marks with their names and links to their project sites or documentation. Use self-hosted, source-backed artwork from `app/public/brands/`, rendered in monochrome for both themes. Keep the links at least 44 px tall and let the row wrap on small screens. This credits the chain, contract tooling and wallet protocol; the BLAZE entry stays in its dedicated banner.
5. **The paddy scene** ("While you're here, it waits. When you're not, it pays."): scrolling is time passing. On desktop the section holds the screen beside a still picture of a flooded paddy from above, with the bloom on its pads, Pusaka's reminder and a working plan card lying on the water as frosted glass. As the visitor scrolls the day goes by: the light turns from morning to noon to late afternoon, the sun's reflection crosses the water, the shadows of the glass swing round, and the plan's days count down from 180. From halfway Pusaka asks whether you are still here; pressing "I'm still here" on the card rewinds the light to morning and the count to 180 (nothing is sent) and gives a whole new day to scroll through. Left alone, the waiting time passes, the sun sets, the page around the picture goes dark, the bloom's seed lights up among fireflies, and it is night with the next title in place. Phones, tablets and reduced motion get the copy and the working card over a crop of the photo.
6. **The night payout** ("One payment pays everyone."), drawn as subak, Bali's way of sharing water between rice terraces: the plan is a spring, one payment opens its gate, and the water runs down a canal to a divider whose channels are each as wide as that heir's share, filling every heir's terrace at once. "I'm still here" closes the gate and the water runs back into the spring. Amounts are fixed labels; only the water moves. Picking a terrace shows that heir's exact amount in BCH and satoshis.
7. **How it works:** on a light sheet with a softly stepped terrace edge that rises over the night, three steps, "Choose heirs", "Check in now and then", "Missed it? They receive their shares", under a wide frame of the terraces at golden hour where a glass card shows each step as it looks in the app. The steps advance on their own while in view (paused on hover, never under reduced motion). Under them, a link to the full explanation, then "What if someone tries to cheat?": four tricks to pick from and the two layers that refuse each (the app, then the network), over a patch of the paddy.
8. **For heirs** and the **closing call:** "Someone made you an heir?" with **Open a plan link**, then "Your family shouldn't have to guess." with the two hero actions, while a bloom on its pad drifts in from the right edge.
9. **Footer:** links and donation address sit on the page above a closing rice terrace landscape, with a bloom on its pad in front of the hut. The night picture follows the dark theme. The before/after note sits at the bottom of the picture.

Rules:

- The first view emphasizes the header, centered copy, two actions, and studio flower. The Family plan may peek in from the studio's lower edge; detailed explanations follow below.
- Illustrations are original and drawn from the Pusaka logo: four separate diagonal petals and the seed. The 3D bloom sways with the same breeze as the rice, turns a little toward the cursor and opens as it comes near; the header logo keeps its existing bloom rules.
- The 3D bloom can be turned: dragging across it turns it on its stem and a vertical drag nods it. Let go, it glides on and comes to rest facing the light at a whole turn, without swinging back. A tap greets: the petals open in a swell of light and it turns once. On touch screens only a horizontal drag turns it, so a vertical swipe still scrolls the page.
- A small, high-priority still image is always available before the 3D scene is ready. Dedicated desktop/phone and light/dark WebP renders come from the same web scene. Preserve the complete flower when framing them; keep each below 200 KB.
- Load the Three.js chunk and the landscape images only near the viewport on desktop devices with a fine pointer. Touch devices, reduced motion, and data-saving mode begin with a still image and may explicitly request "View in 3D". Failure to load or loss of WebGL keeps the still image and working page.
- The renderer draws on demand, stops when outside the viewport or the document is hidden, and disposes resources on navigation. Do not add a permanent idle animation loop.
- Below the hero, scrolling may drive the paddy scene: only `transform`, `clip-path` and `opacity` change (its light is fixed layers crossfaded, its shadows three fixed shadows crossfaded), eased toward the scroll position, and it is off on phones, tablets and under reduced motion. The days on its card are a number, not money, so they may count. Headings there resolve word by word like ink on paper (about 700 ms) and blocks rise into place; these one-time reveals are the landing's exception to the 300 ms UI limit. Elsewhere, scrolling never triggers animations beyond the standard enter fade (see [Motion](#motion)).
- Photos are scenes, so their light (sun through the petals, fireflies, the lit seed at night) is allowed; UI on them is frosted glass lit from the upper left like the sun, never a glow. Generated art and its prompts live in `brand/landing/`.

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

## Shell

The frame around every page, in `app/src/components/` (`AppShell`, `Banner`, `Sheet`, `Popover`, `Button`, `CopyButton`). Screens use these and don't rebuild them.

**From the top:** the hackathon banner, the Chipnet strip (only on Chipnet), the header, then the page. `--shell-top` holds the measured height of all three, so a screen can fill the first view exactly (`min-height: calc(100svh - var(--shell-top))`). A "Skip to content" link appears on keyboard focus.

**Hackathon banner** (organiser's rule: top of every page, with the code and demo before and after BLAZE, the slides and a CashTokens address):

- One calm 13 px strip on `--surface-2`: muted group labels, `--text` links with a soft underline, groups split by thin rules. No colour, no icons, and no close button: judges must always see it.
- Groups: "BCH BLAZE 2026 entry", "Slides", "Before BLAZE: Code, Demo", "Now: Code, Demo", "Donations" with the shortened address and a copy button.
- Under 1024 px it folds into one 40 px line ("BCH BLAZE 2026 entry · Code and demos" and a chevron) that opens a panel over the page with every link as a 44 px row. The full-width line is the one exception to the 44 px touch target, to keep the first screen for the product.
- Values live in `banner-config.ts`. An empty value hides its entry.
- On the home page, use a compact transparent 12 px event line, aligned with the header and without a bottom border or group divider strokes. Use `--text` for the event labels, navigation and hero copy so they stay readable over the landscape. Keep every configured link and the address available. The Chipnet label is also transparent; its wording stays visible only on Chipnet. Set `VITE_NETWORK=mainnet` for a mainnet deployment, where the label is not rendered.

**Header:** on phones (under 768 px) the menu button sits just left of the wallet button and opens a panel with How it works, Docs, GitHub and a "Dark theme" switch. From 768 px the links show inline, the current page in `--text`, and the theme toggle is an icon button.

**Wallet button:** "Connect wallet", then "Connecting…" (crossfade, busy) with a 20 px looping bloom in place of the wallet icon. Under 360 px the label stays "Connect" while connecting, so the button never changes width under the finger. Connected, it shows the address shortened in mono with a green dot on the wallet icon, and opens a small panel: wallet name, address with copy, balance (BCH first, dollars "≈"), Disconnect. Disconnect is never one tap from the header. "Cancelled in your wallet. You can connect any time." appears under the button for 5 s and is read out politely.

**Popover** (menus and small panels): drops from its trigger, scale 0.96 to 1 from that corner, 150 ms in and out. Closes on Escape (at once, focus back on the trigger), a click outside, focus leaving, or a page change.

**Sheet** (anything that asks or shows on top of the page): a bottom sheet under 768 px (slides up 300 ms with `--ease-drawer`, grabber, drag down or flick to dismiss) and a centred dialog from 768 px (scale 0.96 to 1, 200 ms). The title is required; the primary button goes in its footer, full width. Escape closes at once; the scrim and the close button close with a 150 ms leave. `dismissible={false}` is for gates such as the plan-link screen: only the sheet's own buttons close it, and every other attempt calls `onDismissAttempt`, so the screen can ask "Leave without saving?". The page behind never scrolls. API at the top of `Sheet.tsx`.

**Buttons:** `Button` for actions, `ButtonLink` for links that look like buttons (`to` for app routes, `href` with `external` for other sites). Same variants, sizes, icon slot and press. Never hand-write `btn` classes.

**Copy:** `CopyButton` next to every address or link worth copying. The icon turns into a green check for 1.5 s and "Copied" is announced.

**Full-area states:** `StateMessage` (icon in a soft circle, serif title, one muted sentence, then the buttons) for the 404 page and every plan-page message, so a dead end looks the same wherever it happens.

**Router:** a data router (`createBrowserRouter`). A new page starts at the top and Back returns to where the reader was (`ScrollRestoration` in the shell); gates such as the plan-link screen use `useBlocker`. Why: links from the bottom of a long page opened the next page half-way down, and the gate needed a history trick.

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
