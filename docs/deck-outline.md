# Deck outline (Widget Factory template)

Content for the organiser's "Widget Factory" Google Slides template
([template](https://docs.google.com/presentation/d/1Yfuk9CJkf4U9M_WukcELhumWgj3Ak6345Ewy8hSp-Hk/edit)). The
template has six layouts (title, story, benefits, BCH usage, vision, thank you); the ten slides below reuse them as
noted. Judges read the deck before they open the app, so every slide has to stand on its own.

Rules for the slides: plain words, no "vault", no hype, one idea per slide. Every number here has a source in the
repo or is marked **TODO (owner)**.

---

## 1. Title (layout: title)

**Pusaka.** Decide today who gets your BCH.

- Site: **TODO (owner): hosted app URL**
- Repo: https://github.com/astrorehan/pusaka-bch
- Team: **TODO (owner): name** (the template also asks for an X handle; there is none, so leave it out or put the
  Telegram handle: **TODO (owner)**)

> Speaker note: "Pusaka means heirloom in Indonesian. It lets you leave your BCH to your family, with no company in between."

## 2. The problem (layout: story)

**What happens to your BCH when you die?**

- If nobody has your keys, the coins are lost for good. If somebody has them, they can take everything today.
- Lost keys are a known problem: Chainalysis estimated in 2020 that 3.72 million BTC are lost for good.
  **TODO (owner): add the source link** (reported by The Daily Hodl, 22 Jun 2020). No source counts coins lost
  at death on their own, so say "lost keys", not "deaths".
- On BCH the only tool we found is [Last Will](https://github.com/KarolTrzeszczkowski/Electron-Cash-Last-Will-Plugin)
  (2019): one heir, through an Electron Cash desktop plugin.

> Speaker note: Open with the question, let it land, then the two bad options: lost or handed over too early.

## 3. The solution (layout: benefits)

**Pick your heirs and their shares. If you stop checking in, they receive them.**

- Name your heirs and their shares: equal, your own percentages, or Islamic inheritance (faraid). Choose a waiting time.
- Press **I'm still here** now and then. Take your BCH back at any time.
- If you stop, anyone with the plan link presses **Send to heirs**: one transaction pays every heir their share,
  and the contract refuses any other split.

Image: the home page hero, the logo flower drawn as a family. **TODO (owner): screenshot.**

> Speaker note: A whole family, any split, in the browser, with no company holding the coins.

## 4. Demo (layout: benefits, with one large image)

**One button, a real transaction.** Open `/try`, press **Send to heirs**, approve in Paytaca or Cashonize. One
transaction pays six heirs their faraid shares.

Image: the `/try` plan page ("Ready to send to heirs") next to the explorer view of the payout.
**TODO (owner): screenshots from mainnet, and a QR code to `<app URL>/try`.** Until then, the Chipnet payout
[`d76ffee1…25ad`](https://chipnet.imaginary.cash/tx/d76ffee1296a7d11cc94719e696ed57cdd8781a1389f7fda71eaa66ad48e25ad)
shows the same thing on the test network.

> Speaker note: "You can do this yourself in about a minute; the guide for judges is JUDGE.md in the repo."

## 5. How it works (layout: BCH usage)

- **Three actions** in one SolidCash contract: `checkIn` (owner moves the deadline), `withdraw` (owner takes the
  BCH back), `distribute` (anyone, after the deadline, pays every heir `pot × share ÷ total`).
- **The owner proves who they are by spending one of their own coins** in the same transaction, so the wallet only
  signs an ordinary coin.
- **The plan link carries the plan** (heirs, shares, waiting time) after the `#` in the URL. No server stores it.

Image: `distribute` from [`contract/contracts/Pusaka.scash`](../contract/contracts/Pusaka.scash), lines 48 to 62.

> Speaker note: The rules live on chain; the website is only a convenience, and anyone can host a copy.

## 6. Why Bitcoin Cash and SolidCash (layout: BCH usage)

- **SolidCash brought a Solidity app to BCH.** Pusaka began on Monad in Solidity. The BCH contract keeps the
  Solidity style: a `struct` per heir, a state array, a `modifier`, events, a custom error and the satoshi container.
- **Exact shares, enforced in one transaction.** A payout to 6 heirs on Chipnet was 11,896 bytes with a fee of
  12,086 sats, paid by whoever pressed the button. **TODO (owner): the same in dollars at the price on the day.**
- **Ready for faster blocks.** Time is counted in seconds, so the one-minute blocks planned for May 2027 do not
  shorten anyone's waiting time.

Image: the Monad `PusakaVault.sol` next to `Pusaka.scash`. **TODO (owner): side-by-side screenshot.**

> Speaker note: Also mention the developer feedback for SolidCash: one SDK fix as a patch, the rest as a numbered list in `docs/solidcash-feedback.md`.

## 7. Business (layout: vision)

- **Who:** every self-custody BCH holder with a family. Faraid adds Muslim families, whom no BCH tool serves today.
- **Revenue:** a flat fee of about $1 when a plan is made, shown before signing. **TODO (owner): this fee is not in
  the chain layer as of 16 Nov. Say whether it is live, and how many plans have paid it.**
- **Route to users:** an inheritance feature any BCH wallet can embed (Paytaca, Selene). **TODO (owner): list any
  wallet team you have actually talked to, or drop this line.**

Traction: **TODO (owner): plans created on mainnet, people who tried it, feedback received.**

> Speaker note: Everyone who holds coins faces this, inside crypto and outside it; that is the size of the market.

## 8. What was built during BLAZE (layout: story)

**Before 14 Nov 14:00 UTC:** Pusaka on Monad ([code](https://github.com/astrorehan/pusaka),
[demo](https://pusaka-faraid.vercel.app)), and this repo's tag
[`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start): a CashScript prototype with a 12-case
test, run only in a simulator.

**During BLAZE:**

- The stateful SolidCash contract with 25 SolidHat tests under the real BCH 2026 limits, run on Chipnet end to end.
- A fix to the SolidCash SDK so a wallet can sign stateful calls, plus developer feedback for the maintainer.
- The web app: create a plan, the plan page with its countdown, the judge path, WizardConnect.

> Speaker note: Reused from before: the idea, the faraid rules and the logo. Everything else is new; the full list with commits is in JUDGE.md.

## 9. Team (layout: vision or thank you)

**TODO (owner): name, photo, role, one line of background, Telegram handle.** Keep one name and picture across
Telegram, BCH Research and DoraHacks.

> Speaker note: One line on why this problem matters to you.

## 10. Links (layout: thank you)

- Try it: **TODO (owner): `<app URL>/try`**
- Guide for judges: [JUDGE.md](https://github.com/astrorehan/pusaka-bch/blob/main/JUDGE.md)
- Code now: https://github.com/astrorehan/pusaka-bch
- Before BLAZE: [code](https://github.com/astrorehan/pusaka), [demo](https://pusaka-faraid.vercel.app),
  [tag `blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start)
- Donation and prize address (CashTokens): `bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux`
- Video: **TODO (owner): link, or delete this line**

> Speaker note: "Thank you. If you hold BCH and have a family, make a plan today."
