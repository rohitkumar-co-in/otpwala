import { getSupabaseAdmin } from './supabase';
import { TigerSmsClient } from './tiger';
import { creditBalance } from './wallet';
import serviceIcons from '../data/tigerServiceIcons.json';
import countryFlags from '../data/countryFlags.json';

export async function getAdminDashboard(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const [
    { count: totalUsers },
    { count: totalOrders },
    revenueResult,
    todayOrdersResult,
    activeOrdersResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('*', { count: 'exact', head: true }),
    supabase.from('orders').select('sell_price_inr').in('status', ['completed', 'code_received']),
    supabase.from('orders').select('sell_price_inr')
      .gte('created_at', new Date().toISOString().split('T')[0])
      .in('status', ['completed', 'code_received']),
    supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
  ]);

  const totalRevenue = (revenueResult.data || []).reduce((sum: number, o: any) => sum + parseFloat(o.sell_price_inr || 0), 0);
  const revenueToday = (todayOrdersResult.data || []).reduce((sum: number, o: any) => sum + parseFloat(o.sell_price_inr || 0), 0);

  let tigerBalance = 0;
  try {
    const bal = await tiger.getBalance();
    tigerBalance = parseFloat(bal.balance) || 0;
  } catch {}

  return {
    totalUsers: totalUsers || 0,
    totalOrders: totalOrders || 0,
    totalRevenue,
    revenueToday,
    activeOrders: activeOrdersResult.count || 0,
    tigerBalance,
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
  return { users: data || [], total: count || 0 };
}

export async function creditUserBalance(userId: string, amount: number, note: string, env?: any) {
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

export async function getAdminOrders(limit = 20, offset = 0, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
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
  return data || [];
}

export async function approvePaymentRequest(id: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data: request, error: fetchErr } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !request) throw new Error('Payment request not found');
  if (request.status !== 'pending') throw new Error('Payment already processed');

  await creditBalance(request.user_id, parseFloat(request.amount), `Deposit approved (UTR: ${request.transaction_id || id})`, 'topup', env);

  await supabase
    .from('payment_requests')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', id);

  return { success: true };
}

export async function rejectPaymentRequest(id: string, reason = '', env?: any) {
  const supabase = getSupabaseAdmin(env);
  await supabase
    .from('payment_requests')
    .update({ status: 'rejected', admin_notes: reason, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { success: true };
}
