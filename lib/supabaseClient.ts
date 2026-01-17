
import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string): string => {
  const val = (typeof process !== 'undefined' && process.env?.[key]) || 
              (window as any).process?.env?.[key] || 
              '';
  return val.trim();
};

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseAnonKey = getEnv('SUPABASE_ANON_KEY');

// Safe fallback to prevent createClient from throwing error on boot
const validUrl = supabaseUrl && supabaseUrl.startsWith('http') ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = supabaseAnonKey && supabaseAnonKey.length > 10 ? supabaseAnonKey : 'placeholder-key-missing';

export const supabase = createClient(validUrl, validKey);

export const isSupabaseConfigured = () => 
  validUrl.includes('supabase.co') && validKey !== 'placeholder-key-missing';
