import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './config';
import { isSessionCurrent } from './session-policy';

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

export async function authenticateUser(
  request: Request,
  env?: any,
  options?: { allowSessionReplacement?: boolean }
): Promise<{ userId: string; email: string; role: string; aal: string; hasVerifiedMfa: boolean } | null> {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const supabase = getSupabaseAdmin(env);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    if (!options?.allowSessionReplacement) {
      const suppliedSessionId = request.headers.get('x-session-id') || '';
      if (!isSessionCurrent(user.user_metadata?.current_session_id, suppliedSessionId)) return null;
    }

    let { data: profile } = await supabase
      .from('profiles')
      .select('id, email, role, is_banned')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      const email = user.email || '';
      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'User';

      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email,
          full_name: fullName,
          role: 'user',
          wallet_balance: 0,
          is_banned: false,
        })
        .select('id, email, role, is_banned')
        .maybeSingle();

      profile = newProfile;
    }

    if (profile?.is_banned) return null;

    let aal = 'aal1';
    try {
      const payloadPart = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(payloadPart));
      aal = payload?.aal || 'aal1';
    } catch {}
    const hasVerifiedMfa = Array.isArray((user as any).factors)
      && (user as any).factors.some((factor: any) => factor?.status === 'verified');

    return {
      userId: user.id,
      email: user.email || '',
      role: profile?.role || 'user',
      aal,
      hasVerifiedMfa,
    };
  } catch {
    return null;
  }
}
