// Throwaway dev config for driving PdfMarkupEditor without the Supabase backend
// (same pattern as vite.preview.config.ts). Run from the repo root:
//   npx vite --config verify-harness/vite.config.ts
// then open http://localhost:5199/verify-harness/index.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '..'),
  plugins: [react()],
  worker: { format: 'iife' },
  resolve: {
    alias: [
      { find: /^.*services\/apiService\.ts$/, replacement: resolve(__dirname, 'mockApiService.ts') },
    ],
  },
  define: {
    'process.env.SUPABASE_URL': '""',
    'process.env.SUPABASE_ANON_KEY': '""',
  },
  server: { port: 5199, strictPort: true },
});
