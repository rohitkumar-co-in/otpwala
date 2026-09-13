import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

// Admin client with service_role key — bypasses RLS
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
