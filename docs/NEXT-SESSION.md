# Next session

18 November 2026. Wallet implementation and the Chipnet asset lifecycle are saved.

- Public Chipnet app: https://astrorehan.github.io/pusaka-bch/wallet/demo
- Source branch: `web-app` (pushed). Static publication branch: `gh-pages`.
- [Current proof and remaining gates](proofs/app-and-assets.md).
- [Owner and family guide](demo-guide.md).
- [Presentation content](deck-outline.md).

The published wallet is a public fixture on Chipnet. Its owner differs from the
user's real Paytaca wallet. PSK is a test token with no monetary value.
The earlier v1 mainnet plan has not been migrated or spent.

## Start locally after reboot

In `app/`:

```powershell
npm run preview:mainnet
# http://localhost:4180/wallet
# http://localhost:4180/plan retains the existing v1 link route
```

`dist-mainnet` is already built. If rebuilding, run `npm run build:mainnet` first.
For development, use `npm run dev`. A normal production test build uses `npm run
build` and `npm run preview`; the published path uses `npm run build:pages`.
On a clean checkout, install dependencies in both `app/` and `contract/`.
Contract runners import the shared browser-safe protocol from the app directory.

## Required human checks

The implementation has passed 18 v2/asset tests, 26 earlier contract tests,
3 wallet JSON transport tests and 2 browser tests. Chipnet accepted swap,
contact review, mature BCH payout and exact fungible token inheritance.

The following do not follow from those checks:

1. Actual Paytaca phone signing of the new covenants, wallet rejection, reconnect
   and recovery on that device. Approve only the reviewed transaction in the app.
2. Small reviewed v2 mainnet creation, partial use, false-claim cancellation and
   valid multi-heir payout. Keep the older v1 plan separate.
3. A real mainnet pair with protected token return and inheritance. The UI
   currently enables the qualified Chipnet BCH / PSK test pair only.
4. Uploading the current presentation into the organiser's Slides template and
   setting its public URL. The release includes the updated content outline.

No seed phrase is required. These gates keep stage 6 partially qualified.
