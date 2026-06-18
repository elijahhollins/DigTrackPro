import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Standalone build for the throwaway Scheduler preview (preview/index.html).
// Produces a single inlinable JS + CSS bundle so it can be flattened into one
// self-contained HTML file that opens from the local filesystem.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    'process.env.SUPABASE_URL': '""',
    'process.env.SUPABASE_ANON_KEY': '""',
  },
  build: {
    outDir: 'preview-dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, 'preview/index.html'),
      output: { inlineDynamicImports: true },
    },
  },
});
