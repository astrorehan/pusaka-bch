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

// Remove the loading screen as soon as the first route is ready.
function hideSplash() {
  requestAnimationFrame(() => {
    document.getElementById('splash')?.remove();
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
