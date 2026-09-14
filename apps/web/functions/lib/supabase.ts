import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config';

let cachedClient: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getSupabaseAdmin(env?: any): SupabaseClient {
  const conf = getConfig(env);
  if (cachedClient && lastUrl === conf.SUPABASE_URL && lastKey === conf.SUPABASE_SERVICE_ROLE_KEY) {
    return cachedClient;
  }

  cachedClient = createClient(conf.SUPABASE_URL, conf.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  lastUrl = conf.SUPABASE_URL;
  lastKey = conf.SUPABASE_SERVICE_ROLE_KEY;

  return cachedClient;
}

export async function authenticateUser(request: Request, env?: any): Promise<{ userId: string; email: string; role: string } | null> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const supabase = getSupabaseAdmin(env);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role, is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.is_banned) return null;

    return {
      userId: user.id,
      email: user.email || '',
      role: profile?.role || 'user',
    };
  } catch {
    return null;
  }
}
