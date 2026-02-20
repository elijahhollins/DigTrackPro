
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Fixed: Cast process to any to access cwd() method which is missing from some process type definitions
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Literal string replacement for process.env.API_KEY
      ...(env.VITE_API_KEY || env.API_KEY ? { 'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY) } : {}),
      'process.env.SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.SUPABASE_URL),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY),
    }
  };
});
