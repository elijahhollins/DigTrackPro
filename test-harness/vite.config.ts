// Dev-only config for driving the FULL app with no backend: `lib/supabaseClient.ts`
// is aliased to an in-memory fake (test-harness/mockSupabase.ts), so every real
// service and component runs unchanged against seeded data.
//
//   npx vite --config test-harness/vite.config.ts
//   open http://localhost:5200/
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, '..'),
  plugins: [react()],
  worker: { format: 'iife' },
  resolve: {
    alias: [
      { find: /^.*lib\/supabaseClient\.ts$/, replacement: resolve(__dirname, 'mockSupabase.ts') },
    ],
  },
  define: {
    'process.env.SUPABASE_URL': '""',
    'process.env.SUPABASE_ANON_KEY': '""',
  },
  server: { port: 5200, strictPort: true },
});
