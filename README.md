> **Judging Pusaka?** Start with [JUDGE.md](JUDGE.md), a 3-minute read: what to press, the transactions you can
> open, the attack table and exactly what was built during BLAZE.

# Pusaka

**Decide today who gets your BCH.** If you stop checking in, a contract splits your coins among your heirs by the shares you chose (equal, custom percentages, or Islamic inheritance law), in one transaction, with no company or server in between.

*Pusaka* is Indonesian for "heirloom".

> Status: being built during [BCH BLAZE 2026](https://dorahacks.io/hackathon/bchblaze2026) (14 to 22 Nov 2026).
> Entered for the Mainnet Track and the Best SolidCash Application bounty.

> **Wallet release, 18 Nov:** [open the live Chipnet app](https://astrorehan.github.io/pusaka-bch/wallet/demo).
> The v2 app now includes a usable protected BCH balance, Send/Receive, contacts,
> claim review, policy editing and protected fungible token proceeds from a real
> Cauldron V0 test pair. [Release evidence](docs/proofs/app-and-assets.md) and
> [owner/family guide](docs/demo-guide.md). Selected qualification: 18 v2/asset
> tests, 26 earlier contract tests, 3 signing transport tests and 2 browser tests pass.
> Actual Paytaca phone approval, v2 mainnet execution and a mainnet trading pair
> remain open gates. The existing funded v1 mainnet plan is separate and untouched.
>
> The receipts below retain the earlier v1 milestone. They do not prove v2 mainnet use.

## Live now

What works today, each with its proof. A plan was created on mainnet through Paytaca on 17 Nov; the remaining
mainnet lifecycle actions still need to be verified.

| What | Proof |
|---|---|
| Guide for judges | [JUDGE.md](JUDGE.md) |
| Web app | **TODO (owner): hosted URL.** Runs locally today, see [Run it](#run-it) |
| Presentation (Widget Factory) | **TODO (owner): deck link** |
| Demo video | **TODO (owner): link, or delete this row** |
| The contract: create, I'm still here, take back, send to heirs | [`contract/contracts/Pusaka.scash`](contract/contracts/Pusaka.scash), 11 tests in [`contract/test/Pusaka.test.ts`](contract/test/Pusaka.test.ts) |
| The whole lifecycle on Chipnet (test network) | 5 transactions on 15 Nov and 3 on 16 Nov, listed in [JUDGE.md](JUDGE.md#transactions-you-can-open) |
| An outside wallet can sign every stateful call over `bch_signTransaction` (with our SDK fix) | Chipnet transactions of 16 Nov, signed by a stand-in wallet in Node ([script](contract/scripts/external-signing-spike.ts)); the [patch](contract/patches/@solidcash+solidcash+0.50.1.patch) and [the log](docs/solidcash-dx-log.md). **TODO (owner): add txids signed in Paytaca and Cashonize** |
| On mainnet | Plan created in the app through Paytaca: [`4e5b2fd4…1c3d`](https://explorer.bch.ninja/tx/4e5b2fd4cdb51a96d0ed00c423d8e0a9b5eeabb1c2dfadce4ce3ee8f70911c3d), 17 Nov. **TODO (owner): sent to heirs, I'm still here, taken back (txids)** |
| SolidCash developer feedback | [`docs/solidcash-feedback.md`](docs/solidcash-feedback.md), from the dated [log](docs/solidcash-dx-log.md) |
| Donation and prize address (CashTokens) | `bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux` |
| Repository | https://github.com/astrorehan/pusaka-bch |

## Receipts

Each claim and where to check it.

| Claim | Check it |
|---|---|
| One transaction pays every heir their exact share | Chipnet payout [`d76ffee1…25ad`](https://chipnet.imaginary.cash/tx/d76ffee1296a7d11cc94719e696ed57cdd8781a1389f7fda71eaa66ad48e25ad): outputs #3 to #8 are 58,000 sats × 15, 20, 20, 26, 26, 13 ÷ 120, rounded down |
| Anyone can send to the heirs, not only the owner | Chipnet payout paid by a stranger's wallet: [`187ac296…a90c`](https://chipnet.imaginary.cash/tx/187ac29671c0c75ff40fdf9ab0ceb421f3e08e53e9167173402b62290d13a90c) |
| I'm still here moves the deadline; only the owner can press it | [`73dabfc1…2a12`](https://chipnet.imaginary.cash/tx/73dabfc17d3804fb6a6351a60885a07764c0cf0075fbd2d86c0195c3e34f2a12) on Chipnet; tests `owner check-in moves the deadline forward and emits CheckedIn` and `a stranger cannot check in` |
| The contract refuses cheating payouts (early, 1 satoshi off, swapped address, 11 heirs) | The [attack table](JUDGE.md#the-attack-table), each row with its test name |
| Tests pass under the real BCH 2026 limits, not the relaxed mock defaults | [`contract/solidcash.config.ts`](contract/solidcash.config.ts); `cd contract && npm test` prints "Tests 25 passed" |
| Time is counted in seconds, so faster blocks in 2027 don't shorten the wait | `checkIn` sets `deadline = tx.locktime + period` and `distribute` requires `tx.time >= this.deadline`, in [`Pusaka.scash`](contract/contracts/Pusaka.scash) |
| No server stores the plan | The plan lives in the URL after `#`: [`app/src/lib/planLink.ts`](app/src/lib/planLink.ts). The app has no server of its own; it talks only to public BCH (Electrum) servers and a price feed |
| What existed before BLAZE | Tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start) and the section below |

## Before and after BLAZE

Judges score the work done during the hackathon, so here is exactly what existed before it started (14 Nov 2026, 14:00 UTC).

- **Pusaka on Monad (earlier hackathon, Solidity):** [repo](https://github.com/astrorehan/pusaka) · [demo](https://pusaka-faraid.vercel.app). Reused here: the product idea, the faraid share rules and the flower logo (`brand/`).
- **This repo at the start of BLAZE:** tag [`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start) (commit `8b59ba5`, 14 Nov 02:30 UTC). It holds only a README, the license and `prototype/`, a test contract.
- **`Preparation/`:** planning notes as they stood at the start, committed at 14:28 UTC on 14 Nov. No code.
- **Everything after `blaze-start`** is BLAZE work: the SolidCash contract, the web app, the Chipnet runs and the docs. The full list, with commits, is in [JUDGE.md](JUDGE.md#before-and-after-blaze).

## What is where

| Folder | What |
|---|---|
| [`app/`](app/) | The web app (Vite, React, TypeScript). Connects a wallet with WizardConnect and talks to the contract with the SolidCash SDK. No server of its own |
| [`contract/`](contract/) | The SolidCash contracts and their SolidHat tests: `Pusaka.scash` (the one the app uses) and `VaultStateless.scash` (the prototype, ported) |
| [`prototype/`](prototype/) | The pre-BLAZE CashScript covenant and its 12-case test. Kept unchanged as the "before" |
| [`docs/`](docs/) | [Design rules](docs/DESIGN.md), [UX notes](docs/ux/), the [SolidCash developer log](docs/solidcash-dx-log.md) and [feedback](docs/solidcash-feedback.md), the [deck outline](docs/deck-outline.md) |
| [`brand/`](brand/) | The Pusaka logo (light, dark, favicon), reused from the Monad version |
| [`Preparation/`](Preparation/) | Notes from before the start |

## Run it

Needs Node 24.

**The web app** (Chipnet by default):

```bash
cd app
npm install
npm run dev      # http://localhost:5173
```

`VITE_NETWORK=mainnet npm run dev` runs it against mainnet. Adding `?mock=1` to a URL simulates the network and the
wallet for the rest of the browser tab, so every screen can be seen without coins. More in [`app/README.md`](app/README.md).

**The contract tests** (SolidHat, no network needed):

```bash
cd contract
npm install
npm test         # 2 test files, 25 tests
```

`npm test` compiles and then runs Vitest directly, because `solidhat test` exits without running the tests on Windows.

**The prototype** (CashScript, in a simulator):

```bash
cd prototype
npm install
npm test         # 12 cases, each printed as PASS
```

It covers early payout, underpaying an heir by one satoshi, swapping an heir's address, adding an extra output, and check-in by a stranger.

## License

[MIT](LICENSE)
