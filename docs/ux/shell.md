# App shell, shared components and splash

Code: `app/src/components/`, `app/index.html`, `app/src/styles/`, `app/src/index.css`. Rules: `docs/DESIGN.md`.

## Who sees the shell, and what they must get in seconds

| Who | What the shell must do for them |
|---|---|
| A judge (a couple of minutes, often on a laptop) | Find the four required before/after links, the slides and the prize address without hunting, then forget the banner and see the product. |
| A BCH holder on a phone (Paytaca) | See "Pusaka" and a wallet button at the top right, reach "How it works" from a menu, never scroll sideways. |
| An heir opening a plan link | Nothing in the way. The shell is quiet on every page so the plan is the loudest thing. |
| Create and plan screens | A `Sheet` that behaves the same everywhere, and a `Button` that can be a link. |

## The hackathon banner

The organiser requires it on every page ("four things, really obvious": code and demo, before and after; plus the
slides and a CashTokens address that receives prizes and votes). It must not hurt the first impression.

- **One calm 13 px strip above everything**, `--surface-2`, muted label text and `--text` links. No colour, no icon
  noise, no close button (judges must always see it).
- **Grouped, not a run-on line:** `BCH BLAZE 2026 entry` | `Slides` | `Before BLAZE: Code · Demo` |
  `Now: Code · Demo` | `Donations bitcoincash:z…` + copy. Group labels are muted, links are `--text` with a soft
  underline, groups are split by thin rules. "Now: Demo" points to this app, so the four links are literally there.
- **Under 1024 px: one line**, "BCH BLAZE 2026 entry" and "Code and demos" with a chevron. Tapping opens a
  panel over the page (no layout shift) that lists every link as a 44 px row with its group label. It never
  disappears, it only folds. (At 768 px the full line wrapped onto a second row with an orphan divider, so
  tablets get the folded line too.)
- **Config in one file**, `banner-config.ts`. Empty values hide their entry (slides and address are not known yet).
  A group with no entries left disappears with it.

## Header

- **Phones: logo + "Pusaka", then a menu button and the wallet button.** The wallet stays the rightmost control on
  every width (organiser's rule). The menu holds How it works, Docs, GitHub and the theme switch, which moves out of
  the header on phones to make room.
- **320 px fits:** under 360 px the wallet reads "Connect" (aria-label "Connect wallet") and the gap between controls
  drops to 4 px. While connecting the label stays, so the button never shrinks under the finger (an icon-only
  version moved the menu button under the pointer); the wallet icon turns into the looping bloom.
- **Connected wallet opens a small panel** instead of disconnecting on click (a one-tap disconnect was a trap):
  wallet name, address shortened with copy, balance in BCH first and dollars "≈", then Disconnect.
- **Cancelled in the wallet is not an error:** a small note under the button, "Cancelled in your wallet. You can
  connect any time.", read out politely and gone after 5 s.
- Desktop nav marks the current page (`aria-current`, `--text` instead of muted).
- A "Skip to content" link appears on keyboard focus: with the banner there are many stops before the page.

## States covered by the shell

| Area | State | Shown as |
|---|---|---|
| Wallet | not connected | "Connect wallet" / "Connect" under 360 px |
| Wallet | connecting | label crossfades to "Connecting…", the icon becomes the looping bloom; "Connect" under 360 px |
| Wallet | connected | short address in mono; tap opens the wallet panel |
| Wallet | rejected in wallet | note under the button (`?mock=cancel`) |
| Wallet | wrong network, disconnected mid-flow | not exposed by `useWallet` yet; see requests |
| Network | Chipnet | permanent "Test network: no real money" strip under the banner |
| Data | first load | splash, only after 300 ms |

## Splash

Plain HTML and CSS in `index.html`, exactly DESIGN "The bloom": 72 px logo (96 px from 768 px) on `--bg`, a
120 x 2 px line with a `--border` track and `--gold` fill. It appears only after 300 ms. The fill creeps toward 85%
(it can't know real progress, so it never claims 100% until the app is ready) and snaps full when React is ready.
If the app is ready mid-bloom, the bloom finishes, then the splash fades in 150 ms. An inline script applies the saved
theme before first paint, so the splash and the app never flash the wrong theme.

## Sheet

Native `<dialog>` with `showModal()`: the page behind is inert, so focus stays inside, and the browser handles the
top layer. Bottom sheet under 768 px (slides up 300 ms `--ease-drawer`, grabber, drag down to dismiss with a flick),
centred dialog from 768 px (scale 0.96 to 1, 200 ms). Escape closes with no animation. Scrim, sticky footer for the
primary button, scroll lock on the page. `dismissible={false}` turns off Escape, scrim and drag (for gates) and
calls `onDismissAttempt` so the screen can ask "Leave without saving?".

## Button

`Button` keeps its API. `ButtonLink` renders the same classes on a router `<Link>` (`to`) or an `<a>` (`href`),
with every variant, size, icon and the press motion. A changed label crossfades in 200 ms (DESIGN: "Sign,
Sending…, Sent"), except on first render.

## Decisions on DESIGN questions (from `docs/ux/home.md`)

- **Mono for code on How it works: yes.** Code in a proportional font reads wrong; it is the one page allowed to show code.
- **Headline rule stays at 8 words; the example changes** to the shipped "Leave your BCH to the people you love."
  The rule is what keeps the hero readable in one glance; the old example broke it.
- **56 px display size for the hero from 1280 px: yes,** as `--text-56`, used only by the home headline. Judges asked
  for "enormous text". At 1024 px, in the two-column hero, 56 px broke the headline into three heavy lines, so
  40 px stays below 1280 px.

## Rejected

- A dismissible banner, or one that hides on scroll: the organiser wants it always visible.
- Banner links wrapped into three lines on phones: about 70 px of the first screen spent on admin.
- A horizontally scrolling banner on phones: half the links would be hidden off-screen.
- A bottom tab bar on phones: three links don't justify permanent chrome; a menu is enough.
- A hamburger on the left: it would push the logo off its usual place, and the wallet must stay rightmost.
- A sticky header: the flows have their own bottom actions; a sticky top eats height on small phones.
- A `/dev/kit` page: not wanted, keeps the bundle lean.

## Requests for shared files

1. **`lib/wallet.tsx`** (lead): expose `'wrong-network'` and a `lostConnection` flag (wallet went away mid-flow), so
   the wallet button can show "Wrong network" (warning colour, tap explains how to switch) and "Reconnect".
2. **`lib/types.ts` / `planService`** (lead): nothing needed for the shell.
3. **`banner-config.ts`** (lead or owner): fill `slidesUrl` and `cashTokensAddress` when known.
   `screens/home/links.ts` already shows `bitcoincash:zp42…xadux` in the footer; confirm it is the address you
   control and put the same value in both places.
4. **`screens/home/OpenLinkDialog`** (home owner, later): could move onto `Sheet` to drop its copy of the sheet CSS.
