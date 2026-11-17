// The hero's scene: a still of the paddy first, then the live 3D scene laid exactly over it.
import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import { useMedia } from '../../components/useMedia';
import { FRAMES, WIDE_QUERY } from './sawahFrame';

export function FlowerStage() {
  const desktop = useMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
  const wide = useMedia(WIDE_QUERY);
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches));
  const [requested, setRequested] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [state, setState] = useState<'still' | 'loading' | 'ready' | 'failed'>('still');
  const container = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const enhance = nearby && (requested || (desktop && !reducedMotion && !saveData));
  const frame = wide ? 'wide' : 'tall';

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const theme = document.documentElement.dataset.theme;
      setDark(theme === 'dark' || (!theme && scheme.matches));
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    scheme.addEventListener('change', sync);
    return () => { observer.disconnect(); scheme.removeEventListener('change', sync); };
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node || !enhance) { setState('still'); return; }
    let live = true;
    let failed = false;
    let cleanup: (() => void) | undefined;
    setState('loading');
    import('./flowerScene').then(({ mountFlowerScene }) => {
      if (!live) return;
      const scene = mountFlowerScene(node, reducedMotion, () => {
        failed = true;
        cleanup?.();
        if (live) setState('failed');
      });
      cleanup = scene.dispose;
      return scene.ready.then(() => { if (live && !failed) setState('ready'); });
    }).catch(() => {
      cleanup?.();
      if (live) setState('failed');
    });
    return () => { live = false; cleanup?.(); };
  }, [enhance, reducedMotion]);

  return (
    <div className="flower-stage" ref={container} data-scene={state} data-frame={frame}>
      <picture className="flower-stage__poster">
        <img src={`/hero/pusaka-sawah-v3-${frame}${dark ? '-dark' : ''}.webp`} width={FRAMES[frame].width} height={FRAMES[frame].height} fetchPriority="high" alt="A four-petalled blue water lily with a glowing golden seed rises on a green stem from a flooded rice terrace. Coconut palms, a timber house and twin volcanoes sit beneath a quiet sky." />
      </picture>
      <div className="flower-stage__canvas" ref={host} />
      {(!desktop || reducedMotion || saveData) && state !== 'ready' && state !== 'failed' && (
        <button className="flower-stage__toggle" type="button" onClick={() => setRequested(true)} disabled={state === 'loading'}>
          <Box size={15} aria-hidden />{state === 'loading' ? 'Loading 3D…' : 'View in 3D'}
        </button>
      )}
      <span className="sr-only" role="status">{state === 'failed' ? 'The 3D view is unavailable. The still preview is shown.' : ''}</span>
    </div>
  );
}
