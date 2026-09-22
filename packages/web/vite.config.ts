import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist/client',
    // The server embeds and routes index.js/index.css by name (src/server/index.ts),
    // so the client must stay a single unhashed bundle — code splitting would emit
    // chunks the server never serves. Vendor deps put that bundle over the 500 kB
    // default, which is expected here rather than a regression to chase.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
})
