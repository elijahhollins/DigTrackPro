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

const resolvedUrl = getEnv('SUPABASE_URL');
const resolvedAnonKey = getEnv('SUPABASE_ANON_KEY');

// Hardcoded fallbacks to the current production project. These exist so the app still boots when
// env vars are missing -- but during a disaster recovery, when you have restored into a NEW
// Supabase project, this fallback will silently point the app back at the dead project. Warn
// loudly so that is visible in the console during an incident. See docs/DISASTER_RECOVERY.md.
const FALLBACK_URL = "https://fusubnzndmngjfgatzrq.supabase.co";
const FALLBACK_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1c3VibnpuZG1uZ2pmZ2F0enJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTQ5NzcsImV4cCI6MjA4MjkzMDk3N30.O5Vp5R_KxAUpi8esYjqCHrjmyG3PzkNj1gDxpaNuKtI";

if (!resolvedUrl || !resolvedAnonKey) {
  console.warn(
    '[DigTrack Pro] Supabase env vars missing - falling back to the hardcoded production project ' +
    `(${FALLBACK_URL}). If you are recovering into a new project, set VITE_SUPABASE_URL and ` +
    'VITE_SUPABASE_ANON_KEY or the app will keep talking to the old one.'
  );
}

const supabaseUrl = resolvedUrl || FALLBACK_URL;
const supabaseAnonKey = resolvedAnonKey || FALLBACK_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => 
  supabaseUrl && supabaseUrl.includes('supabase.co') && supabaseAnonKey && supabaseAnonKey.length > 20;