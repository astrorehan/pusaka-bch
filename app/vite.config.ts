import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The published site holds two builds of the same app: mainnet at PAGES_BASE and the Chipnet (test network)
// app at PAGES_BASE + 'chipnet/'. `npm run build:pages` builds both into dist-pages.
const PAGES_BASE = '/pusaka-bch/'
const CHIPNET_BASE = `${PAGES_BASE}chipnet/`

// The app's routes. GitHub Pages serves `wallet/demo.html` for `/wallet/demo`, so a copy of the page at each
// route answers a direct visit with 200 instead of the 404 fallback.
const ROUTES = [
  'wallet', 'wallet/plan', 'wallet/activity', 'wallet/demo', 'wallet/swap', 'wallet/edit', 'wallet/new',
  'v2/plan', 'new', 'legacy/new', 'plan', 'try', 'how-it-works',
]

// GitHub Pages serves static HTML. Put the policy in the page so deep links get the same protection.
function productionHtml(pages: boolean, routes = pages): Plugin {
  return {
    name: 'pusaka-production-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) =>
          `'sha256-${createHash('sha256').update(code.replace(/\r\n?/g, '\n')).digest('base64')}'`,
        )
        const policy = [
          "default-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          // Libauth compiles WebAssembly. The theme initializer is the only inline script.
          ["script-src 'self' 'wasm-unsafe-eval'", ...hashes].join(' '),
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          "img-src 'self' data: blob:",
          // CoinGecko, the Electrum servers (mainnet with its fallbacks, then Chipnet), and the default WizardConnect relays.
          "connect-src 'self' https://api.coingecko.com wss://bch.imaginary.cash:50004 wss://bch.loping.net:50004 wss://fulcrum.criptolayer.net:50004 wss://bch.soul-dev.com:50004 wss://chipnet.bch.ninja:50004 wss://relay.riften.net wss://relay.cauldron.quest",
        ].join('; ')
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }]
      },
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html']
        if (pages && index?.type === 'asset') {
          this.emitFile({ type: 'asset', fileName: '404.html', source: index.source })
        }
        if (routes && index?.type === 'asset') {
          for (const route of ROUTES) this.emitFile({ type: 'asset', fileName: `${route}.html`, source: index.source })
        }
      },
    },
  }
}

/** Fill in where the Chipnet app lives, before the policy above hashes the inline scripts. */
function chipnetPath(chipnet: string): Plugin {
  return {
    name: 'pusaka-chipnet-path',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%PUSAKA_CHIPNET_BASE%', chipnet) },
  }
}

const network = (name: 'mainnet' | 'chipnet', otherApp = '') => ({
  'import.meta.env.VITE_NETWORK': JSON.stringify(name),
  'import.meta.env.VITE_MOCK': JSON.stringify('0'),
  // Where plan links for the other network open; '' when this build has no partner.
  'import.meta.env.VITE_OTHER_APP': JSON.stringify(otherApp),
})

// Keep the mainnet wallet preview outside dist: a normal build empties that directory.
export default defineConfig(({ mode }) => {
  const pages = mode === 'pages' || mode === 'pages-chipnet'
  return {
    plugins: [react(), chipnetPath(pages ? CHIPNET_BASE : ''), productionHtml(mode === 'pages', pages)],
    resolve: { dedupe: ['react', 'react-dom', '@solidcash/solidcash', '@solidcash/utils', '@bitauth/libauth', '@cashlab/common', '@cashlab/cauldron'] },
    ...(mode === 'pages' ? {
      base: PAGES_BASE,
      define: network('mainnet', CHIPNET_BASE),
      build: { outDir: 'dist-pages' },
    } : {}),
    // Built after `pages`, into its chipnet/ folder (a `pages` build empties dist-pages).
    ...(mode === 'pages-chipnet' ? {
      base: CHIPNET_BASE,
      define: network('chipnet', PAGES_BASE),
      build: { outDir: 'dist-pages/chipnet' },
    } : {}),
    ...(mode === 'mainnet' ? {
      define: network('mainnet'),
      build: { outDir: 'dist-mainnet' },
      preview: { host: 'localhost', port: 4180, strictPort: true },
    } : {}),
  }
})
