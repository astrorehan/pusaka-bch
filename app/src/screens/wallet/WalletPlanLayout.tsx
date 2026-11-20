import { friendlyError } from '../../lib/chain/errors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { LoadedPlan } from '../../lib/chain/v2';
import { DEMO_PLAN_DATA, HAS_DEMO } from '../../lib/demo';
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

/**
 * Prefer actionable plans on the current revision, with earlier funded examples as fallbacks.
 */
async function pickDemo(): Promise<Snapshot> {
  if (DEMO_PLANS.length === 1) return { plan: DEMO_PLANS[0], data: null, error: '' };
  const { loadPlan } = await import('../../lib/chain/v2');
  const loaded: Snapshot[] = await Promise.all(
    DEMO_PLANS.map((plan) =>
      loadPlan(plan).then(
        (data) => ({ plan, data, error: '' }),
        (error: unknown) => ({ plan, data: null, error: friendlyError(error) }),
      ),
    ),
  );
  const rank = ({ plan, data }: Snapshot) => {
    if (!data) return 9;
    const { state, review, now, funding } = data;
    const current = plan.protocolRevision === CURRENT_ASSET_REVISION;
    if (funding.canSelfFund) {
      if (state.status === 'REVIEW' && review?.ready) return current ? 0 : 2;
      if ((state.status === 'ACTIVE' || state.status === 'CLOSED') && now > state.deadline && funding.canSelfFund) return current ? 1 : 3;
      if (state.status === 'REVIEW') return current ? 4 : 5;
    }
    return current ? 6 : 7;
  };
  return loaded.reduce((best, next) => (rank(next) < rank(best) ? next : best));
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
  const [demoPick, setDemoPick] = useState<Snapshot | null>(null);
  const selected = requestedDemo ? (demo ? demoPick?.plan ?? null : null) : shared ? fromLink?.plan ?? null : saved;
  const readEnabled = Boolean(selected && !activity && route !== '/new' && route !== '/wallet/new');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!demo || demoPick) return;
    let live = true;
    pickDemo()
      .catch((error: unknown): Snapshot => ({
        plan: DEMO_PLANS[0],
        data: null,
        error: friendlyError(error),
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
  const [reading, setReading] = useState<Metadata | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const savedLink = useRef<Metadata | null>(null);
  const current = snapshot?.plan === selected ? snapshot : null;

  const selectPlan = useCallback((plan: Metadata) => {
    savePlan(plan);
    setSaved(plan);
  }, []);

  const refresh = useCallback(async () => {
    if (!selected || !readEnabled) return;
    setReading(selected);
    const request = import('../../lib/chain/v2')
      .then(({ loadPlan }) => loadPlan(selected))
      .then((data) => {
        if (pending.current !== request) return;
        setSnapshot({ plan: selected, data, error: '' });
        if (fromLink && savedLink.current !== selected) {
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
    loading: Boolean(readEnabled && (!current || reading === selected)) || (demo && !demoPick),
    canRefresh: readEnabled,
    error: (demo ? '' : fromLink?.error) || current?.error || '',
    refresh,
  };
  return <Outlet context={value} />;
}
