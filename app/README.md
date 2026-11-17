# Pusaka web app

Vite + React + TypeScript. Design rules: [`../docs/DESIGN.md`](../docs/DESIGN.md). Read them before touching UI.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

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
