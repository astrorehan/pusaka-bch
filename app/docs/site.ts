import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { overview, pages, searchIndex, type SearchEntry } from './catalog.ts';
import { presentation, readArticle, repoRoot } from './content.ts';
import { renderPage } from './layout.ts';

function buildSearchIndex(docsBase: string, entries: SearchEntry[]) {
  return JSON.stringify([
    { href: docsBase, title: 'Pusaka docs', parent: overview.group, text: overview.summary },
    ...entries,
  ]);
}

/** Serve the same standalone docs pages and search index in development and on Pages. */
export function docsSite(base: string, sourceRef: string): Plugin {
  const docsBase = `${base}docs/`;
  const templatePath = `${docsBase}index.html`;
  const templateUrl = new URL('./index.html', import.meta.url);
  const pdfUrl = new URL(`docs/${presentation}`, repoRoot);

  return {
    name: 'pusaka-docs',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
        const { pathname } = new URL(req.url, 'http://localhost');
        if (!pathname.startsWith(docsBase) && pathname !== `${base}docs`) return next();
        const slug = pathname.slice(docsBase.length).replace(/(?:^|\/)index\.html$/, '').replace(/\/$/, '');

        try {
          if (slug === presentation) {
            res.setHeader('Content-Type', 'application/pdf');
            return res.end(readFileSync(pdfUrl));
          }
          if (slug === searchIndex) {
            const entries = pages.flatMap((page) => readArticle(page, docsBase, sourceRef).entries);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(buildSearchIndex(docsBase, entries));
          }
          const page = pages.find((entry) => entry.slug === slug);
          if (slug && !page) return next();
          const article = page && readArticle(page, docsBase, sourceRef);
          const template = readFileSync(templateUrl, 'utf8');
          const html = await server.transformIndexHtml(templatePath, renderPage(template, base, sourceRef, page, article), req.url);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(html);
        } catch (error) {
          return next(error);
        }
      });
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['docs/index.html'];
        if (index?.type !== 'asset') this.error('The docs HTML entry is missing.');
        const template = index.source.toString();
        const entries: SearchEntry[] = [];
        index.source = renderPage(template, base, sourceRef);
        for (const page of pages) {
          const article = readArticle(page, docsBase, sourceRef);
          entries.push(...article.entries);
          this.emitFile({ type: 'asset', fileName: `docs/${page.slug}/index.html`, source: renderPage(template, base, sourceRef, page, article) });
        }
        this.emitFile({ type: 'asset', fileName: `docs/${searchIndex}`, source: buildSearchIndex(docsBase, entries) });
        this.emitFile({ type: 'asset', fileName: `docs/${presentation}`, source: readFileSync(pdfUrl) });
      },
    },
  };
}
