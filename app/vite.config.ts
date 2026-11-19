import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// GitHub Pages serves static HTML. Put the policy in the page so deep links get the same protection.
function productionHtml(pages: boolean): Plugin {
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
          // CoinGecko, the two Electrum servers, and the default WizardConnect relays.
          "connect-src 'self' https://api.coingecko.com wss://bch.imaginary.cash:50004 wss://chipnet.bch.ninja:50004 wss://relay.riften.net wss://relay.cauldron.quest",
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
      },
    },
  }
}

// Keep the mainnet wallet preview outside dist: a normal build empties that directory.
export default defineConfig(({ mode }) => ({
  plugins: [react(), productionHtml(mode === 'pages')],
  resolve: { dedupe: ['react', 'react-dom', '@solidcash/solidcash', '@solidcash/utils', '@bitauth/libauth', '@cashlab/common', '@cashlab/cauldron'] },
  ...(mode === 'pages' ? { base: '/pusaka-bch/', build: { outDir: 'dist-pages' } } : {}),
  ...(mode === 'mainnet' ? {
    define: {
      'import.meta.env.VITE_NETWORK': JSON.stringify('mainnet'),
      'import.meta.env.VITE_MOCK': JSON.stringify('0'),
    },
    build: { outDir: 'dist-mainnet' },
    preview: { host: 'localhost', port: 4180, strictPort: true },
  } : {}),
}))
