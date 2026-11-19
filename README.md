> **Judging Pusaka?** Start with [JUDGE.md](JUDGE.md), a three-minute read: the one-minute judge path, the
> transactions you can open, what the network refuses, and exactly what was built during BLAZE.

# Pusaka

**A Bitcoin Cash wallet with your inheritance plan built in.** Spend and receive as usual. If you go quiet, a
claim can open, the network gives you a review period to stop it, and then one transaction pays every heir their
share: equal, your own split, or Islamic inheritance (faraid). No company or server in between.

*Pusaka* is Indonesian for "heirloom".

Built during [BCH BLAZE 2026](https://dorahacks.io/hackathon/bchblaze2026) (14 to 22 Nov 2026) for the Mainnet
Track and the Best SolidCash Application bounty.

| | |
|---|---|
| **Web app** (mainnet) | https://astrorehan.github.io/pusaka-bch/ |
| **Judge path** (one button, a real transaction, no wallet needed) | https://astrorehan.github.io/pusaka-bch/wallet/demo |
| **The same app on Chipnet** (test network) | https://astrorehan.github.io/pusaka-bch/chipnet/ |
| **Guide for judges** | [JUDGE.md](JUDGE.md) |
| **Presentation** | [Pusaka-BCH-BLAZE-2026.pdf](docs/Pusaka-BCH-BLAZE-2026.pdf) |
| **On-chain record** | [`docs/proofs/v2-live.md`](docs/proofs/v2-live.md) |
| **Feedback for SolidCash** | [`docs/solidcash-feedback.md`](docs/solidcash-feedback.md), from the dated [developer log](docs/solidcash-dx-log.md) |
| **Prize and donation address** (CashTokens) | `bitcoincash:zp42zmv85mgnrh2qvwmgqjxcn2f9lewvdcpu8xadux` |

## Why

If nobody has your keys when you die, your coins are lost for good. If somebody has them, they can take
everything today. Existing answers lock the coins away: a dead man's switch you cannot spend from, or a single
heir through a desktop plugin. Pusaka keeps the coins in a wallet you use every day, and every payment you make
is proof you are still here.

## How it works

1. **Set up.** Heirs and shares, three trusted contacts, a waiting time and a review period. Your BCH moves into
   your Pusaka wallet, and you get a plan link to share with your family.
2. **Use it.** Send, receive and swap. Each payment you send restarts the waiting time.
3. **A claim opens** once the waiting time passes in silence (anyone can open it), or sooner when two of your
   three contacts confirm.
4. **The review period** is enforced by the network with a BIP68 relative time lock. **Stop claim**, or any
   payment you send, ends the claim.
5. **Pay the heirs.** After the review anyone can submit the payout. Every node checks each heir's address and
   amount; the plan pays the fee.

The plan's state lives in a CashTokens NFT that never leaves the plan. Its rules (heirs, shares, contacts, fee
budget) travel in the plan link after the `#`, which browsers never send to a server, and every claim is checked
against their hash.

## What is where

| Folder | What |
|---|---|
| [`app/`](app/) | The web app (Vite, React, TypeScript). WizardConnect for Paytaca and Cashonize; public Electrum servers; no server of its own |
| [`app/src/lib/protocol/`](app/src/lib/protocol/) | Browser-safe transaction builders and plan codecs, shared by the app and the scripts |
| [`contract/contracts/`](contract/contracts/) | The SolidCash contracts. The wallet: `PusakaAssetPlan`, `PusakaV2Inbox`, `PusakaV2Anchor`, `PusakaTokenVault`. Earlier: `PusakaV2Plan` (BCH-only v2), `Pusaka` (v1) and `VaultStateless` (the pre-BLAZE prototype, ported) |
| [`contract/test/`](contract/test/) | SolidHat tests under the BCH 2026 limits and a strict BIP68 verifier |
| [`contract/scripts/v2/live.ts`](contract/scripts/v2/live.ts) | Runs the lifecycle and the example plans on Chipnet or mainnet, and keeps their public records |
| [`docs/`](docs/) | [Design rules](docs/DESIGN.md), [UX notes](docs/ux/), [proofs](docs/proofs/), the [SolidCash developer log](docs/solidcash-dx-log.md) and [feedback](docs/solidcash-feedback.md) |
| [`prototype/`](prototype/) | The pre-BLAZE CashScript covenant and its 12-case simulator test, kept unchanged |
| [`brand/`](brand/) | The Pusaka logo |

## Run it

Needs Node 24.

```bash
cd app
npm install
npm run dev              # the Chipnet app, http://localhost:5173
npm run build:mainnet    # a mainnet build in dist-mainnet
npm run build:pages      # the published site: mainnet at /pusaka-bch/, Chipnet at /pusaka-bch/chipnet/
npm run build && npm run test:ui   # browser tests against the Chipnet build
```

```bash
cd contract
npm install
npm test                 # compiles the contracts, then runs every SolidHat test
```

`npm test` runs Vitest directly after compiling, because `solidhat test` exits without running the tests on
Windows. The live runner needs keys in `contract/.env` (never committed):

```bash
node --env-file=.env node_modules/@solidcash/solidhat/dist/cli.js run scripts/v2/live.ts --network chipnet
```

## Before and after BLAZE

Pusaka began as a Solidity vault on Monad ([code](https://github.com/astrorehan/pusaka),
[demo](https://pusaka-faraid.vercel.app)). This repository at tag
[`blaze-start`](https://github.com/astrorehan/pusaka-bch/tree/blaze-start) held only a README, the licence and a
CashScript prototype. Reused: the idea, the faraid rules and the logo. Everything after `blaze-start` (the
SolidCash contracts, the wallet, the review period, the token vault, the web app and the live runs) was built
during BLAZE. Details: [JUDGE.md](JUDGE.md#before-and-after-blaze).

## License

[MIT](LICENSE)
