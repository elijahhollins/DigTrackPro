
import { createClient } from '@supabase/supabase-js';

// Use direct literals for build-time replacement
const supabaseUrl = process.env.SUPABASE_URL || "https://fusubnzndmngjfgatzrq.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1c3VibnpuZG1uZ2pmZ2F0enJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTQ5NzcsImV4cCI6MjA4MjkzMDk3N30.O5Vp5R_KxAUpi8esYjqCHrjmyG3PzkNj1gDxpaNuKtI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => 
  supabaseUrl && supabaseUrl.includes('supabase.co') && supabaseAnonKey && supabaseAnonKey.length > 20;