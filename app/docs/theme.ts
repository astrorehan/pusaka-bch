import { applyTheme, getTheme, isDark } from '../src/lib/theme';

const button = document.querySelector<HTMLButtonElement>('#docs-theme');
if (button) {
  let theme = getTheme();
  const update = () => {
    const next = isDark(theme) ? 'light' : 'dark';
    const label = next === 'light' ? 'Light theme' : 'Dark theme';
    button.dataset.nextTheme = next;
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  button.addEventListener('click', () => {
    theme = isDark(theme) ? 'light' : 'dark';
    applyTheme(theme);
    update();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', update);
  update();
  button.hidden = false;
}
