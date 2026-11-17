# Pusaka web app

Vite + React + TypeScript. Design rules: [`../docs/DESIGN.md`](../docs/DESIGN.md). Read them before touching UI.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

## Current wallet

- `/wallet`: usable protected BCH and fungible receipts.
- `/new` or `/wallet/new`: new asset-enabled setup.
- `/wallet/plan`, `/wallet/swap`, `/wallet/activity`: family rules, test-pair swap and local submissions.
- `/v2/plan#...`: restore a v2 public plan link. `/wallet/demo`: live public Chipnet proof wallet.
- `/plan#...`: existing v1 plan support. `/legacy/new` retains the old setup code.

`src/lib/protocol/` is shared by the browser and contract runners. Install app dependencies
before running Node contract scripts. No fixture keys or filesystem helpers enter the client.
Compile contracts before `npm run sync:artifacts`; `npm run check:artifacts` detects stale bundles.

`npm run test:ui` runs isolated headless browser checks with Microsoft Edge. Set
`PUSAKA_TEST_URL=https://astrorehan.github.io/pusaka-bch/` to test the published base path.
`npm run build:pages` builds that hosted path. [Release evidence](../docs/proofs/app-and-assets.md).

## Mainnet wallet testing

```bash
npm run build:mainnet
npm run preview:mainnet  # http://localhost:4180/new
```

This production build uses mainnet and disables mock mode. Connect Paytaca on your phone by scanning the
WizardConnect QR code. Connecting shares the wallet session; each transaction still needs approval in the wallet.

The mainnet build lives in `dist-mainnet`, separate from the normal `dist` build, so rebuilding the app for UI
work does not remove the mainnet preview. Keep the preview command running while testing.

Run `npm run test:wallet` for offline wallet transport checks (Node 24). These exercise the SDK signer through
WizardConnect's JSON serialization, including CashTokens, change addresses, and rejection of altered outputs.

## Layout

| Path | What |
|---|---|
| `src/styles/tokens.css` | Colour, type, spacing, radius and motion tokens, light and dark. Components use tokens, never raw hex. |
| `src/lib/types.ts` | `PlanData` (what the plan link carries), `PlanState` (live view), `TxPreview`, `TxResult`. Money is `bigint` satoshis. |
| `src/lib/planService.ts` | The only door to the network. Screens call `planService`: the real chain layer (`src/lib/chain/`, loaded lazily), or the mock in development. |
| `src/lib/chain/` | The Pusaka SolidCash contract, signed by the user's WizardConnect wallet. `scripts/chain-e2e.ts` runs it end to end on Chipnet from Node. |
| `src/lib/planLink.ts` | Encodes a plan into `/plan#<data>` and back. No server ever sees it. |
| `src/lib/format.ts`, `src/lib/shares.ts` | BCH/USD formatting, address shortening, share math identical to the contract (floor per heir). |
| `src/lib/wallet.tsx` | `useWallet()`: connect state for the top-right wallet button. |
| `src/components/` | Shared pieces: `Logo` (with the bloom), `Button`, `AppShell` (header). |
| `src/screens/home/` | `/` and `/how-it-works` |
| `src/screens/home/FlowerStage.tsx`, `flowerScene.ts` | Progressive studio hero: still images first, with the actual flower GLB and on-demand Three.js rendering on desktop. Touch devices opt in. |
| `src/screens/home/FamilyCards.tsx` | The three example plans (Equal, Custom, Faraid) as cards dealt and flipped; each links to the matching create preset. |
| `src/screens/home/PaddyScroll.tsx`, `NightPayout.tsx`, `StepsFrame.tsx`, `ClosingSections.tsx` | The landing below the hero: the pinned paddy scene, the night payout, the steps, the heir band and the closing call. Art in `public/landing/`, sources in `brand/landing/`. |
| `src/screens/create/` | `/new`, the create-a-plan flow |
| `src/screens/plan/` | `/plan#…` (a plan from its link) and `/try` (the judge path) |

## Mock knobs

In the dev server only, add to any URL: `?mock=1` (simulated wallet and network), `?mock=cancel` (wallet cancels), `?mock=fail` (network refuses), `?mock=slow` (4 s waits). Production builds ignore `?mock`.

## Facts the UI must respect (from the Chipnet run, 15 Nov)

- Every plan action is a 9 to 12 KB transaction; the network fee is about 9,000 to 12,000 satoshis, paid from the wallet of whoever presses the button (also for "Send to heirs").
- At most 10 heirs.
- The network clock runs about an hour behind real time, so "waiting time ends" dates are approximate by about an hour.
- Heirs need a BCH address. Each share must be at least 546 satoshis.
