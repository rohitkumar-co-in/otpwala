import { getSupabaseAdmin } from './supabase';
import { TigerSmsClient } from './tiger';
import { creditBalance } from './wallet';
import serviceIcons from '../data/tigerServiceIcons.json';
import countryFlags from '../data/countryFlags.json';

export async function logAdminAction(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
  ipAddress: string | null = null,
  env?: any,
) {
  const supabase = getSupabaseAdmin(env);
  const { error } = await supabase.from('admin_audit_logs').insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
    ip_address: ipAddress,
  });
  if (error) throw new Error(`Audit log failed: ${error.message}`);
}

export async function getAdminDashboard(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);
  const { data: metrics, error: metricsError } = await supabase.rpc('admin_dashboard_metrics');
  if (metricsError) throw metricsError;

  let tigerBalance = 0;
  let providerAvailable = true;
  let providerError: string | null = null;
  try {
    const bal = await tiger.getBalance();
    tigerBalance = parseFloat(bal.balance) || 0;
  } catch (error: any) {
    providerAvailable = false;
    providerError = String(error?.message || 'Tiger SMS is unavailable').slice(0, 200);
  }

  const now = new Date().toISOString();
  const [failedRefunds, stuckOrders, latestRefund] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('refund_status', 'failed'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'waiting').lte('expires_at', now),
    supabase.from('wallet_transactions').select('created_at').eq('type', 'refund').eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    ...(metrics || {}),
    tigerBalance,
    providerAvailable,
    providerError,
    failedRefunds: failedRefunds.count || 0,
    stuckOrders: stuckOrders.count || 0,
    lastRefundAt: latestRefund.data?.created_at || null,
  };
}

export async function getAdminUsers(limit = 20, offset = 0, search = '', env?: any) {
  const supabase = getSupabaseAdmin(env);
  let query = supabase.from('profiles').select('*', { count: 'exact' });

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const authMap: Record<string, { name?: string | null; avatar_url?: string | null; last_sign_in_at?: string | null; created_at?: string | null }> = {};
  try {
    const { data: authData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authData?.users) {
      authData.users.forEach((au) => {
        authMap[au.id] = {
          name: au.user_metadata?.full_name || au.user_metadata?.name || null,
          avatar_url: au.user_metadata?.avatar_url || au.user_metadata?.picture || null,
          last_sign_in_at: au.last_sign_in_at || null,
          created_at: au.created_at || null,
        };
      });
    }
  } catch (authErr) {}

  let zeroMarkupSet = new Set<string>();
  try {
    const { getZeroMarkupUsers } = await import('./pricing');
    const ids = await getZeroMarkupUsers(env);
    zeroMarkupSet = new Set(ids);
  } catch {}

  const enrichedUsers = (data || []).map((u: any) => {
    const authInfo = authMap[u.id] || {};
    const resolvedName = (u.full_name && u.full_name.trim()) || authInfo.name || null;
    const lastLogin = authInfo.last_sign_in_at || null;
    const registeredAt = u.created_at || authInfo.created_at || new Date().toISOString();
    
    return {
      ...u,
      wallet_balance: parseFloat(u.wallet_balance ?? u.balance ?? 0) || 0,
      full_name: resolvedName,
      name: resolvedName,
      avatar_url: authInfo.avatar_url || null,
      last_sign_in_at: lastLogin,
      created_at: registeredAt,
      has_zero_markup: zeroMarkupSet.has(u.id),
    };
  });

  return { users: enrichedUsers, total: count || 0 };
}

export async function creditUserBalance(userId: string, amount: number, note: string, env?: any) {
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
    throw new Error('Admin credit must be between ₹1 and ₹10,00,000.');
  }
  if (!note || note.trim().length < 5) throw new Error('A reason of at least 5 characters is required.');
  return creditBalance(userId, amount, note || 'Admin Balance Adjustment', 'admin_credit', env);
}

export async function banUser(userId: string, banned: boolean, reason?: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: banned, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
  return { success: true };
}

export async function getAdminOrders(limit = 20, offset = 0, status = 'all', env?: any) {
  const supabase = getSupabaseAdmin(env);
  let query = supabase
    .from('orders')
    .select('*, profiles(email)', { count: 'exact' });
  if (status === 'failed_refund') query = query.eq('refund_status', 'failed');
  else if (status === 'stuck') query = query.eq('status', 'waiting').lte('expires_at', new Date().toISOString());
  else if (status && status !== 'all') query = query.eq('status', status);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { orders: data || [], total: count || 0 };
}

export async function getAdminPricing(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.from('pricing_rules').select('*').order('priority', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createPricingRule(rule: any, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.from('pricing_rules').insert(rule).select().single();
  if (error) throw error;
  return data;
}

export async function deletePricingRule(id: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { error } = await supabase.from('pricing_rules').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

export async function getAdminSettings(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.from('settings').select('*');
  if (error) throw error;
  const map: Record<string, any> = {};
  (data || []).forEach((r: any) => {
    map[r.key] = r.value;
  });
  return map;
}

export async function saveAdminSettings(settings: Record<string, any>, env?: any) {
  const supabase = getSupabaseAdmin(env);
  for (const [key, value] of Object.entries(settings)) {
    await supabase.from('settings').upsert({
      key,
      value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      updated_at: new Date().toISOString(),
    });
  }
  return { success: true };
}

export async function getPaymentRequests(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase
    .from('payment_requests')
    .select('*, profiles:user_id(email, full_name)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((req: any) => {
    const s = String(req.status || '').toLowerCase().trim();
    const normalizedStatus =
      s === 'paid' || s === 'approved' || s === 'completed' || s === 'success'
        ? 'approved'
        : s === 'failed' || s === 'rejected' || s === 'cancelled'
        ? 'rejected'
        : 'pending';

    return {
      ...req,
      amount: parseFloat(req.amount ?? req.amount_inr ?? 0),
      amount_inr: parseFloat(req.amount_inr ?? req.amount ?? 0),
      transaction_id: req.transaction_id || req.gateway_payment_id || '',
      gateway_payment_id: req.gateway_payment_id || req.transaction_id || '',
      payment_method: req.payment_method || req.gateway || 'upi',
      gateway: req.gateway || req.payment_method || 'upi',
      status: normalizedStatus,
    };
  });
}

export async function approvePaymentRequest(id: string, actorId = 'system', env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.rpc('approve_payment_request_atomic', {
    p_request_id: id,
    p_admin_id: actorId,
  });
  if (error) {
    if (error.message?.includes('already_approved')) throw new Error('This payment request has already been approved and credited.');
    throw new Error(error.message || 'Payment approval failed');
  }
  return { success: true, transactionId: data?.[0]?.transaction_id, balanceAfter: data?.[0]?.balance_after };
}

export async function rejectPaymentRequest(id: string, reason = '', env?: any) {
  const supabase = getSupabaseAdmin(env);
  const updateRes = await supabase
    .from('payment_requests')
    .update({ status: 'rejected', admin_notes: reason, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updateRes.error) {
    await supabase
      .from('payment_requests')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  return { success: true };
}

export async function getAdminRecharges(limit = 20, offset = 0, search = '', env?: any) {
  const supabase = getSupabaseAdmin(env);
  
  let userIds: string[] = [];
  if (search.trim()) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', `%${search.trim()}%`)
      .limit(50);
    if (profiles && profiles.length > 0) {
      userIds = profiles.map((p: any) => p.id);
    } else {
      return { recharges: [], total: 0 };
    }
  }

  let query = supabase
    .from('wallet_transactions')
    .select('*, profiles(email, full_name)', { count: 'exact' })
    .in('type', ['topup', 'admin_credit']);

  if (userIds.length > 0) {
    query = query.in('user_id', userIds);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const recharges = (data || []).map((tx: any) => ({
    ...tx,
    email: tx.profiles?.email || 'Unknown',
    name: tx.profiles?.full_name || 'Unknown',
  }));

  return { recharges, total: count || 0 };
}
