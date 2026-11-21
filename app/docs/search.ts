import type { SearchEntry } from './catalog.ts';

function matches(entries: SearchEntry[], query: string) {
  const phrase = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!phrase) return entries.filter((entry) => !entry.href.includes('#')).slice(0, 6);

  const words = phrase.split(' ');
  return entries.flatMap((entry) => {
    const title = entry.title.toLowerCase();
    const parent = entry.parent.toLowerCase();
    const text = entry.text.toLowerCase();
    const searchable = `${title} ${parent} ${text}`;
    if (!words.every((word) => searchable.includes(word))) return [];

    const titleMatches = words.filter((word) => title.includes(word)).length;
    const score = (title === phrase ? 32 : 0) + (title.includes(phrase) ? 16 : 0)
      + (text.includes(phrase) ? 2 : 0) + 4 * titleMatches + (entry.href.includes('#') ? 0 : 1);
    return [{ entry, score }];
  }).sort((a, b) => b.score - a.score).slice(0, 8).map(({ entry }) => entry);
}

function excerpt(text: string, query: string) {
  const normalized = text.toLowerCase();
  const word = query.trim().toLowerCase().split(/\s+/).find((word) => normalized.includes(word));
  const start = word ? Math.max(0, normalized.indexOf(word) - 38) : 0;
  const end = Math.min(text.length, start + 132);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function resultItem(entry: SearchEntry, query: string) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  const parent = document.createElement('span');
  const title = document.createElement('strong');
  const snippet = document.createElement('span');
  link.href = entry.href;
  parent.className = 'docs-search__parent';
  parent.textContent = entry.parent;
  title.textContent = entry.title;
  snippet.className = 'docs-search__excerpt';
  snippet.textContent = excerpt(entry.text, query);
  link.append(parent, title, snippet);
  item.append(link);
  return item;
}

export function enableSearch() {
  const dialog = document.querySelector<HTMLDialogElement>('#docs-search');
  const trigger = document.querySelector<HTMLButtonElement>('.docs-search-button');
  const input = dialog?.querySelector<HTMLInputElement>('input');
  const close = dialog?.querySelector<HTMLButtonElement>('button');
  const results = dialog?.querySelector<HTMLUListElement>('.docs-search__results');
  const status = dialog?.querySelector<HTMLParagraphElement>('.docs-search__status');
  const indexUrl = dialog?.dataset.index;
  if (!dialog || !trigger || !input || !close || !results || !status || !indexUrl || !dialog.showModal) return;

  let entries: SearchEntry[] | undefined;
  let request: Promise<SearchEntry[]> | undefined;

  const render = () => {
    if (!entries) return;
    const query = input.value;
    const found = matches(entries, query);
    status.textContent = query.trim() ? `${found.length} ${found.length === 1 ? 'result' : 'results'}` : 'Browse pages';
    results.replaceChildren(...found.map((entry) => resultItem(entry, query)));
  };

  const open = async () => {
    if (dialog.open) return;
    dialog.showModal();
    input.select();
    if (!entries) status.textContent = 'Loading search…';

    try {
      request ??= fetch(indexUrl).then(async (response) => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json() as Promise<SearchEntry[]>;
      });
      entries = await request;
      render();
    } catch {
      request = undefined;
      status.textContent = 'Search could not load. Close and reopen search to try again.';
    }
  };

  trigger.addEventListener('click', () => { void open(); });
  close.addEventListener('click', () => dialog.close());
  input.addEventListener('input', render);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || (event.target instanceof Element && event.target.closest('.docs-search__results a'))) {
      dialog.close();
    }
  });
  dialog.addEventListener('keydown', (event) => {
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = Array.from(results.querySelectorAll('a'));
    if (!links.length) return;
    if (event.key === 'Enter') {
      if (event.target === input) {
        event.preventDefault();
        links[0].click();
      }
      return;
    }

    const current = links.findIndex((link) => link === document.activeElement);
    const next = event.key === 'ArrowDown' ? links[Math.min(current + 1, links.length - 1)] : links[current - 1] ?? input;
    event.preventDefault();
    next.focus();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      void open();
    }
  });

  const shortcut = trigger.querySelector('kbd');
  if (shortcut && /Mac|iOS|iPad|iPhone/.test(navigator.platform)) shortcut.textContent = '⌘ K';
  trigger.hidden = false;
}
