// /plan#<data>: a plan from its link. /try: the judge path, a ready-made plan whose waiting time has passed.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { openInOtherApp } from '../../lib/networkName';
import { usePlan } from './usePlan';
import { PlanView } from './PlanView';
import { PlanMessage, PlanSkeleton } from './PlanMessage';
import './plan.css';
import './action.css';

export function PlanScreen({ demo = false }: { demo?: boolean }) {
  const { hash } = useLocation();
  const empty = !demo && hash.replace(/^#/, '') === '';

  useEffect(() => {
    document.title = demo ? 'Try Pusaka: send a plan to its heirs' : 'Inheritance plan · Pusaka';
    return () => { document.title = 'Pusaka'; };
  }, [demo]);

  if (empty) return <div className="pl-page"><PlanMessage kind="empty" /></div>;
  return <div className="pl-page"><Loaded key={hash} demo={demo} hash={hash} /></div>;
}

function Loaded({ demo, hash }: { demo: boolean; hash: string }) {
  const { load, reload, refresh } = usePlan(demo, hash);
  const slow = useDelay(300, load.kind === 'loading');
  const otherNetwork = load.kind === 'other-network' ? load.plan.network : null;
  // A link made on the other network opens in that network's app, which this site also hosts.
  useEffect(() => {
    if (otherNetwork && !demo) openInOtherApp(otherNetwork, `plan${hash}`);
  }, [otherNetwork, demo, hash]);

  switch (load.kind) {
    case 'loading':
      return slow ? <PlanSkeleton /> : null;
    case 'broken':
      return <PlanMessage key="broken" kind="broken" />;
    case 'missing':
      return <PlanMessage key="missing" kind="missing" />;
    case 'other-network':
      return <PlanMessage key="net" kind="other-network" planNetwork={load.plan.network} />;
    case 'error':
      return <PlanMessage key="err" kind={load.offline ? 'offline' : 'error'} onRetry={reload} />;
    case 'ready':
      return (
        <PlanView
          plan={load.plan}
          state={load.state}
          readAt={load.readAt}
          usd={load.usd}
          demo={demo}
          demoUsed={!!load.demoUsed}
          refresh={refresh}
        />
      );
  }
}

/** True once `active` has stayed true for `ms`: skeletons only for loads over 300 ms. */
function useDelay(ms: number, active: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) { setOn(false); return; }
    const id = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return on;
}
