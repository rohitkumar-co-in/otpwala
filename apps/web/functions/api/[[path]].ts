import { getSupabaseAdmin, authenticateUser } from '../lib/supabase';
import { getServices, getCountries, getServiceCountries } from '../lib/catalog';
import { buyNumber, checkOrderStatus, cancelOrder, completeOrder, retryOrder } from '../lib/order';
import { getBalance, getWalletConfig } from '../lib/wallet';
import { registerSession, checkSession } from '../lib/session';
import { getReferralStats, attributeReferral } from '../lib/referrals';
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

      const result = await buyNumber(auth.userId, service, parseInt(country, 10), env);
      return jsonResponse({ success: true, data: result });
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

      const userCreditMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/credit$/);
      if (userCreditMatch && method === 'POST') {
        const targetUserId = userCreditMatch[1];
        const body = await request.json().catch(() => ({}));
        await creditUserBalance(targetUserId, parseFloat(body.amount), body.note, env);
        return jsonResponse({ success: true });
      }

      const userBanMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/ban$/);
      if (userBanMatch && method === 'POST') {
        const targetUserId = userBanMatch[1];
        const body = await request.json().catch(() => ({}));
        await banUser(targetUserId, !!body.banned, body.reason, env);
        return jsonResponse({ success: true });
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
    }

    return jsonResponse({ success: false, error: `Route not found: ${method} ${path}` }, 404);
  } catch (err: any) {
    console.error(`API Error on ${method} ${path}:`, err);
    return jsonResponse({ success: false, error: err.message || 'Internal server error' }, 500);
  }
};
