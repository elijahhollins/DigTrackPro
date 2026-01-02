
import { createClient } from '@supabase/supabase-js';

/**
 * Safely get environment variable without crashing if 'process' is undefined.
 */
const safeGetEnv = (key: string): string => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env) {
      // @ts-ignore
      return process.env[key] || '';
    }
  } catch (e) {
    // Ignore error
  }
  return '';
};

/**
 * Extract Project ID and construct the correct Supabase API URL.
 * Handles both standard URLs and PostgreSQL connection strings.
 */
const getSupabaseUrl = (): string => {
  const envUrl = safeGetEnv('SUPABASE_URL');
  if (!envUrl) return '';

  const trimmed = envUrl.trim();
  
  // 1. If it's a postgres connection string
  if (trimmed.startsWith('postgresql://') || trimmed.includes('@db.')) {
    const projectRefMatch = trimmed.match(/db\.([^.]+)\.supabase\.co/);
    if (projectRefMatch && projectRefMatch[1]) {
      return `https://${projectRefMatch[1]}.supabase.co`;
    }
  }
  
  // 2. If it's just the project ref (e.g. "fusubnzndmngjfgatzrq")
  if (/^[a-z0-9]{20}$/.test(trimmed)) {
    return `https://${trimmed}.supabase.co`;
  }

  // 3. Ensure standard URLs have https
  if (trimmed.includes('supabase.co') && !trimmed.startsWith('http')) {
    return `https://${trimmed}`;
  }

  return trimmed;
};

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = safeGetEnv('SUPABASE_ANON_KEY').trim();

// A configuration is valid if it's a real URL and we have a non-placeholder key
const isConfigured = 
  supabaseUrl.length > 0 && 
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('placeholder') &&
  supabaseAnonKey.length > 0 &&
  supabaseAnonKey !== 'placeholder' &&
  supabaseAnonKey.length > 20;

if (!isConfigured) {
  console.warn(
    "DigTrack Pro: Configuration Incomplete.\n" +
    "Project URL: " + (supabaseUrl || "MISSING") + "\n" +
    "Anon Key: " + (supabaseAnonKey ? "PRESENT" : "MISSING")
  );
}

// Initialize with placeholders if necessary to prevent runtime 'undefined' crashes
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder'
);

export const checkSupabaseConfig = () => ({
  isValid: isConfigured,
  url: supabaseUrl,
  hasKey: supabaseAnonKey.length > 0
});
