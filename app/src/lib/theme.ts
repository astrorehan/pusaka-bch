// Theme follows the system; the toggle overrides it and is remembered per browser.
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'pusaka-theme';

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme) {
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch { /* storage blocked: theme still applies for this visit */ }
}

export function isDark(t: Theme): boolean {
  return t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
