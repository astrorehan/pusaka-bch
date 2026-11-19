# App and fungible asset release

18 November 2026, test counts updated 19 November. The implementation record for the app and the
token-enabled plan revision (`assets-1`), with the swap and token payout run on Chipnet and the Paytaca
phone signing check. The whole wallet lifecycle on 19 November is recorded separately in
[v2-live.md](v2-live.md). What this record does not yet show is listed [at the end](#not-yet-shown).
The previous funded v1 mainnet plan was not migrated or spent.

## Application

Published app: https://astrorehan.github.io/pusaka-bch/ (mainnet) and
https://astrorehan.github.io/pusaka-bch/chipnet/ (Chipnet). Example plans: `/wallet/demo` on either.

The desktop sidebar folds into a rail. Phones use a drawer. Wallet, inheritance,
activity, setup and swap are separate routes. Transaction dialogs show recipients,
fees, protected change and returned authorization funds before signing.

`app/src/lib/protocol/` contains the browser-safe codecs, artifacts and builders.
The contract runner re-exports the same module. No filesystem loaders, test keys,
mnemonics or chain runners enter the client bundle. `npm run check:artifacts`
compares all five bundled artifacts with compiler output.

The app discovers live plan/inbox/token UTXOs and uses confirmed-anchor chain age
for review readiness. It checks for stale plan state before signing. Wallet
rejection, quote expiry and ambiguous broadcast failure are explicit outcomes.
Local activity records say **Accepted**, not confirmed. Explorer links let users
inspect confirmations; importing a plan does not pretend to import its history.

Onboarding keeps an ordinary owner coin of at least 600 sats, separate from the
1,000-sat plan identity. A separately reviewed preparation transaction can gather
ordinary HD wallet coins into the first receive address. Each owner action still
requires normal wallet approval. A plan link or JSON restores public state without
holding a spending key. Saved browser data is a convenience, not the sole backup.

`/plan` and `/legacy/new` retain the v1 code path. New setup at `/new` and
`/wallet/new` creates the asset-enabled revision. Existing contracts do not upgrade.

## Asset revision

Metadata retains `version: pusaka-v2` and adds `protocolRevision: assets-1`.
Missing revision selects the original v2 artifact. Unknown revisions fail closed.
The new `PusakaAssetPlan` retains the prior state machine and adds:

- `assetAction(maximumDebit)`: owner co-signature, bounded approved BCH debit,
  identity preservation, deadline renewal, round advancement and review cancellation.
- `assetDistribution()`: a public co-spend of a PAID_OUT plan that preserves its
  complete state and BCH. It lets the token covenant authenticate the current policy.

`PusakaTokenVault` binds the immutable plan identity and locking script. An owner
token send co-spends the plan, renewing activity. Public token payout requires a
completed BCH claim and the current policy preimage. Old policy links cannot
redirect a payout. Token carriers and payout fees come from the submitter's ordinary
BCH, while the plan and receipt BCH remain preserved.

Fungible amounts use integer floor shares. All indivisible rounding units go to
the final configured heir. A tiny receipt may give zero token units to earlier
heirs; their carrier outputs remain plain BCH. No token units are burned or left
as an unclaimable remainder. NFTs and arbitrary DeFi positions are outside this flow.

## Supported swap

The supported pair is **BCH / PSK on Chipnet**, using a real Cauldron V0 pool.
PSK is a test fungible token with no monetary value. Mainnet trading stays
unavailable until a real pair and phone signing have been qualified.

The adapter uses `@cashlab/cauldron` to derive the actual pool script and unlocker.
It verifies that the configured pool address matches that script, reconstructs
the pool at its input index, applies the pool's 0.3% liquidity fee and checks a
positive minimum return. Quotes expire after 60 seconds. A conflicting pool spend
invalidates the whole transaction. The owner's signature commits to exact outputs.

One atomic swap spends protected BCH, renews activity, returns the ordinary auth
coin, recreates the pool and pays fungible proceeds directly to the token vault.
There is no intermediate unprotected owner token output or separate allocation.
The UI supports BCH-to-token purchase for this pair, not arbitrary pairs or sales.
Protocol reference: https://docs.riftenlabs.com/cauldron/swap/

## Live Chipnet evidence

Public machine-readable record:
[`contract/scripts/v2/.assets-chipnet-proof.json`](../../contract/scripts/v2/.assets-chipnet-proof.json).

| Step | Transaction / result |
|---|---|
| Test-token issuance to Cauldron | `584cd103dce828c85d8ba2f073a339973f7269b42483bf093ff8f52c71d4a839` |
| Asset-enabled plan genesis | `8f375a275303a0440dc0c2ef366d743aae5013b8632b95e79bdccb6a0ca1befa` |
| Buy with 5,000 sats, receive 199,519 units directly in vault | `e2f4f53ed2b87c8c82f2bc6fdd677f189e4a972f393fe25ebe81056c3b2ea32b` |
| First contact approval | `932692c017957d8be5adf2f4efe5677f8e00034bc61b630f6f3b315ca0c954c7` |
| Second contact opens review | `511de7f9285355e06e6650306fe74d4e5c731f92592d4fd3e3c63d75a9637d8a` |
| Immediate BCH finalize | Rejected by node: `non-BIP68-final` |
| Mature BCH finalize | `831d90bc31ab61ce892ef864da9412e0309f78ff0d99777fd11123a9e405d718` |
| Fungible inheritance payout | `edd445747c8bd90dfc6af3e5c744a3e856c06a4bf457f3714ef58e522eb25f67` |

Anchor confirmation: height 335584. Mature spend: tip 335588, 605 seconds of
previous-block median-time age, exceeding the configured 512 seconds.
The token payout pays 66,506, 66,506 and 66,507 units, with 800 sats per heir
carrier and a 5,190-sat network fee. Raw transaction and all predecessor outputs
were fetched independently to check token conservation and fee accounting.
External signing used a local deterministic stand-in, **not a Paytaca phone**.

## Paytaca phone signing on Chipnet

18 November 2026, about 11:20 to 11:31 UTC. The app's own owner flow, connected
over WizardConnect to Paytaca on an actual phone in Chipnet mode. The heir was the
tester's Paytaca address; the three contacts were demo addresses.

| Step | Result |
| --- | --- |
| Pair | Paytaca connected from the QR in the review sheet |
| Create plan, 30,000 sats | Signed on the phone. 29,000 sats protected, 1,000 sats plan identity, 335-sat fee. [`051af5d7…d9b9`](https://chipnet.chaingraph.cash/tx/051af5d7d96f3777991795511c71fa2d93689a239e6ff879bf1c8af2af5dd9b9) |
| Send 2,000 sats, first request | Rejected in Paytaca. The app reported the rejection; the protected balance stayed 29,000 sats |
| Send 2,000 sats, second request | The phone's output list matched the app's review: 2,000 sats out, 28,000 sats back to Pusaka (27,000 protected + 1,000 identity), 4,109-sat fee from ordinary Paytaca funds. Approved. Owner activity moved forward. [`b31fe96b…bdb1`](https://chipnet.chaingraph.cash/tx/b31fe96bbe819162b35e62b77e05366fbbedd19aa26a4991f8be7ffdbdc2bdb1) |
| Reopen while disconnected | The plan link loaded from the network with the wallet disconnected |
| Reconnect | A fresh QR paired the same Paytaca address; Send was enabled again |

Not covered by this run: an incoming payment after the send, a second send, and
restore from a saved plan file in a fresh browser session. The reopen used the
same browser.

## Automated qualification

- Compiler: all 11 contract files compile without errors.
- SolidHat contract tests: **58/58** pass (`npm test` in `contract/`) under the BCH 2026 VM and a
  strict BIP68 verifier. The v2, metadata, review and asset suites cover actual pool script execution,
  early payout rejection, recipient hijack, policy changes, 10 heirs, tiny indivisible amounts, partial
  token sends, protected token change, expired quotes and theft; the rest cover v1 and stages 1 and 2.
- WizardConnect actual JSON transport: **3/3** pass, including tampered-output rejection.
- Browser tests: **6/6** pass (`npm run test:ui` in `app/`). They exercise setup validation, the
  desktop, tablet and phone layouts, a live public Chipnet plan without signing, recoverable errors,
  wallet pairing and the landing page.
- Normal, mainnet and hosted-path production builds pass TypeScript and Vite.

These are selected applicable tests, not a claim that every historical scratch
test in this repository passes. Mainnet builds compiling does not prove mainnet
execution. A phone-sized browser viewport does not prove Paytaca mobile signing.

## Not yet shown

1. Paytaca on the phone: creation, rejection, partial send and reconnect passed on
   Chipnet (above). Not yet run on the phone: receive into the plan, a second send,
   and restore from saved plan data in a fresh session.
2. The v2 lifecycle on mainnet. It ran end to end on Chipnet ([v2-live.md](v2-live.md));
   the earlier v1 plan is the mainnet record so far, and stays separate.
3. A mainnet token pair. Swaps and token payouts are proven with the Chipnet test token
   above, which is not that proof, so the mainnet app does not offer swaps yet.
