import './theme';
import { enableSearch } from './search';

enableSearch();

const header = document.querySelector<HTMLElement>('.docs-header');
const outline = document.querySelectorAll<HTMLAnchorElement>('.docs-outline a[href^="#"]');
const headings = document.querySelectorAll<HTMLElement>('.docs-prose :is(h2, h3)[id]');
const mobileOutline = document.querySelector<HTMLDetailsElement>('.docs-outline--mobile');

if (headings.length && outline.length) {
  let scheduled = false;
  const updateOutline = () => {
    scheduled = false;
    const offset = (header?.offsetHeight ?? 0) + 48;
    let active = headings[0];
    for (const heading of Array.from(headings)) {
      if (heading.getBoundingClientRect().top > offset) break;
      active = heading;
    }
    if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
      active = headings[headings.length - 1];
    }
    const hash = `#${encodeURIComponent(active.id)}`;
    outline.forEach((link) => {
      if (link.hash === hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(updateOutline);
  };

  mobileOutline?.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) mobileOutline.open = false;
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('hashchange', schedule);
  void document.fonts.ready.then(schedule);
  schedule();
}
