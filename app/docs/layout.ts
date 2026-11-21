import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChevronDown, CirclePlay, List, Moon, PanelLeft, Search, Sun, X, type LucideIcon } from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { overview, pages, searchIndex, sections, type Heading, type Page } from './catalog.ts';
import { escapeHtml, presentation, repoUrl, sourceUrl, type readArticle } from './content.ts';

const icon = (Icon: LucideIcon) => renderToStaticMarkup(createElement(Icon, { size: 16, 'aria-hidden': true }));
const arrow = icon(ArrowRight);
const chevron = icon(ChevronDown);
const introOutline: Heading[] = [
  { id: 'get-started', text: 'Get started', level: 'h2' },
  { id: 'plan-lifecycle', text: 'Plan lifecycle', level: 'h2' },
  { id: 'verify-the-release', text: 'Verify the release', level: 'h2' },
];

function renderNavigation(docsBase: string, page?: Page) {
  return `<nav class="docs-nav" aria-label="Documentation">
    ${sections.map((section) => `<div class="docs-nav__group">
      <h2>${section.title}</h2>
      <ul>
        ${section.title === overview.group ? `<li><a href="${docsBase}"${page ? '' : ' aria-current="page"'}>${overview.title}</a></li>` : ''}
        ${section.pages.map((item) => `<li><a href="${docsBase}${item.slug}/"${page?.slug === item.slug ? ' aria-current="page"' : ''}>${item.title}</a></li>`).join('')}
      </ul>
    </div>`).join('')}
  </nav>`;
}

function renderOutline(headings: Heading[]) {
  if (!headings.length) return { desktop: '', mobile: '' };

  const list = `<ul>${headings.map(({ id, text, level }) => `<li class="docs-outline__${level}"><a href="#${encodeURIComponent(id)}">${escapeHtml(text)}</a></li>`).join('')}</ul>`;
  return {
    desktop: `<nav class="docs-outline docs-outline--desktop" aria-label="On this page">
      <p>${icon(List)} On this page</p>${list}
    </nav>`,
    mobile: `<details class="docs-outline docs-outline--mobile">
      <summary>${icon(List)} On this page ${chevron}</summary>
      <nav aria-label="On this page">${list}</nav>
    </details>`,
  };
}

function renderOverview(base: string, docsBase: string) {
  return `<h2 id="get-started">Get started</h2>
    <div class="docs-start">
      <a class="docs-start__link" href="${docsBase}wallet-guide/">
        <span class="docs-start__icon">${icon(BookOpen)}</span>
        <span><strong>Wallet guide</strong><span>Set up your plan and use your wallet.</span></span>
        ${arrow}
      </a>
      <a class="docs-start__link" href="${base}wallet/demo">
        <span class="docs-start__icon">${icon(CirclePlay)}</span>
        <span><strong>Try the live demo</strong><span>Follow a real plan and its transactions.</span></span>
        ${arrow}
      </a>
    </div>
    <h2 id="plan-lifecycle">Plan lifecycle</h2>
    <ol>
      <li><strong>Use your wallet.</strong> Set your heirs, shares, and three trusted contacts. Each payment you send restarts the waiting time.</li>
      <li><strong>Open and review a claim.</strong> Anyone can open a claim after the waiting time. Two trusted contacts can open one sooner. During review, you can stop the claim.</li>
      <li><strong>Pay the heirs.</strong> Once review ends, anyone can submit the payout when the plan covers the fee and every heir’s minimum payment.</li>
    </ol>
    <p>Read the <a href="${docsBase}inheritance-wallet/">wallet architecture</a> and <a href="${docsBase}plan-format/">plan format</a> for the contract rules and on-chain state.</p>
    <h2 id="verify-the-release">Verify the release</h2>
    <ul>
      <li><a href="${docsBase}network-record/">On-chain record</a> for Mainnet and Chipnet transaction links.</li>
      <li><a href="${docsBase}app-and-assets/">App and assets</a> for token receipts, swaps, and phone signing.</li>
      <li><a href="${docsBase}judge-guide/">Guide for judges</a> for the demo and <a href="${docsBase}${presentation}">BCH BLAZE presentation (PDF)</a>.</li>
    </ul>`;
}

function renderPagination(page: Page, docsBase: string) {
  const index = pages.indexOf(page);
  const previous = pages[index - 1];
  const next = pages[index + 1];

  return `<nav class="docs-pagination" aria-label="Article navigation">
    <a rel="prev" href="${previous ? `${docsBase}${previous.slug}/` : docsBase}">
      ${icon(ArrowLeft)}<span><small>Previous</small>${previous?.title ?? overview.title}</span>
    </a>
    ${next ? `<a rel="next" href="${docsBase}${next.slug}/"><span><small>Next</small>${next.title}</span>${arrow}</a>` : ''}
  </nav>`;
}

function renderHeader(base: string, docsBase: string) {
  return `<header class="docs-header">
    <div class="docs-header__inner">
      <a class="docs-brand" href="${docsBase}" aria-label="Pusaka docs home">
        <span class="docs-brand__mark" aria-hidden="true"></span>Pusaka <span class="docs-brand__label">Docs</span>
      </a>
      <button class="docs-search-button" type="button" aria-label="Search docs" aria-haspopup="dialog" aria-controls="docs-search" hidden>
        ${icon(Search)} <span>Search docs</span> <kbd aria-hidden="true">Ctrl K</kbd>
      </button>
      <div class="docs-header__links">
        <a class="docs-github" href="${repoUrl}">GitHub</a>
        <button id="docs-theme" class="docs-icon-button" type="button" aria-label="Dark theme" hidden>
          <span class="docs-theme__dark">${icon(Moon)}</span><span class="docs-theme__light">${icon(Sun)}</span>
        </button>
        <a class="docs-open-app" href="${base}">Open app ${icon(ArrowUpRight)}</a>
      </div>
    </div>
  </header>`;
}

function renderSearch(docsBase: string) {
  return `<dialog id="docs-search" class="docs-search" aria-label="Search documentation" data-index="${docsBase}${searchIndex}">
    <div class="docs-search__panel">
      <div class="docs-search__input">
        ${icon(Search)}
        <input type="search" aria-label="Search documentation" placeholder="Search documentation" autocomplete="off" autofocus />
        <button type="button" class="docs-icon-button" aria-label="Close search">${icon(X)}</button>
      </div>
      <p class="docs-search__status" role="status"></p>
      <ul class="docs-search__results" aria-label="Search results"></ul>
    </div>
  </dialog>`;
}

export function renderPage(template: string, base: string, sourceRef: string, page?: Page, article?: ReturnType<typeof readArticle>) {
  const docsBase = `${base}docs/`;
  const nav = renderNavigation(docsBase, page);
  const outline = renderOutline(article?.headings ?? introOutline);
  const summary = escapeHtml(page?.summary ?? overview.summary);

  return template
    .replace('<title>Pusaka docs</title>', `<title>${page ? `${escapeHtml(page.title)} · Pusaka docs` : 'Pusaka docs'}</title>`)
    .replace('<!--docs-page-->', () => `<a class="docs-skip" href="#docs-main">Skip to content</a>
      ${renderHeader(base, docsBase)}
      <div class="docs-layout">
        <aside class="docs-sidebar">${nav}</aside>
        <details class="docs-menu">
          <summary>${icon(PanelLeft)} <span>Browse docs</span><span class="docs-menu__current">${page?.title ?? overview.title}</span> ${chevron}</summary>
          ${nav}
        </details>
        <main id="docs-main" class="docs-reading" tabindex="-1">
          ${outline.desktop}
          <article class="docs-document">
            <header class="docs-document__header">
              ${page ? `<p class="docs-document__group">${page.group}</p>` : ''}
              ${article?.title ?? '<h1>Pusaka docs</h1>'}
              <p class="docs-document__summary">${summary}</p>
            </header>
            ${outline.mobile}
            <div class="docs-prose">${article?.body ?? renderOverview(base, docsBase)}</div>
            ${page ? `<footer class="docs-document__footer">
              <a class="docs-source" href="${sourceUrl(page.source, sourceRef)}">View source on GitHub ${icon(ArrowUpRight)}</a>
              ${renderPagination(page, docsBase)}
            </footer>` : ''}
          </article>
        </main>
      </div>
      ${renderSearch(docsBase)}`);
}
