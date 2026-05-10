import { createClient } from '@supabase/supabase-js';

/**
 * Robust environment variable retriever that handles:
 * 1. Vite's import.meta.env (standard for Vercel/Vite builds)
 * 2. window.process.env (standard for AI Studio / standard browser polyfills)
 * 3. process.env (Node environments)
 */
export const getEnv = (key: string): string => {
  // Priority 1: Vite-style (best for Vercel production)
  const viteKey = `VITE_${key}`;
  const viteVal = (import.meta as any).env?.[viteKey] || (import.meta as any).env?.[key];
  if (viteVal) return viteVal.trim();

  // Priority 2: Browser process polyfill
  const browserVal = (window as any).process?.env?.[key] || (window as any).process?.env?.[viteKey];
  if (browserVal) return browserVal.trim();

  // Priority 3: Node-style process
  try {
    const nodeVal = process.env[key] || process.env[viteKey];
    if (nodeVal) return nodeVal.trim();
  } catch {}

  return '';
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');
const hasValidSupabaseConfig =
  !!supabaseUrl && supabaseUrl.includes('supabase.co') && !!supabaseAnonKey && supabaseAnonKey.length > 20;
const missingConfigError = 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.';

export const supabase = hasValidSupabaseConfig
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({} as ReturnType<typeof createClient>, {
      get() {
        throw new Error(missingConfigError);
      }
    });

export const isSupabaseConfigured = () =>
  hasValidSupabaseConfig;
