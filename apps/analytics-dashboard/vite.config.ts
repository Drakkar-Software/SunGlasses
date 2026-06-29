import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],

  // DuckDB-WASM ships its own pre-bundled worker + wasm files;
  // exclude it from Vite's dep optimiser so ?url imports resolve correctly.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },

  server: {
    port: 5174,
    // No /api proxy — the dashboard is fully client-side
    headers: {
      // Not strictly required for the eh (non-threaded) bundle,
      // but harmless and may be needed if a future bundle uses threads.
      'Cross-Origin-Opener-Policy':   'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  build: {
    outDir:      'dist',
    emptyOutDir: true,
    target:      'es2022',
  },
});
