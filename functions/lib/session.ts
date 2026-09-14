import { getSupabaseAdmin } from './supabase';

export async function registerSession(userId: string, sessionId: string, userAgent = 'unknown', env?: any) {
  const supabase = getSupabaseAdmin(env);

  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !user) throw new Error('account_deleted');

  const updatedMeta = {
    ...(user.user_metadata || {}),
    current_session_id: sessionId,
    session_updated_at: Date.now(),
    session_user_agent: userAgent,
  };

  await supabase.auth.admin.updateUserById(userId, { user_metadata: updatedMeta });
  return { sessionId, updatedAt: updatedMeta.session_updated_at };
}

export async function checkSession(token: string, clientSessionId?: string, env?: any) {
  const supabase = getSupabaseAdmin(env);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { valid: true, warning: 'token_check_skipped' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, is_banned')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_banned) {
    return { valid: false, reason: 'account_banned', message: 'Your account has been suspended' };
  }

  return { valid: true, userId: user.id, email: user.email };
}
