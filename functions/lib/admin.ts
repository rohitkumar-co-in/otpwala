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

export async function approvePaymentRequest(id: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data: request, error: fetchErr } = await supabase
    .from('payment_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !request) throw new Error('Payment request not found');
  const st = request.status;
  if (st === 'approved' || st === 'paid') {
    throw new Error('This payment request has already been approved and credited.');
  }

  const amount = parseFloat(request.amount ?? request.amount_inr ?? 0);
  const utr = request.transaction_id || request.gateway_payment_id || id;

  // Credit user wallet balance
  await creditBalance(request.user_id, amount, `Deposit approved (UTR: ${utr})`, 'topup', env);

  // Mark request as approved/paid in payment_requests
  let updateSuccess = false;

  const res1 = await supabase
    .from('payment_requests')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (!res1.error) {
    updateSuccess = true;
  } else {
    // Fallback to 'paid' if legacy status constraint is present
    const res2 = await supabase
      .from('payment_requests')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!res2.error) {
      updateSuccess = true;
    } else {
      // Try updating status alone
      const res3 = await supabase
        .from('payment_requests')
        .update({ status: 'approved' })
        .eq('id', id);

      if (!res3.error) {
        updateSuccess = true;
      } else {
        await supabase
          .from('payment_requests')
          .update({ status: 'paid' })
          .eq('id', id);
      }
    }
  }

  return { success: true };
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
