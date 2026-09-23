import { getSupabaseAdmin } from './supabase';
import { TigerSmsClient } from './tiger';
import { creditBalance } from './wallet';
import serviceIcons from '../data/tigerServiceIcons.json';
import countryFlags from '../data/countryFlags.json';
import { assertValidAdminCredit, assertValidAdminFundingSource, resolveAdminCreditLedgerType, adminFundingLedgerTypes } from './policies';
import { processReferralDepositBonus } from './referrals';

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

export async function getAdminAuditLogs(limit = 50, offset = 0, action = '', env?: any) {
  const supabase = getSupabaseAdmin(env);
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const safeOffset = Math.max(offset, 0);
  let query = supabase
    .from('admin_audit_logs')
    .select('id,actor_id,action,target_type,target_id,metadata,ip_address,created_at,profiles:actor_id(email,full_name)', { count: 'exact' });
  if (action.trim()) query = query.ilike('action', `%${action.trim()}%`);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (error) throw error;
  return { logs: data || [], total: count || 0 };
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
  const [failedRefunds, stuckOrders, latestRefund, resolvedSupport, unresolvedSupport, recentAlerts, financialIntegrity] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('refund_status', 'failed'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'waiting').lte('expires_at', now),
    supabase.from('wallet_transactions').select('created_at').eq('type', 'refund').eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['resolved', 'closed']),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
    supabase.from('operational_alerts').select('alert_key,alert_type,channel,status,details,last_error,created_at,updated_at').order('created_at', { ascending: false }).limit(10),
    supabase.rpc('financial_integrity_report'),
  ]);

  return {
    ...(metrics || {}),
    tigerBalance,
    providerAvailable,
    providerError,
    failedRefunds: failedRefunds.count || 0,
    stuckOrders: stuckOrders.count || 0,
    lastRefundAt: latestRefund.data?.created_at || null,
    resolvedSupport: resolvedSupport.count || 0,
    unresolvedSupport: unresolvedSupport.count || 0,
    recentAlerts: recentAlerts.data || [],
    failedAlerts: (recentAlerts.data || []).filter((alert: any) => alert.status === 'failed').length,
    // A failed integrity RPC must never be presented as a successful check.
    financialIntegrity: financialIntegrity.error
      ? { totalIssues: null, error: 'Financial integrity check could not be completed.' }
      : (financialIntegrity.data || { totalIssues: null, error: 'Financial integrity check returned no result.' }),
  };
}

export async function getAdminUsers(limit = 20, offset = 0, search = '', env?: any, sort = 'recent', role = '') {
  const supabase = getSupabaseAdmin(env);
  let query = supabase.from('profiles').select('*', { count: 'exact' });

  if (search) {
    query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
  }
  if (['superadmin', 'admin', 'user'].includes(role)) query = query.eq('role', role);

  const { data, count, error } = await query.order('created_at', { ascending: false });

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

  const userIds = (data || []).map((u: any) => u.id).filter(Boolean);
  const orderTotals: Record<string, { spent: number; orders: number }> = {};
  const depositTotals: Record<string, number> = {};
  if (userIds.length) {
    const { data: orderRows } = await supabase.from('orders').select('user_id,price_inr,sell_price_inr,refund_status,status').in('user_id', userIds);
    for (const order of orderRows || []) {
      const refunded = ['refunded', 'refund_issued', 'cancelled'].includes(String(order.refund_status || '').toLowerCase()) || String(order.status || '').toLowerCase() === 'cancelled';
      if (refunded) continue;
      const amount = Number(order.sell_price_inr ?? order.price_inr ?? 0);
      if (!Number.isFinite(amount) || amount < 0) continue;
      const total = orderTotals[order.user_id] || { spent: 0, orders: 0 };
      total.spent += amount;
      total.orders += 1;
      orderTotals[order.user_id] = total;
    }
  }

  if (userIds.length) {
    const { data: depositRows } = await supabase.from('wallet_transactions').select('user_id,amount').in('user_id', userIds).eq('type', 'topup').eq('status', 'completed');
    for (const deposit of depositRows || []) {
      const amount = Number(deposit.amount || 0);
      if (Number.isFinite(amount) && amount > 0) depositTotals[deposit.user_id] = (depositTotals[deposit.user_id] || 0) + amount;
    }
  }

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
      // Derive reporting totals from orders so refunds/cancellations cannot inflate spend.
      total_spent: Number((orderTotals[u.id]?.spent ?? 0).toFixed(2)),
      total_orders: orderTotals[u.id]?.orders ?? 0,
      total_deposited: Number((depositTotals[u.id] ?? 0).toFixed(2)),
    };
  });

  const sortedUsers = [...enrichedUsers].sort((a: any, b: any) => {
    if (sort === 'alphabetical') return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''), undefined, { sensitivity: 'base' });
    if (sort === 'deposited') return Number(b.total_deposited || 0) - Number(a.total_deposited || 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return { users: sortedUsers.slice(Math.max(offset, 0), Math.max(offset, 0) + Math.min(Math.max(limit, 1), 200)), total: count || 0 };
}

export async function creditUserBalance(userId: string, amount: number, note: string, fundingSource: string, env?: any) {
  assertValidAdminCredit(amount, note);
  // No silent default: an ambiguous credit would corrupt the balance sheet.
  assertValidAdminFundingSource(fundingSource);
  const ledgerType = resolveAdminCreditLedgerType(fundingSource);
  const description = ledgerType === 'admin_grant'
    ? `Free funds by admin (no money received): ${note.trim()}`
    : `Manual funding by admin (money received): ${note.trim()}`;

  try {
    const balance = await creditBalance(userId, amount, description, ledgerType, env, 'admin_funding', fundingSource);
    return { balance, ledgerType, fundingSource };
  } catch (error: any) {
    // Pre-migration schema: the ledger still rejects admin_grant rows — tell the
    // admin what to do instead of leaking a raw Postgres error.
    const raw = String(error?.message || '');
    if (fundingSource === 'free_grant' && (raw.includes('invalid_wallet_transaction') || raw.includes('wallet_transactions_type_check'))) {
      throw new Error('Free funds cannot be recorded yet — apply the 20260915210000_admin_funding_sources SQL migration in Supabase first. Meanwhile you can add the balance as "manually funded".');
    }
    throw error;
  }
}

// Canonical balance-sheet totals (real money in vs free funds handed out).
// Falls back to direct ledger aggregates when the wallet_funding_summary RPC is
// not deployed yet (funding-sources migration pending), so the balance sheet
// keeps working: free funds are genuinely zero before the migration because the
// check constraint rejects admin_grant rows.
export async function getFundingSummary(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase.rpc('wallet_funding_summary');
  if (!error) return data || {};

  const missing = ['404', 'PGRST202', '42883'].includes(String(error.code || ''))
    || /wallet_funding_summary|Could not find the function|schema cache/i.test(String(error.message || ''));
  if (!missing) throw error;

  // Asia/Kolkata is a fixed UTC+5:30 offset — no DST, safe to derive directly.
  const todayIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const [funding, profiles] = await Promise.all([
    supabase.from('wallet_transactions').select('type,amount,created_at').in('type', ['topup', 'admin_credit']).eq('status', 'completed'),
    supabase.from('profiles').select('wallet_balance').eq('role', 'user'),
  ]);
  if (funding.error) throw funding.error;
  if (profiles.error) throw profiles.error;

  const totals = { totalTopups: 0, topupCount: 0, topupsToday: 0, manualFunding: 0, manualFundingCount: 0, manualFundingToday: 0 };
  for (const tx of funding.data || []) {
    const amount = parseFloat(tx.amount) || 0;
    const isToday = new Date(new Date(tx.created_at).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10) === todayIst;
    if (tx.type === 'topup') {
      totals.totalTopups += amount;
      totals.topupCount += 1;
      if (isToday) totals.topupsToday += amount;
    } else {
      totals.manualFunding += amount;
      totals.manualFundingCount += 1;
      if (isToday) totals.manualFundingToday += amount;
    }
  }

  return {
    ...totals,
    freeFunds: 0,
    freeFundsToday: 0,
    freeFundsCount: 0,
    cashCollected: totals.totalTopups + totals.manualFunding,
    cashCollectedToday: totals.topupsToday + totals.manualFundingToday,
    walletLiability: (profiles.data || []).reduce((sum: number, p: any) => sum + (parseFloat(p.wallet_balance) || 0), 0),
    legacySchema: true,
  };
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
  else if (status === 'code_received') query = query.eq('status', 'code_received');
  else if (status && status !== 'all') query = query.eq('status', status);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  const orders = data || [];
  const orderIds = orders.map((order: any) => order.id);
  let events: any[] = [];
  if (orderIds.length) {
    const eventResult = await supabase.from('order_events').select('*').in('order_id', orderIds).order('created_at', { ascending: true });
    if (eventResult.error) throw eventResult.error;
    events = eventResult.data || [];
  }
  return {
    orders: orders.map((order: any) => ({ ...order, events: events.filter((event: any) => event.order_id === order.id) })),
    total: count || 0,
  };
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
  const requestIds = (data || []).map((request: any) => request.id).filter(Boolean);
  const creditedRequestIds = new Set<string>();
  if (requestIds.length) {
    const { data: credits, error: creditsError } = await supabase
      .from('wallet_transactions')
      .select('reference_id')
      .eq('reference_type', 'payment_request')
      .eq('type', 'topup')
      .eq('status', 'completed')
      .in('reference_id', requestIds);
    if (creditsError) throw creditsError;
    for (const credit of credits || []) {
      if (credit.reference_id) creditedRequestIds.add(String(credit.reference_id));
    }
  }

  return (data || []).map((req: any) => {
    const s = String(req.status || '').toLowerCase().trim();
    const normalizedStatus =
      creditedRequestIds.has(String(req.id)) || s === 'paid' || s === 'approved' || s === 'completed' || s === 'success'
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

  // Fetch payment request details to trigger referral bonus if applicable
  try {
    const { data: reqData } = await supabase
      .from('payment_requests')
      .select('user_id, amount, amount_inr')
      .eq('id', id)
      .maybeSingle();

    if (reqData && reqData.user_id) {
      const depositAmount = parseFloat(reqData.amount ?? reqData.amount_inr ?? 0);
      if (depositAmount > 0) {
        await processReferralDepositBonus(reqData.user_id, depositAmount, env).catch((err) => {
          console.warn('[Admin Approve] Referral bonus processing error:', err);
        });
      }
    }
  } catch (err) {
    console.warn('[Admin Approve] Failed checking referral bonus for request:', id, err);
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

export async function getAdminRecharges(limit = 20, offset = 0, search = '', source = 'all', env?: any) {
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
    .in('type', adminFundingLedgerTypes(source));

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
    // Normalised label so the admin UI never has to guess what funded the balance.
    fundingSource: tx.type === 'topup' ? 'upi' : tx.type === 'admin_grant' ? 'free_grant' : 'manual_funding',
  }));

  return { recharges, total: count || 0 };
}
