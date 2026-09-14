import { getSupabaseAdmin, authenticateUser } from '../lib/supabase';
import { getServices, getCountries, getServiceCountries, getDisabledCatalog, setServiceActiveStatus, setCountryActiveStatus, setDisabledCatalog } from '../lib/catalog';
import { buyNumber, checkOrderStatus, cancelOrder, completeOrder, retryOrder } from '../lib/order';
import { getBalance, getWalletConfig } from '../lib/wallet';
import { registerSession, checkSession } from '../lib/session';
import { getReferralStats, attributeReferral } from '../lib/referrals';
import { calculateSellPrice, getZeroMarkupUsers, setZeroMarkupUser } from '../lib/pricing';
import { testTelegramConnection } from '../lib/telegram';
import {
  getAdminDashboard,
  getAdminUsers,
  creditUserBalance,
  banUser,
  getAdminOrders,
  getAdminPricing,
  createPricingRule,
  deletePricingRule,
  getAdminSettings,
  saveAdminSettings,
  getPaymentRequests,
  approvePaymentRequest,
  rejectPaymentRequest,
} from '../lib/admin';
import { calculateSellPrice } from '../lib/pricing';
import { TigerSmsClient } from '../lib/tiger';

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id',
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id',
  };
}

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    // ─── Health Check ───
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
    }

    // ─── Branding ───
    if (path === '/api/branding') {
      const supabase = getSupabaseAdmin(env);
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['brand_name', 'title_separator', 'brand_slogan', 'maintenance_mode']);

      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => {
        map[r.key] = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
      });

      return jsonResponse({
        success: true,
        data: {
          brandName: map['brand_name'] || 'OTPWala',
          separator: map['title_separator'] || '—',
          slogan: map['brand_slogan'] || 'Instant Virtual Numbers for SMS Verification',
          maintenanceMode: map['maintenance_mode'] === 'true',
        },
      });
    }

    // ─── Auth Config & Email Pre-check ───
    if (path === '/api/auth/config') {
      return jsonResponse({
        success: true,
        data: {
          allowRegistration: true,
          allowEmailSignup: true,
          allowGoogleLogin: true,
        },
      });
    }

    if (path === '/api/auth/check-email' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email) return jsonResponse({ success: false, error: 'Email required' }, 400);

      const supabase = getSupabaseAdmin(env);
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      return jsonResponse({ success: true, exists: !!profile });
    }

    // ─── Session Management ───
    if (path === '/api/auth/register-session' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const sessionId = body.sessionId;
      if (!sessionId) return jsonResponse({ success: false, error: 'sessionId required' }, 400);

      const userAgent = request.headers.get('user-agent') || 'unknown';
      const result = await registerSession(auth.userId, sessionId, userAgent, env);
      return jsonResponse({ success: true, data: result });
    }

    if (path === '/api/auth/session-check') {
      const authHeader = request.headers.get('authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const sessionId = request.headers.get('x-session-id') || url.searchParams.get('sessionId') || '';

      const check = await checkSession(token, sessionId, env);
      return jsonResponse(check, check.valid ? 200 : 401);
    }

    // ─── Catalog ───
    if (path === '/api/services' && method === 'GET') {
      const services = await getServices(env);
      return jsonResponse({ success: true, data: services });
    }

    if (path === '/api/countries' && method === 'GET') {
      const countries = await getCountries(env);
      return jsonResponse({ success: true, data: countries });
    }

    const serviceCountriesMatch = path.match(/^\/api\/services\/([^\/]+)\/countries$/);
    if (serviceCountriesMatch && method === 'GET') {
      const serviceCode = serviceCountriesMatch[1];
      const auth = await authenticateUser(request, env);
      const countries = await getServiceCountries(serviceCode, auth?.userId, env);
      return jsonResponse({ success: true, data: countries });
    }

    if (path === '/api/prices' && method === 'GET') {
      const service = url.searchParams.get('service');
      const country = parseInt(url.searchParams.get('country') || '', 10);
      if (!service || isNaN(country)) {
        return jsonResponse({ success: false, error: 'service and country required' }, 400);
      }

      const tiger = new TigerSmsClient(env);
      const priceData = await tiger.getPricesV3(service, country);
      const countryData = priceData[String(country)];
      const sPrice = countryData ? countryData[service] : null;

      if (!sPrice || sPrice.count <= 0) {
        return jsonResponse({ success: true, data: { available: false, count: 0, priceInr: 0, priceUsd: 0 } });
      }

      const auth = await authenticateUser(request, env);
      const priceInr = await calculateSellPrice(sPrice.price, service, country, auth?.userId, env);

      return jsonResponse({
        success: true,
        data: {
          available: true,
          count: sPrice.count,
          priceInr,
          priceUsd: sPrice.price,
        },
      });
    }

    // ─── Numbers / Orders ───
    if (path === '/api/numbers/buy' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { service, country } = body;
      if (!service || country === undefined) {
        return jsonResponse({ success: false, error: 'service and country required' }, 400);
      }

      try {
        const result = await buyNumber(auth.userId, service, parseInt(country, 10), env);
        return jsonResponse({ success: true, data: result });
      } catch (buyErr: any) {
        const msg = (buyErr?.message || '').toLowerCase();
        if (msg.includes('insufficient')) {
          return jsonResponse({ success: false, error: 'insufficient_funds', message: 'Insufficient wallet balance' }, 402);
        }
        throw buyErr;
      }
    }

    const orderStatusMatch = path.match(/^\/api\/numbers\/([^\/]+)\/status$/);
    if (orderStatusMatch && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const orderId = orderStatusMatch[1];
      const status = await checkOrderStatus(orderId, auth.userId, env);
      return jsonResponse({ success: true, data: status });
    }

    const orderCancelMatch = path.match(/^\/api\/numbers\/([^\/]+)\/cancel$/);
    if (orderCancelMatch && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const orderId = orderCancelMatch[1];
      await cancelOrder(orderId, auth.userId, env);
      return jsonResponse({ success: true, message: 'Order cancelled and refunded' });
    }

    const orderCompleteMatch = path.match(/^\/api\/numbers\/([^\/]+)\/complete$/);
    if (orderCompleteMatch && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const orderId = orderCompleteMatch[1];
      await completeOrder(orderId, auth.userId, env);
      return jsonResponse({ success: true, message: 'Order completed' });
    }

    const orderRetryMatch = path.match(/^\/api\/numbers\/([^\/]+)\/retry$/);
    if (orderRetryMatch && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const orderId = orderRetryMatch[1];
      await retryOrder(orderId, auth.userId, env);
      return jsonResponse({ success: true, message: 'Another SMS requested' });
    }

    // ─── Wallet ───
    if (path === '/api/wallet/config' && method === 'GET') {
      const config = await getWalletConfig(env);
      return jsonResponse({ success: true, data: config });
    }

    if (path === '/api/wallet' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const supabase = getSupabaseAdmin(env);
      const [balance, { data: transactions, count }, config] = await Promise.all([
        getBalance(auth.userId, env),
        supabase
          .from('wallet_transactions')
          .select('*', { count: 'exact' })
          .eq('user_id', auth.userId)
          .order('created_at', { ascending: false })
          .range(0, 9),
        getWalletConfig(env),
      ]);

      return jsonResponse({
        success: true,
        data: {
          balance,
          transactions: transactions || [],
          totalTransactions: count || 0,
          config,
        },
      });
    }

    if (path === '/api/wallet/transactions' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      const supabase = getSupabaseAdmin(env);
      const { data, count } = await supabase
        .from('wallet_transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return jsonResponse({
        success: true,
        data: { transactions: data || [], total: count || 0 },
      });
    }

    if (path === '/api/wallet/topup' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { amount, transactionId, paymentMethod, screenshotUrl } = body;

      const supabase = getSupabaseAdmin(env);
      const { data, error } = await supabase
        .from('payment_requests')
        .insert({
          user_id: auth.userId,
          amount: parseFloat(amount),
          transaction_id: transactionId || null,
          payment_method: paymentMethod || 'upi',
          screenshot_url: screenshotUrl || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;
      return jsonResponse({ success: true, data });
    }

    if (path === '/api/wallet/payment-requests' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const supabase = getSupabaseAdmin(env);
      const { data } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      return jsonResponse({ success: true, data: data || [] });
    }

    // ─── Orders List ───
    if (path === '/api/orders' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);
      const status = url.searchParams.get('status');

      const supabase = getSupabaseAdmin(env);
      let query = supabase.from('orders').select('*', { count: 'exact' }).eq('user_id', auth.userId);
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return jsonResponse({
        success: true,
        data: { orders: data || [], total: count || 0 },
      });
    }

    // ─── Referrals ───
    if (path === '/api/referrals' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const stats = await getReferralStats(auth.userId, env);
      return jsonResponse({ success: true, data: stats });
    }

    if (path === '/api/referrals/attribute' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { referralCode } = body;
      if (!referralCode) return jsonResponse({ success: false, error: 'referralCode required' }, 400);

      const result = await attributeReferral(auth.userId, referralCode, env);
      return jsonResponse(result);
    }

    if (path === '/api/referrals/claim' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { referralCode } = body;
      if (!referralCode) return jsonResponse({ success: false, error: 'Referral code is required' }, 400);

      const result = await attributeReferral(auth.userId, referralCode, env);
      if (!result.success) return jsonResponse({ success: false, error: (result as any).message || 'Failed to link referral' }, 400);
      return jsonResponse({ success: true, data: { attributed: true }, message: (result as any).message });
    }

    // ─── Admin Routes ───
    if (path.startsWith('/api/admin/')) {
      const auth = await authenticateUser(request, env);
      if (!auth || auth.role !== 'admin') {
        return jsonResponse({ success: false, error: 'Admin access required' }, 403);
      }

      if (path === '/api/admin/dashboard') {
        const stats = await getAdminDashboard(env);
        return jsonResponse({ success: true, data: stats });
      }

      if (path === '/api/admin/tiger-balance') {
        const tiger = new TigerSmsClient(env);
        const bal = await tiger.getBalance().catch(() => ({ balance: '0' }));
        return jsonResponse({ success: true, data: { balance: parseFloat(bal.balance) || 0 } });
      }

      if (path === '/api/admin/users' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const search = url.searchParams.get('search') || '';
        const users = await getAdminUsers(limit, offset, search, env);
        return jsonResponse({ success: true, data: users });
      }

      // GET /api/admin/users/:id/details
      const userDetailsMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/details$/);
      if (userDetailsMatch && method === 'GET') {
        const targetId = userDetailsMatch[1];
        const supabase = getSupabaseAdmin(env);
        const { data: profile, error: profileErr } = await supabase
          .from('profiles').select('*').eq('id', targetId).maybeSingle();
        if (profileErr || !profile) return jsonResponse({ success: false, error: 'User not found' }, 404);

        let authMeta: any = {};
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(targetId);
          if (authUser?.user) {
            authMeta = {
              name: authUser.user.user_metadata?.full_name || authUser.user.user_metadata?.name || null,
              avatar_url: authUser.user.user_metadata?.avatar_url || authUser.user.user_metadata?.picture || null,
              last_sign_in_at: authUser.user.last_sign_in_at || null,
              email: authUser.user.email || profile.email,
            };
          }
        } catch {}

        const zeroUsers = await getZeroMarkupUsers(env);
        const [txRes, ordersRes] = await Promise.all([
          supabase.from('wallet_transactions').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(10),
          supabase.from('orders').select('id,service_name,country_name,phone_number,price_inr,status,created_at').eq('user_id', targetId).order('created_at', { ascending: false }).limit(5),
        ]);

        const resolvedName = (profile.full_name?.trim()) || authMeta.name || null;
        return jsonResponse({
          success: true,
          data: {
            user: { ...profile, wallet_balance: parseFloat(profile.wallet_balance || 0), full_name: resolvedName, name: resolvedName, avatar_url: authMeta.avatar_url || null, last_sign_in_at: authMeta.last_sign_in_at || null, has_zero_markup: zeroUsers.includes(targetId) },
            transactions: txRes.data || [],
            orders: ordersRes.data || [],
          },
        });
      }

      const userCreditMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/credit$/);
      if (userCreditMatch && method === 'POST') {
        const targetUserId = userCreditMatch[1];
        const body = await request.json().catch(() => ({}));
        await creditUserBalance(targetUserId, parseFloat(body.amount), body.note, env);
        return jsonResponse({ success: true });
      }

      // POST /api/admin/users/:id/zero-markup
      const userZeroMarkupMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/zero-markup$/);
      if (userZeroMarkupMatch && method === 'POST') {
        const targetUserId = userZeroMarkupMatch[1];
        const body = await request.json().catch(() => ({}));
        const updated = await setZeroMarkupUser(targetUserId, !!body.hasZeroMarkup, env);
        return jsonResponse({ success: true, data: { userId: targetUserId, hasZeroMarkup: updated }, message: updated ? 'User granted zero-markup (Tiger SMS cost rate).' : 'User returned to standard markup rate.' });
      }

      // POST /api/admin/users/:id/ban  
      const userBanMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/ban$/);
      if (userBanMatch && method === 'POST') {
        const targetUserId = userBanMatch[1];
        const body = await request.json().catch(() => ({}));
        await banUser(targetUserId, !!body.banned, body.reason, env);
        return jsonResponse({ success: true, message: body.banned ? 'User banned' : 'User unbanned' });
      }

      // DELETE /api/admin/users/:id
      const userDeleteMatch = path.match(/^\/api\/admin\/users\/([^\/]+)$/);
      if (userDeleteMatch && method === 'DELETE') {
        const targetUserId = userDeleteMatch[1];
        const supabase = getSupabaseAdmin(env);
        if (targetUserId === auth.userId) return jsonResponse({ success: false, error: 'You cannot delete your own account.' }, 400);

        const { data: profile } = await supabase.from('profiles').select('id,email,role,is_banned').eq('id', targetUserId).maybeSingle();
        if (!profile) return jsonResponse({ success: false, error: 'User not found' }, 404);
        if (profile.role === 'admin') return jsonResponse({ success: false, error: 'Cannot delete an administrator account.' }, 400);
        if (!profile.is_banned) return jsonResponse({ success: false, error: 'User must be banned before they can be deleted. Please ban the user first.' }, 400);

        await supabase.from('payment_requests').delete().eq('user_id', targetUserId);
        await supabase.from('orders').delete().eq('user_id', targetUserId);
        await supabase.from('wallet_transactions').delete().eq('user_id', targetUserId);
        await supabase.from('profiles').delete().eq('id', targetUserId);
        try { await supabase.auth.admin.deleteUser(targetUserId); } catch {}
        return jsonResponse({ success: true, message: `User ${profile.email || targetUserId} permanently deleted.` });
      }

      // POST /api/admin/users/bulk-ban
      if (path === '/api/admin/users/bulk-ban' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { userIds, banned } = body;
        if (!Array.isArray(userIds) || userIds.length === 0) return jsonResponse({ success: false, error: 'No users selected.' }, 400);
        const targets = userIds.filter((uid: string) => uid !== auth.userId);
        if (targets.length === 0) return jsonResponse({ success: false, error: 'Cannot ban your own account.' }, 400);
        const supabase = getSupabaseAdmin(env);
        const { error } = await supabase.from('profiles').update({ is_banned: !!banned, updated_at: new Date().toISOString() }).in('id', targets).neq('role', 'admin');
        if (error) throw error;
        return jsonResponse({ success: true, message: `${targets.length} user(s) ${banned ? 'banned' : 'unbanned'} successfully.` });
      }

      // POST /api/admin/users/bulk-delete
      if (path === '/api/admin/users/bulk-delete' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { userIds } = body;
        if (!Array.isArray(userIds) || userIds.length === 0) return jsonResponse({ success: false, error: 'No users selected.' }, 400);
        const targets = userIds.filter((uid: string) => uid !== auth.userId);
        const supabase = getSupabaseAdmin(env);
        const { data: profiles } = await supabase.from('profiles').select('id,email,role,is_banned').in('id', targets);
        if (!profiles || profiles.length === 0) return jsonResponse({ success: false, error: 'No matching users found.' }, 404);
        const unbanned = profiles.filter((p: any) => !p.is_banned);
        if (unbanned.length > 0) return jsonResponse({ success: false, error: `Cannot delete unbanned users (${unbanned.length} unbanned). All selected users must be banned first.` }, 400);
        const eligible = profiles.filter((p: any) => p.role !== 'admin' && p.is_banned).map((p: any) => p.id);
        if (eligible.length === 0) return jsonResponse({ success: false, error: 'No eligible banned users to delete.' }, 400);
        await supabase.from('payment_requests').delete().in('user_id', eligible);
        await supabase.from('orders').delete().in('user_id', eligible);
        await supabase.from('wallet_transactions').delete().in('user_id', eligible);
        await supabase.from('profiles').delete().in('id', eligible);
        await Promise.allSettled(eligible.map((uid: string) => supabase.auth.admin.deleteUser(uid)));
        return jsonResponse({ success: true, message: `${eligible.length} banned user(s) permanently deleted.` });
      }

      if (path === '/api/admin/orders' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const orders = await getAdminOrders(limit, offset, env);
        return jsonResponse({ success: true, data: orders });
      }

      if (path === '/api/admin/pricing' && method === 'GET') {
        const rules = await getAdminPricing(env);
        return jsonResponse({ success: true, data: rules });
      }

      if (path === '/api/admin/pricing' && method === 'POST') {
        const rule = await request.json();
        const created = await createPricingRule(rule, env);
        return jsonResponse({ success: true, data: created });
      }

      const priceDeleteMatch = path.match(/^\/api\/admin\/pricing\/([^\/]+)$/);
      if (priceDeleteMatch && method === 'DELETE') {
        await deletePricingRule(priceDeleteMatch[1], env);
        return jsonResponse({ success: true });
      }

      if (path === '/api/admin/settings' && method === 'GET') {
        const settings = await getAdminSettings(env);
        return jsonResponse({ success: true, data: settings });
      }

      if (path === '/api/admin/settings' && method === 'POST') {
        const body = await request.json();
        await saveAdminSettings(body.settings || body, env);
        return jsonResponse({ success: true });
      }

      if (path === '/api/admin/payment-requests' && method === 'GET') {
        const requests = await getPaymentRequests(env);
        return jsonResponse({ success: true, data: requests });
      }

      const paymentApproveMatch = path.match(/^\/api\/admin\/payment-requests\/([^\/]+)\/approve$/);
      if (paymentApproveMatch && method === 'POST') {
        await approvePaymentRequest(paymentApproveMatch[1], env);
        return jsonResponse({ success: true });
      }

      const paymentRejectMatch = path.match(/^\/api\/admin\/payment-requests\/([^\/]+)\/reject$/);
      if (paymentRejectMatch && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        await rejectPaymentRequest(paymentRejectMatch[1], body.reason, env);
        return jsonResponse({ success: true });
      }

      // ─── Admin Catalog ───
      if (path === '/api/admin/catalog' && method === 'GET') {
        const tiger = new TigerSmsClient(env);
        const [servicesList, countriesList, { disabledServices, disabledCountries }] = await Promise.all([
          tiger.getServicesList().catch(() => []),
          tiger.getCountries().catch(() => []),
          getDisabledCatalog(env),
        ]);

        const disabledServicesSet = new Set(disabledServices);
        const disabledCountriesSet = new Set(disabledCountries);

        const services = servicesList.map((s: any) => ({
          code: s.code,
          name: s.name,
          enabled: !disabledServicesSet.has(s.code.toLowerCase()),
        }));

        const countries = countriesList.map((c: any) => ({
          id: c.id,
          name: c.eng,
          enabled: !disabledCountriesSet.has(Number(c.id)),
        }));

        return jsonResponse({
          success: true,
          data: {
            services,
            countries,
            stats: {
              totalServices: services.length,
              enabledServices: services.filter((s: any) => s.enabled).length,
              totalCountries: countries.length,
              enabledCountries: countries.filter((c: any) => c.enabled).length,
            },
          },
        });
      }

      if (path === '/api/admin/catalog/service' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { code, enabled } = body;
        if (!code || typeof enabled !== 'boolean') {
          return jsonResponse({ success: false, error: 'Invalid code or enabled status' }, 400);
        }
        const updated = await setServiceActiveStatus(code, enabled, env);
        return jsonResponse({ success: true, message: `Service ${code.toUpperCase()} is now ${enabled ? 'enabled' : 'disabled'}`, data: updated });
      }

      if (path === '/api/admin/catalog/country' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { id, enabled } = body;
        if (id === undefined || typeof enabled !== 'boolean') {
          return jsonResponse({ success: false, error: 'Invalid id or enabled status' }, 400);
        }
        const updated = await setCountryActiveStatus(Number(id), enabled, env);
        return jsonResponse({ success: true, message: `Country ID ${id} is now ${enabled ? 'enabled' : 'disabled'}`, data: updated });
      }

      if (path === '/api/admin/catalog/batch' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { action } = body;

        const POPULAR_SVCS = ['wa', 'tg', 'go', 'ig', 'fb', 'lf', 'mm', 'dr', 'tw', 'nf'];
        const POPULAR_CTRS = [0, 1, 2, 4, 5, 6, 7, 10, 16, 22, 187];

        const tiger = new TigerSmsClient(env);
        const [allServices, allCountries] = await Promise.all([
          tiger.getServicesList().catch(() => []),
          tiger.getCountries().catch(() => []),
        ]);

        if (action === 'enable_all_services') {
          await setDisabledCatalog([], undefined, env);
        } else if (action === 'disable_all_services') {
          await setDisabledCatalog((allServices as any[]).map((s) => s.code), undefined, env);
        } else if (action === 'enable_popular_services') {
          const disabled = (allServices as any[]).filter((s) => !POPULAR_SVCS.includes(s.code.toLowerCase())).map((s) => s.code);
          await setDisabledCatalog(disabled, undefined, env);
        } else if (action === 'enable_all_countries') {
          await setDisabledCatalog(undefined, [], env);
        } else if (action === 'disable_all_countries') {
          await setDisabledCatalog(undefined, (allCountries as any[]).map((c) => c.id), env);
        } else if (action === 'enable_popular_countries') {
          const disabled = (allCountries as any[]).filter((c) => !POPULAR_CTRS.includes(Number(c.id))).map((c) => c.id);
          await setDisabledCatalog(undefined, disabled, env);
        } else {
          return jsonResponse({ success: false, error: 'Unknown batch action' }, 400);
        }

        return jsonResponse({ success: true, message: `Batch action "${action}" executed successfully` });
      }

      // POST /api/admin/telegram/test
      if (path === '/api/admin/telegram/test' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const result = await testTelegramConnection(body.botToken, body.chatId, env);
        return jsonResponse(result);
      }
    }

    return jsonResponse({ success: false, error: `Route not found: ${method} ${path}` }, 404);
  } catch (err: any) {
    console.error(`API Error on ${method} ${path}:`, err);
    return jsonResponse({ success: false, error: err.message || 'Internal server error' }, 500);
  }
};
