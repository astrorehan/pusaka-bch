import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import * as api from '../../lib/chain/v2';
import demoPlan from '../../lib/protocol/demo-plan.json';
import type { CurrentPlan } from './currentPlan';
import { isDemoWallet } from './paths';

type Metadata = api.PusakaV2PlanMetadata;
type Snapshot = { plan: Metadata; data: api.LoadedPlan | null; error: string };

export function WalletPlanLayout() {
  const { pathname, hash, search } = useLocation();
  const demo = isDemoWallet(pathname, search);
  const [saved, setSaved] = useState<Metadata | null>(
    () => api.savedPlans()?.[0] ?? null,
  );
  const fromLink = useMemo(() => {
    if (!hash || hash === '#wallet-main') return null;
    try {
      return { plan: api.importPlan(hash), error: '' };
    } catch (error) {
      return {
        plan: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [hash]);
  const selected = demo
    ? (demoPlan as Metadata)
    : fromLink
      ? fromLink.plan
      : saved;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reading, setReading] = useState<Metadata | null>(null);
  const pending = useRef<object | null>(null);
  const savedLink = useRef<Metadata | null>(null);
  const current = snapshot?.plan === selected ? snapshot : null;

  const selectPlan = useCallback((plan: Metadata, data?: api.LoadedPlan) => {
    api.savePlan(plan);
    setSaved(plan);
    if (data) setSnapshot({ plan, data, error: '' });
  }, []);

  const refresh = useCallback(async () => {
    if (!selected) return;
    const request = {};
    pending.current = request;
    setReading(selected);
    try {
      const data = await api.loadPlan(selected);
      if (pending.current !== request) return;
      setSnapshot({ plan: selected, data, error: '' });
      if (
        !demo &&
        fromLink &&
        savedLink.current !== selected &&
        data.state.status !== 'UNINITIALIZED'
      ) {
        savedLink.current = selected;
        selectPlan(selected, data);
      }
    } catch (error) {
      if (pending.current !== request) return;
      setSnapshot({
        plan: selected,
        data: null,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (pending.current === request) {
        pending.current = null;
        setReading(null);
      }
    }
  }, [demo, fromLink, selected, selectPlan]);

  useEffect(() => {
    if (!selected) return;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void refresh();
    });
    const timer = window.setInterval(() => {
      if (!pending.current) void refresh();
    }, 30_000);
    return () => {
      disposed = true;
      pending.current = null;
      window.clearInterval(timer);
    };
  }, [refresh, selected]);

  const value: CurrentPlan = {
    metadata: fromLink && !demo && !current?.data ? null : selected,
    data: current?.data ?? null,
    demo,
    loading: Boolean(selected && (!current || reading === selected)),
    canRefresh: Boolean(selected),
    error: (demo ? '' : fromLink?.error) || current?.error || '',
    refresh,
    selectPlan,
  };
  return <Outlet context={value} />;
}
