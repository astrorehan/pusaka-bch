import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { LoadedPlan } from '../../lib/chain/v2';
import { NETWORK } from '../../lib/networkName';
import type { PusakaV2PlanMetadata as Metadata } from '../../lib/protocol/plan-metadata';
import { importPlan, savePlan, savedPlans } from '../../lib/walletData';
import demoPlan from '../../lib/protocol/demo-plan.json';
import type { CurrentPlan } from './currentPlan';
import { isDemoRoute } from './paths';

type Snapshot = { plan: Metadata; data: LoadedPlan | null; error: string };

export function WalletPlanLayout() {
  const { pathname, hash, search } = useLocation();
  const route = pathname.toLowerCase().replace(/\/$/, '');
  const requestedDemo = isDemoRoute(pathname, search);
  const demo = requestedDemo && NETWORK === 'chipnet';
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
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [hash, shared]);
  const selected = requestedDemo ? (demo ? demoPlan as Metadata : null) : shared ? fromLink?.plan ?? null : saved;
  const readEnabled = Boolean(selected && !activity && route !== '/new' && route !== '/wallet/new');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
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
          error: error instanceof Error ? error.message : String(error),
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
    loading: Boolean(readEnabled && (!current || reading === selected)),
    canRefresh: readEnabled,
    error: (demo ? '' : fromLink?.error) || current?.error || '',
    refresh,
    selectPlan,
  };
  return <Outlet context={value} />;
}
