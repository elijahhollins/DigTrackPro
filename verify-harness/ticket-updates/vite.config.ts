// Throwaway dev config for driving the ticket action menu / update modal /
// update log without the Supabase backend. Run from the repo root:
//   npx vite --config verify-harness/ticket-updates/vite.config.ts
// then open http://localhost:5198/verify-harness/ticket-updates/index.html
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '../..'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^.*services\/apiService\.ts$/, replacement: resolve(__dirname, 'mockApiService.ts') },
    ],
  },
  server: { port: 5198, strictPort: true },
});
