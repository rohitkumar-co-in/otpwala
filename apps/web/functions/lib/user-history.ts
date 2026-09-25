export type UserHistoryClearMode = 'all' | 'preserve_funding';

export interface UserHistoryClear {
  cleared_at: string;
  mode: UserHistoryClearMode;
  funding_since: string | null;
}

export async function getUserHistoryClear(supabase: any, userId: string): Promise<UserHistoryClear | null> {
  const [latestResult, fullClearResult] = await Promise.all([
    supabase
      .from('admin_user_history_clears')
      .select('cleared_at,mode')
      .eq('user_id', userId)
      .order('cleared_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('admin_user_history_clears')
      .select('cleared_at')
      .eq('user_id', userId)
      .eq('mode', 'all')
      .order('cleared_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // During a rolling deployment the migration may not be installed yet. In
  // that case leave existing histories visible rather than breaking the app.
  if (latestResult.error || fullClearResult.error) {
    console.warn('Could not load user history-clear marker:', latestResult.error?.message || fullClearResult.error?.message);
    return null;
  }
  if (!latestResult.data) return null;
  return { ...latestResult.data, funding_since: fullClearResult.data?.cleared_at || null };
}

export function applyOrderHistoryClear(query: any, clear: UserHistoryClear | null) {
  return clear ? query.gte('created_at', clear.cleared_at) : query;
}

export function applyWalletHistoryClear(query: any, clear: UserHistoryClear | null) {
  if (!clear) return query;
  if (clear.mode === 'all') {
    return query
      .gte('created_at', clear.cleared_at)
      .or('reference_type.is.null,reference_type.neq.admin_history_clear');
  }
  return clear.funding_since
    ? query.or(`created_at.gte.${clear.cleared_at},and(type.eq.topup,created_at.gte.${clear.funding_since})`)
    : query.or(`created_at.gte.${clear.cleared_at},type.eq.topup`);
}

export function applyPaymentHistoryClear(query: any, clear: UserHistoryClear | null) {
  if (!clear) return query;
  if (clear.mode === 'all') return query.gte('created_at', clear.cleared_at);
  return clear.funding_since ? query.gte('created_at', clear.funding_since) : query;
}
