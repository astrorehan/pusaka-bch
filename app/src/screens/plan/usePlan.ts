// Loads a plan for the page: from the link in the URL fragment, or the first claimable demo plan (/try).
import { useCallback, useEffect, useRef, useState } from 'react';
import { planService } from '../../lib/planService';
import { decodePlan } from '../../lib/planLink';
import type { PlanData, PlanState } from '../../lib/types';
import { NETWORK } from '../../lib/networkName';
import { DEMO_PLANS } from './demoPlan';

export type PlanLoad =
  | { kind: 'loading' }
  | { kind: 'broken' }
  | { kind: 'missing'; plan: PlanData }
  | { kind: 'other-network'; plan: PlanData }
  | { kind: 'error'; offline: boolean }
  | {
      kind: 'ready';
      plan: PlanData;
      state: PlanState;
      /** Date.now() when `state` was read; the countdown ticks on from here */
      readAt: number;
      usd: number | null;
      /** /try only: every demo plan has already been paid out */
      demoUsed?: boolean;
    };

const REFRESH_MS = 60_000;

// ---- development-only state override (?state=...), see docs/ux/plan.md
type DevState = PlanState['status'] | 'missing' | 'error' | 'loading';
let devStateUsed = false;
function devState(): DevState | null {
  if (!import.meta.env.DEV || devStateUsed) return null;
  const s = new URLSearchParams(window.location.search).get('state');
  return (s as DevState) || null;
}
function applyDev(plan: PlanData, st: PlanState | null, dev: DevState | null): PlanState | null | 'error' {
  if (!dev || !import.meta.env.DEV) return st;
  devStateUsed = true;
  if (dev === 'missing') return null;
  if (dev === 'error') return 'error';
  if (!st || dev === 'loading') return st;
  const t = st.networkTime;
  const p = plan.period;
  const base = { ...st, status: dev };
  if (dev === 'active') return { ...base, deadline: t + (p * 63n) / 100n };
  if (dev === 'ending-soon') return { ...base, deadline: t + (p * 4n) / 100n };
  if (dev === 'claimable') return { ...base, deadline: t - 3600n };
  if (dev === 'sent' || dev === 'taken-back') return { ...base, balance: 0n, lastTxid: 'a3f9c2e17b5d4e08a9c6f1b2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2' };
  return st;
}
// ----

export function usePlan(demo: boolean, hash: string) {
  const [load, setLoad] = useState<PlanLoad>({ kind: 'loading' });
  const current = useRef<PlanData | null>(null);
  const seq = useRef(0);

  const read = useCallback(
    async (silent: boolean) => {
      const my = ++seq.current;
      if (!silent) setLoad({ kind: 'loading' });
      const dev = devState();
      if (import.meta.env.DEV && dev === 'loading') return; // hold the skeleton on screen
      try {
        let plan: PlanData | null;
        let state: PlanState | null = null;
        let demoUsed = false;

        if (demo) {
          // Re-read the plan we are showing; on first load pick the first one still claimable.
          const list = current.current ? [current.current] : DEMO_PLANS;
          plan = null;
          for (const p of list) {
            const s = await planService.readPlan(p);
            if (!s) continue;
            if (!plan) { plan = p; state = s; }
            if (s.status === 'claimable' || current.current) { plan = p; state = s; break; }
          }
          if (plan && state && !current.current && state.status !== 'claimable') demoUsed = true;
          if (!plan) plan = DEMO_PLANS[0];
        } else {
          plan = decodePlan(hash);
          if (!plan) { if (my === seq.current) setLoad({ kind: 'broken' }); return; }
          if (plan.network !== NETWORK) { if (my === seq.current) setLoad({ kind: 'other-network', plan }); return; }
          state = await planService.readPlan(plan);
        }

        const dv = applyDev(plan, state, dev);
        if (dv === 'error') throw new Error('dev: network error');
        state = dv;
        if (my !== seq.current) return;
        // The chain layer answers null for any failed read; offline is not "not found".
        if (!state && typeof navigator !== 'undefined' && navigator.onLine === false) {
          if (!silent) setLoad({ kind: 'error', offline: true });
          return;
        }
        // A quiet re-read that comes back empty is more likely a network hiccup than a vanished plan: keep the page.
        if (!state && silent) return;
        if (!state) { setLoad({ kind: 'missing', plan }); return; }
        current.current = plan;
        setLoad((prev) => ({
          kind: 'ready',
          plan: plan!,
          state: state!,
          readAt: Date.now(),
          usd: prev.kind === 'ready' ? prev.usd : null,
          demoUsed: demoUsed || (prev.kind === 'ready' && prev.demoUsed),
        }));
        void planService.usdPerBch().then((usd) => {
          if (my !== seq.current) return;
          setLoad((prev) => prev.kind === 'ready' && prev.usd !== usd ? { ...prev, usd } : prev);
        }).catch(() => {});
      } catch {
        if (my !== seq.current) return;
        // A silent refresh that fails keeps what is on screen.
        if (silent) return;
        setLoad({ kind: 'error', offline: typeof navigator !== 'undefined' && navigator.onLine === false });
      }
    },
    [demo, hash],
  );

  useEffect(() => {
    current.current = null;
    read(false);
  }, [read]);

  // Quiet re-read every minute, so a plan someone else just paid shows as sent.
  useEffect(() => {
    if (load.kind !== 'ready') return;
    const id = setInterval(() => {
      if (!document.hidden && navigator.onLine) void read(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load.kind, read]);

  return { load, reload: () => read(false), refresh: () => read(true) };
}
