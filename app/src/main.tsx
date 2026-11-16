import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App, { router } from './App.tsx';
import { applyTheme, getTheme } from './lib/theme';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hand over from the splash (index.html) once the first page has painted. It lets a running bloom finish.
// Pages other than home load on first use, so wait until the router has the first page ready.
function hideSplash() {
  requestAnimationFrame(() => {
    const w = window as Window & { __pusakaSplash?: { hide(): void } };
    if (w.__pusakaSplash) w.__pusakaSplash.hide();
    else document.getElementById('splash')?.remove();
  });
}
if (router.state.initialized) hideSplash();
else {
  const stop = router.subscribe((state) => {
    if (!state.initialized) return;
    stop();
    hideSplash();
  });
}
