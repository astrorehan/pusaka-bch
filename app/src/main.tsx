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

// Remove the splash once the app has rendered.
const splash = document.getElementById('splash');
if (splash) {
  splash.classList.add('done');
  setTimeout(() => splash.remove(), 200);
}
