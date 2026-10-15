import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || 'https://kphenpvtivxtilcclpnk.supabase.co';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_bOyDl0ja3ZtK81KCZsLJAg_Zs4vOUsL';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
