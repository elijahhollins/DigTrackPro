import { createClient } from '@supabase/supabase-js';

const safeGetEnv = (key: string): string => {
  try {
    // Check window.process first as it's what we inject in index.html
    // @ts-ignore
    const winEnv = window.process?.env?.[key];
    if (winEnv) return winEnv;

    // Fallback to global process if available
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      return process.env[key] || '';
    }
  } catch (e) {}
  return '';
};

const supabaseUrl = safeGetEnv('SUPABASE_URL').trim();
const supabaseAnonKey = safeGetEnv('SUPABASE_ANON_KEY').trim();

// Loose validation: just check if they look like strings and contain project indicators
const isConfigured = 
  supabaseUrl.length > 5 && 
  supabaseUrl.includes('.supabase.co') &&
  supabaseAnonKey.length > 5;

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export const checkSupabaseConfig = () => ({
  isValid: isConfigured,
  url: supabaseUrl,
  hasKey: supabaseAnonKey.length > 0
});