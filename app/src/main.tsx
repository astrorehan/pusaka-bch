import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { applyTheme, getTheme } from './lib/theme';

applyTheme(getTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Hand over from the splash (index.html) once the first frame has painted. It lets a running bloom finish.
requestAnimationFrame(() => {
  const w = window as Window & { __pusakaSplash?: { hide(): void } };
  if (w.__pusakaSplash) w.__pusakaSplash.hide();
  else document.getElementById('splash')?.remove();
});
