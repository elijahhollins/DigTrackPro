import { createClient } from '@supabase/supabase-js';

const safeGetEnv = (key: string): string => {
  try {
    // @ts-ignore
    const winEnv = window.process?.env?.[key];
    if (winEnv) return winEnv;

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

// Strict validation
const isConfigured = 
  supabaseUrl.length > 5 && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 5;

// Diagnostics logging
if (!isConfigured) {
  console.error("Supabase Configuration Missing or Invalid!");
  console.info("URL Found:", supabaseUrl ? "Yes" : "No");
  console.info("Key Found:", supabaseAnonKey ? "Yes" : "No");
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export const getSupabaseConfig = () => ({
  isValid: isConfigured,
  url: supabaseUrl,
  anonKey: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 6)}...${supabaseAnonKey.substring(supabaseAnonKey.length - 4)}` : 'MISSING'
});