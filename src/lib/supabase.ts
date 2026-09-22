import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://nhbeargdlzcaljndqpzp.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oYmVhcmdkbHpjYWxqbmRxcHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NDY2NzksImV4cCI6MjEwMzMyMjY3OX0.FpItIhVrwOGZmm2NG4m1_MYkn_Q6QQm-5jsi2HeN6KE';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseAnonKey.includes('your-anon-key')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
