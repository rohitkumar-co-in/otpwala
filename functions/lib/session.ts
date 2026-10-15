import { getSupabaseAdmin } from './supabase';
import { isSessionCurrent, isValidSessionId } from './session-policy';

export async function registerSession(userId: string, sessionId: string, userAgent = 'unknown', env?: any) {
  if (!isValidSessionId(sessionId)) throw new Error('invalid_session_id');
  const supabase = getSupabaseAdmin(env);

  const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId);
  if (userErr || !user) throw new Error('account_deleted');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('is_banned').eq('id',userId).maybeSingle();
  if (profileError || !profile) throw new Error('account_unavailable');
  if (profile.is_banned || ((user as any).banned_until && Date.parse((user as any).banned_until) > Date.now())) throw new Error('account_banned');

  const updatedMeta = {
    ...(user.user_metadata || {}),
    current_session_id: sessionId,
    session_updated_at: Date.now(),
    session_user_agent: userAgent,
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { user_metadata: updatedMeta });
  if (updateError) throw new Error('session_registration_failed');
  return { sessionId, updatedAt: updatedMeta.session_updated_at };
}

export async function checkSession(token: string, clientSessionId?: string, env?: any, allowSessionReplacement = false) {
  const supabase = getSupabaseAdmin(env);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    if (error?.code === 'user_banned') return { valid: false, reason: 'account_banned', message: 'Your account has been suspended' };
    return { valid: false, reason: 'account_deleted', message: 'Your session is no longer valid' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_banned')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) return {valid:false,reason:'account_unavailable',message:'Unable to verify account access. Please try again.'};

  if (profile.is_banned || ((user as any).banned_until && Date.parse((user as any).banned_until) > Date.now())) {
    return { valid: false, reason: 'account_banned', message: 'Your account has been suspended' };
  }

  if (!allowSessionReplacement && !isSessionCurrent(user.user_metadata?.current_session_id, clientSessionId)) {
    return { valid: false, reason: 'concurrent_session', message: 'This device was signed out because a newer login became active.' };
  }

  return { valid: true, userId: user.id, email: user.email };
}
