import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Keep the mainnet wallet preview outside dist: a normal build empties that directory.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
