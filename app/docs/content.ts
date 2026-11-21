import { readFileSync, statSync } from 'node:fs';
import GithubSlugger from 'github-slugger';
import MarkdownIt, { type Token } from 'markdown-it';
import { pages, type Heading, type Page, type SearchEntry } from './catalog.ts';

export const repoUrl = 'https://github.com/astrorehan/pusaka-bch';
export const repoRoot = new URL('../../', import.meta.url);
export const presentation = 'Pusaka-BCH-BLAZE-2026.pdf';

type RenderContext = { page: Page; docsBase: string; sourceRef: string; headings: Heading[] };

const markdown = new MarkdownIt({ html: true, linkify: true });
export const escapeHtml = markdown.utils.escapeHtml;

// The Markdown contains line breaks inside tables. Escape all other embedded HTML.
const lineBreak = /^<br\s*\/?>$/i;
markdown.renderer.rules.html_inline = (tokens, index) => {
  const html = tokens[index].content;
  return lineBreak.test(html) ? '<br>' : escapeHtml(html);
};
markdown.renderer.rules.html_block = (tokens, index) => escapeHtml(tokens[index].content);
markdown.renderer.rules.table_open = () => '<div class="docs-table" tabindex="0" role="region" aria-label="Scrollable table"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';

export function sourceUrl(source: string, sourceRef: string, directory = false) {
  const ref = sourceRef.split('/').map(encodeURIComponent).join('/');
  return `${repoUrl}/${directory ? 'tree' : 'blob'}/${ref}/${source}`;
}

function resolveLink(href: string, { page, docsBase, sourceRef }: RenderContext) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) return href;

  const url = new URL(href, new URL(page.source, 'https://repo.invalid/'));
  const path = decodeURI(url.pathname.slice(1));
  const target = pages.find((entry) => entry.source === path);
  const suffix = `${url.search}${url.hash}`;
  // GitHub line ranges refer to the source file rather than the rendered article.
  if (target && !/^#L\d/.test(url.hash)) return `${docsBase}${target.slug}/${suffix}`;
  if (path === 'docs/' || path === 'docs/README.md') return `${docsBase}${suffix}`;
  if (path === `docs/${presentation}`) return `${docsBase}${presentation}${suffix}`;

  const directory = statSync(new URL(url.pathname.slice(1), repoRoot), { throwIfNoEntry: false })?.isDirectory();
  return `${sourceUrl(url.pathname.slice(1), sourceRef, directory)}${suffix}`;
}

function inlineText(token: Token) {
  return (token.children ?? []).map((child) => {
    return child.type === 'softbreak' || child.type === 'hardbreak' || lineBreak.test(child.content) ? ' ' : child.content;
  }).join('');
}

markdown.core.ruler.after('inline', 'docs-navigation', (state) => {
  const context = state.env.docs as RenderContext;
  const slugger = new GithubSlugger();

  state.tokens.forEach((token, index) => {
    if (token.type === 'heading_open') {
      const text = inlineText(state.tokens[index + 1]);
      const id = slugger.slug(text);
      token.attrSet('id', id);
      if (token.tag === 'h2' || token.tag === 'h3') context.headings.push({ id, text, level: token.tag });
    }
    for (const child of token.children ?? []) {
      const href = child.attrGet('href');
      if (typeof href === 'string' && child.type === 'link_open') child.attrSet('href', resolveLink(href, context));
    }
  });
});

function indexArticle(tokens: Token[], { page, docsBase, headings }: RenderContext): SearchEntry[] {
  const href = `${docsBase}${page.slug}/`;
  const entries = [{ href, title: page.title, parent: page.group, text: page.summary }];
  const outline = new Map(headings.map((heading) => [heading.id, heading]));
  let entry = entries[0];

  for (const token of tokens) {
    const heading = token.type === 'heading_open' && outline.get(String(token.attrGet('id')));
    if (heading) {
      entry = { href: `${href}#${encodeURIComponent(heading.id)}`, title: heading.text, parent: page.title, text: '' };
      entries.push(entry);
    } else if (token.type === 'inline' || token.type === 'fence' || token.type === 'code_block') {
      const text = token.type === 'inline' ? inlineText(token) : token.content;
      entry.text += ` ${text}`;
    }
  }

  return entries.map((result) => ({ ...result, text: result.text.replace(/\s+/g, ' ').trim() }));
}

export function readArticle(page: Page, docsBase: string, sourceRef: string) {
  const context: RenderContext = { page, docsBase, sourceRef, headings: [] };
  const env = { docs: context };
  const tokens = markdown.parse(readFileSync(new URL(page.source, repoRoot), 'utf8'), env);
  const titleLength = tokens[0]?.tag === 'h1' ? 3 : 0;
  const body = tokens.slice(titleLength);
  return {
    title: markdown.renderer.render(tokens.slice(0, titleLength), markdown.options, env) || `<h1>${escapeHtml(page.title)}</h1>`,
    body: markdown.renderer.render(body, markdown.options, env),
    headings: context.headings,
    entries: indexArticle(body, context),
  };
}
