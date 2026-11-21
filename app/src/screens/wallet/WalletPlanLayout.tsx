import { friendlyError } from '../../lib/chain/errors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { LoadedPlan } from '../../lib/chain/v2';
import { DEMO_CATEGORIES, DEMO_PLAN_DATA, HAS_DEMO } from '../../lib/demo';
import { CURRENT_ASSET_REVISION, readV2Metadata, type PusakaV2PlanMetadata as Metadata } from '../../lib/protocol/plan-metadata';
import { importPlan, savePlan, savedPlans } from '../../lib/walletData';
import type { CurrentPlan } from './currentPlan';
import { isDemoRoute } from './paths';

type Snapshot = { plan: Metadata; data: LoadedPlan | null; error: string };

const DEMO_PLANS: Metadata[] = DEMO_PLAN_DATA.flatMap((value) => {
  try {
    return [readV2Metadata(value)];
  } catch {
    return [];
  }
});

type DemoPick = Snapshot & { unread: number };

/**
 * Pick the example with the most a visitor can do at once: a payout ready to send (current revision first),
 * then a claim ready to open, then one under review. Paid examples come last, and `unread` counts the examples
 * the network could not be asked about, so "all paid" is said only when every example was checked.
 */
async function pickDemo(): Promise<DemoPick> {
  if (DEMO_PLANS.length === 1) return { plan: DEMO_PLANS[0], data: null, error: '', unread: 0 };
  const { loadPlan } = await import('../../lib/chain/v2');
  // Ask in a random order, so visitors arriving together get different examples, and take the first ready
  // payout on the current revision as soon as it is read: one slow read must not hold the page.
  const order = [...DEMO_PLANS].sort(() => Math.random() - 0.5);
  let early: ((pick: DemoPick) => void) | null = null;
  const first = new Promise<DemoPick>((resolve) => (early = resolve));
  const reads = order.map((plan) =>
    loadPlan(plan, { fresh: true }).then(
      (data): Snapshot => {
        const snapshot = { plan, data, error: '' };
        if (rank(snapshot) === 0) early?.({ ...snapshot, unread: 0 });
        return snapshot;
      },
      (error: unknown): Snapshot => ({ plan, data: null, error: friendlyError(error) }),
    ),
  );
  const all = Promise.all(reads).then((loaded) => {
    // Several examples are equally ready. Spread visitors over them, so two people opening the demo at the
    // same time rarely reach the same plan, where the second payout would find its inputs already spent.
    const best = Math.min(...loaded.map(rank));
    const ties = loaded.filter((snapshot) => rank(snapshot) === best);
    const unread = loaded.filter((snapshot) => !snapshot.data).length;
    return { ...ties[Math.floor(Math.random() * ties.length)], unread };
  });
  return Promise.race([first, all]);
}

function rank({ plan, data }: Snapshot) {
    if (!data) return 9;
    const { state, review, now, funding } = data;
    const current = plan.protocolRevision === CURRENT_ASSET_REVISION;
    if (state.status === 'PAID_OUT') return 8;
    if (funding.canSelfFund) {
      if (state.status === 'REVIEW' && review?.ready) return current ? 0 : 1;
      if ((state.status === 'ACTIVE' || state.status === 'CLOSED') && now > state.deadline) return current ? 2 : 3;
      if (state.status === 'REVIEW') return current ? 4 : 5;
    }
    return current ? 6 : 7;
}

export function WalletPlanLayout() {
  const { pathname, hash, search } = useLocation();
  const route = pathname.toLowerCase().replace(/\/$/, '');
  const requestedDemo = isDemoRoute(pathname, search);
  const demo = requestedDemo && HAS_DEMO && DEMO_PLANS.length > 0;
  const shared = route === '/v2/plan';
  const activity = route === '/wallet/activity';
  const editing = route === '/wallet/edit';
  const [saved, setSaved] = useState<Metadata | null>(() => savedPlans()[0] ?? null);
  const fromLink = useMemo(() => {
    if (!shared || !hash || hash === '#wallet-main') return null;
    try {
      return { plan: importPlan(hash), error: '' };
    } catch (error) {
      return {
        plan: null,
        error: friendlyError(error),
      };
    }
  }, [hash, shared]);
  const [demoPick, setDemoPick] = useState<DemoPick | null>(null);
  // The best pick had already paid out, and every example was read: all of them have paid their heirs.
  const demoExhausted =
    DEMO_PLANS.length === 1 ||
    (demoPick?.data ? demoPick.data.state.status === 'PAID_OUT' && demoPick.unread === 0 : false);
  // None of the examples could be read: the network servers did not answer.
  const demoUnreachable = Boolean(demoPick && !demoPick.data && DEMO_PLANS.length > 1);
  const nextDemo = useCallback(() => setDemoPick(null), []);
  // A pick made while no example could be read is only a placeholder: show the network notice, not that plan.
  const demoPlan = demoPick && (demoPick.data || DEMO_PLANS.length === 1) ? demoPick.plan : null;
  const selected = requestedDemo ? (demo ? demoPlan : null) : shared ? fromLink?.plan ?? null : saved;
  const readEnabled = Boolean(selected && !activity && route !== '/new' && route !== '/wallet/new');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!demo || demoPick) return;
    let live = true;
    pickDemo()
      .catch((error: unknown): DemoPick => ({
        plan: DEMO_PLANS[0],
        data: null,
        error: friendlyError(error),
        unread: DEMO_PLANS.length,
      }))
      .then((pick) => {
        if (!live) return;
        setDemoPick(pick);
        if (pick.data) setSnapshot(pick);
      });
    return () => {
      live = false;
    };
  }, [demo, demoPick]);
  // No example could be read: choose again when the browser is back online, and every 30 seconds.
  useEffect(() => {
    if (!demo || !demoPick || demoPick.data || DEMO_PLANS.length === 1) return;
    const retry = () => {
      if (navigator.onLine && !document.hidden) setDemoPick(null);
    };
    const timer = window.setInterval(retry, 30_000);
    window.addEventListener('online', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
    };
  }, [demo, demoPick]);

  const [reading, setReading] = useState<Metadata | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const savedLink = useRef<Metadata | null>(null);
  const current = snapshot?.plan === selected ? snapshot : null;

  const selectPlan = useCallback((plan: Metadata) => {
    savePlan(plan);
    setSaved(plan);
  }, []);

  const refresh = useCallback(async (fresh = false) => {
    if (!selected || !readEnabled) return;
    setReading(selected);
    const request = import('../../lib/chain/v2')
      .then(({ loadPlan }) => loadPlan(selected, { fresh }))
      .then((data) => {
        if (pending.current !== request) return;
        setSnapshot({ plan: selected, data, error: '' });
        // A link to a public example plan only shows it. It never becomes this browser's own wallet.
        if (fromLink && savedLink.current !== selected && !DEMO_CATEGORIES.has(selected.planCategoryHex.toLowerCase())) {
          savedLink.current = selected;
          selectPlan(selected);
        }
      })
      .catch((error: unknown) => {
        if (pending.current !== request) return;
        setSnapshot({
          plan: selected,
          data: null,
          error: friendlyError(error),
        });
      })
      .finally(() => {
        if (pending.current === request) {
          pending.current = null;
          setReading(null);
        }
      });
    pending.current = request;
    return request;
  }, [fromLink, readEnabled, selected, selectPlan]);

  useEffect(() => {
    if (!readEnabled) return;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void refresh();
    });
    function poll() {
      if (!pending.current && !document.hidden && navigator.onLine) void refresh();
    }
    if (editing) return () => {
      disposed = true;
      pending.current = null;
    };
    const timer = window.setInterval(poll, 30_000);
    document.addEventListener('visibilitychange', poll);
    window.addEventListener('online', poll);
    return () => {
      disposed = true;
      pending.current = null;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('online', poll);
    };
  }, [readEnabled, refresh, editing]);

  const value: CurrentPlan = {
    metadata: activity || current?.data ? selected : null,
    data: current?.data ?? null,
    demo,
    demoExhausted,
    demoUnreachable,
    nextDemo,
    loading: Boolean(readEnabled && (!current || reading === selected)) || (demo && !demoPick),
    canRefresh: readEnabled,
    error: (demo ? '' : fromLink?.error) || current?.error || '',
    refresh,
  };
  return <Outlet context={value} />;
}
