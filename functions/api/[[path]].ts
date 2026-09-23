import { getSupabaseAdmin, authenticateUser } from '../lib/supabase';
import { getServices, getCountries, getServiceCountries, getDisabledCatalog, setServiceActiveStatus, setCountryActiveStatus, setDisabledCatalog, setFeaturedService, setFeaturedCountry } from '../lib/catalog';
import { buyNumber, checkOrderStatus, cancelOrder, retryOrder, reconcileExpiredOrders } from '../lib/order';
import { getBalance, getWalletConfig } from '../lib/wallet';
import { registerSession, checkSession } from '../lib/session';
import { getReferralStats, attributeReferral } from '../lib/referrals';
import { calculateSellPrice, getZeroMarkupUsers, setZeroMarkupUser } from '../lib/pricing';
import { TigerSmsError } from '../lib/tiger';
import {
  testTelegramConnection,
  notifyPaymentApprovalRequest,
  getTelegramConfig,
  verifyActionToken,
  getTelegramWebhookSecret,
  answerCallbackQuery,
  editTelegramMessageText,
} from '../lib/telegram';
import {
  getAdminDashboard,
  logAdminAction,
  getAdminAuditLogs,
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
  getAdminRecharges,
  getFundingSummary,
} from '../lib/admin';
import { TigerSmsClient } from '../lib/tiger';
import { createSupportTicket, getUserSupportTickets, getAdminSupportTickets, updateSupportTicket, replyToSupportTicket } from '../lib/support';

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://otpwala.me',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://otpwala.me',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-session-id',
  };
}

function renderActionPageHtml(props: { success: boolean; title: string; message: string; isReject?: boolean }): string {
  const accentColor = props.success ? (props.isReject ? '#ef4444' : '#10b981') : '#f59e0b';
  const iconEmoji = props.success ? (props.isReject ? '❌' : '✅') : '⚠️';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${props.title} - OTPWala Admin</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b0f19;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid ${accentColor}55;
      border-radius: 16px;
      padding: 36px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .icon {
      font-size: 52px;
      margin-bottom: 16px;
      line-height: 1;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 22px;
      color: ${accentColor};
      font-weight: 700;
    }
    p {
      margin: 0 0 24px;
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${iconEmoji}</div>
    <h1>${props.title}</h1>
    <p>${props.message}</p>
    <a href="/admin" class="btn">Open Admin Dashboard</a>
  </div>
</body>
</html>`;
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
    if (path === '/api/health' && method === 'GET') {
      const timedCheck = async (check: () => Promise<boolean>) => {
        const started = Date.now();
        try {
          return { status: (await check()) ? 'operational' : 'outage', latencyMs: Date.now() - started };
        } catch {
          return { status: 'outage', latencyMs: Date.now() - started };
        }
      };
      const [database, provider] = await Promise.all([
        timedCheck(async () => {
          const { error } = await getSupabaseAdmin(env).from('settings').select('key', { head: true, count: 'exact' }).limit(1);
          return !error;
        }),
        timedCheck(async () => (await new TigerSmsClient(env).getBalance())?.balance !== undefined),
      ]);
      const components = {
        website: { status: 'operational', latencyMs: 0 },
        database,
        smsProvider: provider,
      };
      const status = database.status === 'outage' ? 'outage' : provider.status === 'outage' ? 'degraded' : 'operational';
      return jsonResponse({
        success: true,
        status,
        components,
        checkedAt: new Date().toISOString(),
        version: String(env?.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || undefined,
      });
    }

    if (path === '/api/support/tickets') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      if (method === 'GET') return jsonResponse({ success: true, data: await getUserSupportTickets(auth.userId, env) });
      if (method === 'POST') {
        const ticket = await createSupportTicket(auth.userId, await request.json().catch(() => ({})), env);
        return jsonResponse({ success: true, data: ticket }, 201);
      }
    }

    const userSupportReplyMatch = path.match(/^\/api\/support\/tickets\/([^\/]+)\/reply$/);
    if (userSupportReplyMatch && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      return jsonResponse({ success: true, data: await replyToSupportTicket(userSupportReplyMatch[1], auth.userId, await request.json().catch(() => ({})), false, env) });
    }

    if (path === '/api/account/export' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const supabase = getSupabaseAdmin(env);
      const [profile, securityLogs, orders, transactions, paymentRequests, referralsGiven, tickets] = await Promise.all([
        supabase.from('profiles').select('id,email,full_name,role,wallet_balance,referral_code,created_at,updated_at,last_login_ip,last_login_isp,last_login_at').eq('id', auth.userId).single(),
        supabase.from('user_security_logs').select('id,event_type,ip_address,isp,asn,country,region,city,user_agent,created_at').eq('user_id', auth.userId).order('created_at', { ascending: false }).limit(100),
        supabase.from('orders').select('id,service_name,country_name,phone_number,status,sms_code,price_inr,refund_status,created_at,updated_at').eq('user_id', auth.userId).order('created_at', { ascending: false }),
        supabase.from('wallet_transactions').select('id,type,amount,balance_after,description,status,reference_type,reference_id,created_at').eq('user_id', auth.userId).order('created_at', { ascending: false }),
        supabase.from('payment_requests').select('id,payment_method,amount,utr,binance_tx_id,status,created_at,reviewed_at').eq('user_id', auth.userId).order('created_at', { ascending: false }),
        supabase.from('referrals').select('id,referee_id,status,bonus_tier1_amount,bonus_tier2_amount,bonus_tier3_amount,created_at').eq('referrer_id', auth.userId).order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('id,order_id,subject,message,ticket_type,attachment,status,priority,public_reply,created_at,updated_at').eq('user_id', auth.userId).order('created_at', { ascending: false }),
      ]);
      const queryError = profile.error || orders.error || transactions.error || tickets.error;
      if (queryError) throw queryError;
      return jsonResponse({
        success: true,
        data: {
          exportedAt: new Date().toISOString(),
          profile: profile.data,
          securityLogs: securityLogs.data || [],
          orders: orders.data || [],
          walletTransactions: transactions.data || [],
          paymentRequests: paymentRequests.data || [],
          referrals: referralsGiven.data || [],
          supportTickets: tickets.data || []
        }
      });
    }

    if (path === '/api/account/deletion-request' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const supabase = getSupabaseAdmin(env);
      const { data: existing } = await supabase.from('data_deletion_requests').select('id,status,requested_at').eq('user_id', auth.userId).eq('status', 'pending').maybeSingle();
      if (existing) return jsonResponse({ success: true, data: existing, message: 'A deletion request is already being reviewed.' });
      const { data, error } = await supabase.from('data_deletion_requests').insert({ user_id: auth.userId, user_message: 'Erase my account and eligible personal data. I understand required financial records may be retained.' }).select().single();
      if (error) throw error;
      return jsonResponse({ success: true, data }, 201);
    }

    if (path === '/api/account/deletion-request' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const { data, error } = await getSupabaseAdmin(env).from('data_deletion_requests').select('id,status,user_message,admin_notes,requested_at,processed_at,updated_at').eq('user_id', auth.userId).order('requested_at', { ascending: false }).limit(10);
      if (error) throw error;
      return jsonResponse({ success: true, data: data || [] });
    }

    if (path === '/api/cron/reconcile' && method === 'POST') {
      const cronSecret = String(env?.CRON_SECRET || '').trim();
      const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!cronSecret || supplied !== cronSecret) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
      const result = await reconcileExpiredOrders(env);
      return jsonResponse({ success: true, data: result });
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
      const supabase = getSupabaseAdmin(env);
      const { data } = await supabase.from('settings').select('key,value').in('key', [
        'auth_allow_registration', 'auth_allow_email_signup', 'auth_allow_google_login',
      ]);
      const settings = Object.fromEntries((data || []).map((row: any) => [row.key, String(row.value)]));
      return jsonResponse({
        success: true,
        data: {
          allowRegistration: settings.auth_allow_registration !== 'false',
          allowEmailSignup: settings.auth_allow_email_signup !== 'false',
          allowGoogleLogin: settings.auth_allow_google_login !== 'false',
        },
      });
    }

    if (path === '/api/auth/check-email' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email) return jsonResponse({ success: false, error: 'Email required' }, 400);

      const supabase = getSupabaseAdmin(env);

      // 1. Check profiles table (case-insensitive)
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', email)
          .maybeSingle();

        if (profile) {
          return jsonResponse({ success: true, exists: true });
        }
      } catch (err) {
        console.warn('Profiles check error:', err);
      }

      // 2. Check RPC check_email_exists (queries auth.users and profiles directly)
      try {
        const { data: rpcExists, error: rpcErr } = await supabase.rpc('check_email_exists', { p_email: email });
        if (!rpcErr && rpcExists === true) {
          return jsonResponse({ success: true, exists: true });
        }
      } catch (err) {
        console.warn('RPC check_email_exists error:', err);
      }

      // 3. Check Supabase Auth Admin listUsers
      try {
        const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
        if (!authErr && authData?.users && authData.users.length > 0) {
          const found = authData.users.some(
            (u) => (u.email || '').trim().toLowerCase() === email
          );
          if (found) {
            return jsonResponse({ success: true, exists: true });
          }
        }
      } catch (err) {
        console.warn('Admin listUsers check error:', err);
      }

      return jsonResponse({ success: true, exists: false });
    }

    // ─── Session Management ───
    if (path === '/api/auth/register-session' && method === 'POST') {
      const auth = await authenticateUser(request, env, { allowSessionReplacement: true });
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const sessionId = body.sessionId;
      if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(sessionId))) {
        return jsonResponse({ success: false, error: 'invalid_session_id', message: 'A valid device session ID is required.' }, 400);
      }

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

    if (path === '/api/auth/ensure-profile' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const supabase = getSupabaseAdmin(env);
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', auth.userId)
        .maybeSingle();

      return jsonResponse({ success: true, profile });
    }

    // ─── Catalog ───
    const serviceIconMatch = path.match(/^\/api\/catalog\/service-icon\/([a-zA-Z0-9_-]+)$/);
    if (serviceIconMatch && method === 'GET') {
      const iconResponse = await fetch(`https://tiger-sms.com/img/service/${serviceIconMatch[1]}.svg`, {
        headers: { Accept: 'image/svg+xml' },
      });
      if (!iconResponse.ok) {
        return new Response(null, { status: 404 });
      }
      return new Response(iconResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const countryFlagMatch = path.match(/^\/api\/catalog\/country-flag\/([a-zA-Z]{2})$/);
    if (countryFlagMatch && method === 'GET') {
      const iso = countryFlagMatch[1].toLowerCase();
      const flagResponse = await fetch(`https://flagcdn.com/${iso}.svg`, {
        headers: { Accept: 'image/svg+xml' },
      });
      if (!flagResponse.ok) {
        return new Response(null, { status: 404 });
      }
      return new Response(flagResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400, s-maxage=604800',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (path === '/api/services' && method === 'GET') {
      const featuredOnly = url.searchParams.get('featured') === 'true';
      if (featuredOnly && url.searchParams.get('summary') === 'true') {
        const [allServices, countries] = await Promise.all([
          getServices(false, env),
          getCountries(env),
        ]);
        return jsonResponse({
          success: true,
          data: allServices.filter((service: any) => service.isFeatured),
          meta: {
            serviceCount: allServices.length,
            countryCount: countries.length,
          },
        });
      }
      const services = await getServices(featuredOnly, env);
      return jsonResponse({ success: true, data: services });
    }

    if (path === '/api/catalog/summary' && method === 'GET') {
      const [services, countries] = await Promise.all([
        getServices(false, env),
        getCountries(env),
      ]);
      return jsonResponse({
        success: true,
        data: {
          serviceCount: services.length,
          countryCount: countries.length,
        },
      });
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

    const pricesMatch = path.match(/^\/api\/prices\/([^\/]+)\/([^\/]+)$/);
    if ((pricesMatch || path === '/api/prices') && method === 'GET') {
      const service = pricesMatch ? pricesMatch[1] : url.searchParams.get('service');
      const countryRaw = pricesMatch ? pricesMatch[2] : url.searchParams.get('country');
      const country = parseInt(countryRaw || '', 10);
      if (!service || isNaN(country)) {
        return jsonResponse({ success: false, error: 'service and country required' }, 400);
      }

      const tiger = new TigerSmsClient(env);
      const priceData = await tiger.getPrices(service, country);
      const countryData = priceData[String(country)];
      const sPrice = countryData ? (countryData[service] as any) : null;

      if (!sPrice || sPrice.count <= 0) {
        return jsonResponse({ success: true, data: { available: false, count: 0, priceInr: 0, priceUsd: 0 } });
      }

      const costPriceUsd = parseFloat(String(sPrice.cost ?? sPrice.price ?? '0'));
      const auth = await authenticateUser(request, env);
      const priceInr = await calculateSellPrice(costPriceUsd, service, country, auth?.userId, env);

      return jsonResponse({
        success: true,
        data: {
          available: true,
          count: sPrice.count,
          priceInr,
          priceUsd: costPriceUsd,
        },
      });
    }

    // ─── Numbers / Orders ───
    if (path === '/api/numbers/buy' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { service, country, requestId } = body;
      if (!service || country === undefined) {
        return jsonResponse({ success: false, error: 'service and country required' }, 400);
      }

      if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId))) {
        return jsonResponse({ success: false, error: 'invalid_request_id', message: 'A valid purchase request ID is required.' }, 400);
      }

      const supabase = getSupabaseAdmin(env);
      const normalizedService = String(service).toLowerCase();
      const normalizedCountry = parseInt(country, 10);
      const claim = await supabase.from('purchase_intents').insert({ request_id: requestId, user_id: auth.userId, service_code: normalizedService, country_code: normalizedCountry });
      if (claim.error) {
        if (claim.error.code !== '23505') throw claim.error;
        const { data: prior, error: priorError } = await supabase.from('purchase_intents').select('*').eq('request_id', requestId).eq('user_id', auth.userId).maybeSingle();
        if (priorError || !prior || prior.service_code !== normalizedService || prior.country_code !== normalizedCountry) {
          return jsonResponse({ success: false, error: 'idempotency_conflict', message: 'Purchase request ID conflict.' }, 409);
        }
        if (prior.status === 'completed' && prior.response) return jsonResponse({ success: true, data: prior.response });
        if (prior.status === 'processing') return jsonResponse({ success: false, error: 'purchase_in_progress', message: 'This purchase is still processing. Please wait.' }, 409);
        return jsonResponse({ success: false, error: prior.error_code || 'purchase_failed', message: prior.error_message || 'This purchase attempt failed. Please try again.' }, 409);
      }

      try {
        const result = await buyNumber(auth.userId, normalizedService, normalizedCountry, env, requestId);
        await supabase.from('purchase_intents').update({ status: 'completed', response: result, updated_at: new Date().toISOString() }).eq('request_id', requestId).eq('status', 'processing');
        return jsonResponse({ success: true, data: result });
      } catch (buyErr: any) {
        await supabase.from('purchase_intents').update({ status: 'failed', error_code: buyErr?.code || 'purchase_failed', error_message: String(buyErr?.message || 'Purchase failed').slice(0, 500), updated_at: new Date().toISOString() }).eq('request_id', requestId).eq('status', 'processing');
        if (buyErr?.code === 'USER_INSUFFICIENT_FUNDS' || (buyErr?.message || '').toLowerCase().includes('insufficient wallet balance')) {
          return jsonResponse({ success: false, error: 'user_insufficient_funds', message: 'Insufficient wallet balance' }, 402);
        }
        return jsonResponse({
          success: false,
          error: buyErr?.code || 'purchase_failed',
          message: buyErr?.message || 'Failed to order number. Please try another country or retry.'
        }, 400);
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
      try {
        await cancelOrder(orderId, auth.userId, env);
        return jsonResponse({ success: true, message: 'Order cancelled and refunded' });
      } catch (err) {
        if (err instanceof TigerSmsError) {
          return jsonResponse({
            success: false,
            error: err.code,
            code: err.code,
            message: err.message,
            provider: 'otpwala',
          }, ['WAIT_BEFORE_CANCEL', 'EARLY_CANCEL_DENIED'].includes(err.code) ? 409 : 502);
        }
        throw err;
      }
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
      const amount = parseFloat(body.amount ?? body.amount_inr ?? 0);
      const utr = String(body.utr || body.transactionId || body.gateway_payment_id || '').trim().replace(/\s+/g, '');
      const rawMethod = String(body.method || body.paymentMethod || body.gateway || 'upi').trim().toLowerCase();
      const isBinance = rawMethod.includes('binance');
      const cleanPaymentMethod = isBinance ? 'binance' : 'upi';
      const screenshotUrl = body.screenshotUrl || body.screenshot_url || null;

      if (!amount || isNaN(amount) || amount <= 0) {
        return jsonResponse({ success: false, error: 'Invalid deposit amount' }, 400);
      }

      if (!isBinance) {
        if (!/^\d{12}$/.test(utr)) {
          return jsonResponse({
            success: false,
            error: 'Enter a valid 12-digit numeric UPI reference ID / UTR (e.g. 129815979728)'
          }, 400);
        }
      } else {
        if (!/^\d+$/.test(utr)) {
          return jsonResponse({
            success: false,
            error: 'Enter a valid numeric Binance Pay Order ID (digits only, e.g. 430406788154015744)'
          }, 400);
        }
      }

      const supabase = getSupabaseAdmin(env);
      const walletConfig = await getWalletConfig(env);
      if (isBinance) {
        const binanceRate = walletConfig.usdtInrRate || 115;
        const minInr = (walletConfig.binanceMinDeposit || 1) * binanceRate - 0.5;
        const maxInr = (walletConfig.binanceMaxDeposit || 500) * binanceRate + 0.5;
        if (amount < minInr || amount > maxInr) {
          return jsonResponse({
            success: false,
            error: `Deposit amount must be between ${walletConfig.binanceMinDeposit} and ${walletConfig.binanceMaxDeposit} USDT (≈ ₹${Math.round((walletConfig.binanceMinDeposit || 1) * binanceRate)} - ₹${Math.round((walletConfig.binanceMaxDeposit || 500) * binanceRate).toLocaleString('en-IN')})`
          }, 400);
        }
      } else if (amount < walletConfig.minDeposit || amount > walletConfig.maxDeposit) {
        return jsonResponse({ success: false, error: `Deposit amount must be between ₹${walletConfig.minDeposit} and ₹${walletConfig.maxDeposit.toLocaleString('en-IN')}` }, 400);
      }

      const { data: duplicateUtr } = await supabase
        .from('payment_requests')
        .select('id')
        .or(`transaction_id.ilike.${utr},gateway_payment_id.ilike.${utr}`)
        .maybeSingle();
      if (duplicateUtr) return jsonResponse({ success: false, error: 'This UTR / reference number has already been submitted' }, 409);
      let data: any = null;

      // Try inserting with modern column names
      const modernInsert = await supabase
        .from('payment_requests')
        .insert({
          user_id: auth.userId,
          amount,
          transaction_id: utr || null,
          payment_method: cleanPaymentMethod,
          screenshot_url: screenshotUrl,
          status: 'pending',
        })
        .select()
        .single();

      if (modernInsert.error) {
        // Fallback for legacy database schema with amount_inr and gateway_payment_id
        const legacyInsert = await supabase
          .from('payment_requests')
          .insert({
            user_id: auth.userId,
            amount_inr: amount,
            gateway_payment_id: utr || null,
            gateway: cleanPaymentMethod,
            status: 'created',
          })
          .select()
          .single();

        if (legacyInsert.error) {
          console.error('Payment request insert error:', modernInsert.error, legacyInsert.error);
          throw modernInsert.error || legacyInsert.error;
        }
        data = legacyInsert.data;
      } else {
        data = modernInsert.data;
      }

      // Asynchronously send Telegram notification to Admin
      if (utr) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', auth.userId)
            .maybeSingle();

          await notifyPaymentApprovalRequest({
            requestId: data?.id || 'N/A',
            amount,
            utr,
            userId: auth.userId,
            userEmail: profile?.email || auth.email || 'Unknown',
            userName: profile?.full_name || undefined,
            createdAt: data?.created_at,
            origin: url.origin,
            paymentMethod: cleanPaymentMethod,
          }, env);
        } catch (tgErr) {
          console.error('Failed to dispatch telegram payment notification:', tgErr);
        }
      }

      const normalized = {
        ...data,
        amount,
        amount_inr: amount,
        transaction_id: utr,
        gateway_payment_id: utr,
        payment_method: cleanPaymentMethod,
        gateway: cleanPaymentMethod,
        status: data?.status === 'created' ? 'pending' : (data?.status || 'pending'),
        message: `${cleanPaymentMethod === 'binance' ? 'Binance Pay' : 'UPI'} deposit request of ₹${amount} submitted! Admin will verify and credit your wallet.`,
      };

      return jsonResponse({ success: true, data: normalized });
    }

    if (path === '/api/wallet/payment-requests' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const supabase = getSupabaseAdmin(env);
      const { data, error } = await supabase
        .from('payment_requests')
        .select('*')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const normalized = (data || []).map((req: any) => ({
        ...req,
        amount: parseFloat(req.amount ?? req.amount_inr ?? 0),
        amount_inr: parseFloat(req.amount_inr ?? req.amount ?? 0),
        transaction_id: req.transaction_id || req.gateway_payment_id || '',
        gateway_payment_id: req.gateway_payment_id || req.transaction_id || '',
        payment_method: req.payment_method || req.gateway || 'upi',
        gateway: req.gateway || req.payment_method || 'upi',
        status: req.status === 'created' ? 'pending' : (req.status === 'paid' ? 'approved' : (req.status === 'failed' ? 'rejected' : req.status)),
      }));

      return jsonResponse({ success: true, data: normalized });
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

      const [{ data, count, error: ordersError }, { data: summary, error: summaryError }] = await Promise.all([
        query.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
        supabase.rpc('user_order_metrics', { p_user_id: auth.userId }),
      ]);
      if (ordersError) throw ordersError;
      if (summaryError) throw summaryError;

      const orders = data || [];
      const orderIds = orders.map((order: any) => order.id);
      let events: any[] = [];
      if (orderIds.length) {
        const eventResult = await supabase.from('order_events').select('*').in('order_id', orderIds).eq('user_id', auth.userId).order('created_at', { ascending: true });
        if (eventResult.error) throw eventResult.error;
        events = eventResult.data || [];
      }

      return jsonResponse({
        success: true,
        data: {
          orders: orders.map((order: any) => ({ ...order, events: events.filter((event: any) => event.order_id === order.id) })),
          total: count || 0,
          summary: summary || {},
        },
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

      const cf = (request as any).cf || {};
      const clientIp = request.headers.get('cf-connecting-ip') || 
                       request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                       '127.0.0.1';
      const clientIsp = cf.asOrganization || (cf.asn ? `AS${cf.asn}` : undefined);
      const userAgent = request.headers.get('user-agent') || undefined;

      const result = await attributeReferral(auth.userId, referralCode, { ip: clientIp, isp: clientIsp, userAgent }, env);
      return jsonResponse(result);
    }

    if (path === '/api/referrals/claim' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { referralCode } = body;
      if (!referralCode) return jsonResponse({ success: false, error: 'Referral code is required' }, 400);

      const cf = (request as any).cf || {};
      const clientIp = request.headers.get('cf-connecting-ip') || 
                       request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                       '127.0.0.1';
      const clientIsp = cf.asOrganization || (cf.asn ? `AS${cf.asn}` : undefined);
      const userAgent = request.headers.get('user-agent') || undefined;

      const result = await attributeReferral(auth.userId, referralCode, { ip: clientIp, isp: clientIsp, userAgent }, env);
      if (!result.success) return jsonResponse({ success: false, error: (result as any).message || 'Failed to link referral' }, 400);
      return jsonResponse({ success: true, data: { attributed: true }, message: (result as any).message });
    }

    // ─── Telegram Bot Webhook & One-Click Actions ───
    if (path === '/api/telegram/webhook' && (method === 'POST' || method === 'GET')) {
      if (method === 'GET') {
        return jsonResponse({ ok: true, status: 'Telegram webhook active' });
      }

      try {
        const config = await getTelegramConfig(env);
        const suppliedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
        const expectedSecret = await getTelegramWebhookSecret(config.botToken);
        if (!expectedSecret || suppliedSecret !== expectedSecret) {
          return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
        }
        const update = await request.json().catch(() => ({}));
        const callbackQuery = update?.callback_query;

        if (callbackQuery) {
          const callbackId = callbackQuery.id;
          const fromId = String(callbackQuery.from?.id || '');
          const chatId = String(callbackQuery.message?.chat?.id || fromId);
          const messageId = callbackQuery.message?.message_id;
          const data = String(callbackQuery.data || '');

          // Verify that the person clicking is the configured admin
          const configuredAdmin = String(config.adminChatId || '').trim();
          if (configuredAdmin && configuredAdmin !== chatId.trim() && configuredAdmin !== fromId.trim()) {
            await answerCallbackQuery(callbackId, '⚠️ Unauthorized: Only admin can approve or reject deposits', true, config.botToken);
            return jsonResponse({ ok: true });
          }

          if (data.startsWith('approve_')) {
            const requestId = data.replace(/^approve_/, '');
            try {
              await approvePaymentRequest(requestId, `telegram:${fromId}`, env);
              await answerCallbackQuery(callbackId, '✅ Deposit approved & credited successfully!', false, config.botToken);

              if (messageId && chatId && config.botToken) {
                const oldText = callbackQuery.message?.text || 'UPI Deposit Request';
                const updatedText = `${oldText}\n\n━━━━━━━━━━━━━━━\n✅ <b>STATUS: APPROVED & CREDITED</b>\n🕒 <i>Processed via Telegram at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;
                await editTelegramMessageText(chatId, messageId, updatedText, config.botToken);
              }
            } catch (appErr: any) {
              const msg = appErr.message?.includes('already been approved')
                ? 'ℹ️ Already approved and credited!'
                : `⚠️ ${appErr.message || 'Approval failed'}`;
              await answerCallbackQuery(callbackId, msg, true, config.botToken);
            }
          } else if (data.startsWith('reject_')) {
            const requestId = data.replace(/^reject_/, '');
            try {
              await rejectPaymentRequest(requestId, 'Rejected by Admin via Telegram Bot', env);
              await answerCallbackQuery(callbackId, '❌ Deposit request rejected', false, config.botToken);

              if (messageId && chatId && config.botToken) {
                const oldText = callbackQuery.message?.text || 'UPI Deposit Request';
                const updatedText = `${oldText}\n\n━━━━━━━━━━━━━━━\n❌ <b>STATUS: REJECTED</b>\n🕒 <i>Rejected via Telegram at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</i>`;
                await editTelegramMessageText(chatId, messageId, updatedText, config.botToken);
              }
            } catch (rejErr: any) {
              await answerCallbackQuery(callbackId, `⚠️ ${rejErr.message || 'Rejection failed'}`, true, config.botToken);
            }
          }
        }

        return jsonResponse({ ok: true });
      } catch (err: any) {
        console.error('Error handling Telegram webhook:', err);
        return jsonResponse({ ok: true });
      }
    }

    if (path === '/api/telegram/action' && method === 'GET') {
      const action = url.searchParams.get('action');
      const id = url.searchParams.get('id');
      const token = url.searchParams.get('token');

      const config = await getTelegramConfig(env);
      if (!id || !token || !action || !(await verifyActionToken(id, token, config.botToken))) {
        return new Response(
          renderActionPageHtml({
            success: false,
            title: 'Unauthorized or Expired Link',
            message: 'This action token is invalid or has expired. Please use the Telegram bot button or Admin Dashboard.',
          }),
          { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }

      try {
        if (action === 'approve') {
          await approvePaymentRequest(id, 'telegram-action-link', env);
          return new Response(
            renderActionPageHtml({
              success: true,
              title: 'Deposit Approved & Credited! ✅',
              message: `Payment request <b>${id}</b> has been approved. The user's wallet has been credited successfully.`,
            }),
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        } else if (action === 'reject') {
          await rejectPaymentRequest(id, 'Rejected via one-click Telegram action', env);
          return new Response(
            renderActionPageHtml({
              success: true,
              isReject: true,
              title: 'Deposit Rejected ❌',
              message: `Payment request <b>${id}</b> was rejected and marked as declined.`,
            }),
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        } else {
          return new Response(
            renderActionPageHtml({
              success: false,
              title: 'Unknown Action',
              message: `Action "${action}" is not supported.`,
            }),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      } catch (err: any) {
        const isAlreadyApproved = err.message?.includes('already been approved');
        return new Response(
          renderActionPageHtml({
            success: isAlreadyApproved,
            title: isAlreadyApproved ? 'Already Approved ✅' : 'Action Failed ⚠️',
            message: isAlreadyApproved
              ? `This payment request has already been approved and credited to the user's wallet.`
              : err.message || 'An unexpected error occurred while processing this request.',
          }),
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    }

    // ─── User Session & Security Compliance (IP, ISP, Telemetry) ───
    if (path === '/api/auth/record-session' && method === 'POST') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const cf = (request as any).cf || {};
      const ip = request.headers.get('cf-connecting-ip') || 
                 request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                 '127.0.0.1';
      const isp = cf.asOrganization || (cf.asn ? `AS${cf.asn}` : 'Unknown Provider');
      const country = cf.country || null;
      const region = cf.region || null;
      const city = cf.city || null;
      const asn = cf.asn ? parseInt(cf.asn, 10) : null;
      const userAgent = request.headers.get('user-agent') || 'Unknown Client';

      const body = await request.json().catch(() => ({}));
      const rawEvent = String(body.event || 'login').toLowerCase();
      const eventType = ['signup', 'oauth_login', 'password_reset', 'session_refresh'].includes(rawEvent)
        ? rawEvent
        : 'login';

      const supabase = getSupabaseAdmin(env);

      // 1. Log immutable audit entry for compliance & forensic history
      try {
        await supabase.from('user_security_logs').insert({
          user_id: auth.userId,
          event_type: eventType,
          ip_address: ip,
          isp,
          asn,
          country,
          region,
          city,
          user_agent: userAgent,
        });
      } catch (e: any) {
        console.warn('Failed to insert security log:', e);
      }

      // 2. Update profiles table with latest active network & initial signup telemetry
      const updatePayload: Record<string, any> = {
        last_login_ip: ip,
        last_login_isp: isp,
        last_login_country: country,
        last_login_city: city,
        last_login_at: new Date().toISOString(),
      };

      if (eventType === 'signup') {
        updatePayload.signup_ip = ip;
        updatePayload.signup_isp = isp;
        updatePayload.signup_country = country;
        updatePayload.signup_city = city;
      }

      try {
        await supabase.from('profiles').update(updatePayload).eq('id', auth.userId);
      } catch (e: any) {
        console.warn('Failed to update profile IP:', e);
      }

      return jsonResponse({
        success: true,
        data: {
          ip,
          isp,
          country,
          city,
          region,
          asn,
          event: eventType,
        }
      });
    }

    if (path === '/api/auth/login-history' && method === 'GET') {
      const auth = await authenticateUser(request, env);
      if (!auth) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

      const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100);
      const supabase = getSupabaseAdmin(env);

      const { data, error } = await supabase
        .from('user_security_logs')
        .select('id, event_type, ip_address, isp, asn, country, region, city, user_agent, created_at')
        .eq('user_id', auth.userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Also get current request IP & ISP so user can see "Current Session"
      const cf = (request as any).cf || {};
      const currentIp = request.headers.get('cf-connecting-ip') || 
                        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                        '127.0.0.1';
      const currentIsp = cf.asOrganization || (cf.asn ? `AS${cf.asn}` : 'Current Provider');

      return jsonResponse({
        success: true,
        data: {
          current: {
            ip: currentIp,
            isp: currentIsp,
            country: cf.country || null,
            city: cf.city || null,
          },
          history: data || [],
        },
      });
    }

    // ─── Admin Routes ───
    if (path.startsWith('/api/admin/')) {
      const auth = await authenticateUser(request, env);
      if (!auth || (auth.role !== 'admin' && auth.role !== 'superadmin')) {
        return jsonResponse({ success: false, error: 'Admin access required' }, 403);
      }

      if (path === '/api/admin/dashboard') {
        const stats = await getAdminDashboard(env);
        return jsonResponse({ success: true, data: stats });
      }

      if (path === '/api/admin/operational-alerts/clear' && method === 'POST') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can clear operational alert history.' }, 403);
        const { error } = await getSupabaseAdmin(env).from('operational_alerts').delete().not('alert_key', 'is', null);
        if (error) throw error;
        await logAdminAction(auth.userId, 'operations.alert_history_cleared', 'system', null, {}, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, message: 'Operational alert history cleared.' });
      }

      if (path === '/api/admin/audit-logs' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const action = url.searchParams.get('action') || '';
        const logs = await getAdminAuditLogs(limit, offset, action, env);
        return jsonResponse({ success: true, data: logs });
      }

      if (path === '/api/admin/support/tickets' && method === 'GET') {
        return jsonResponse({ success: true, data: await getAdminSupportTickets(url.searchParams.get('status') || 'all', env) });
      }

      if (path === '/api/admin/data-deletion-requests' && method === 'GET') {
        const status = url.searchParams.get('status') || 'pending';
        let query = getSupabaseAdmin(env).from('data_deletion_requests').select('*,profiles:user_id(email,full_name,wallet_balance,is_banned)').order('requested_at', { ascending: true }).limit(200);
        if (status !== 'all') query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw error;
        return jsonResponse({ success: true, data: data || [] });
      }

      const deletionDecisionMatch = path.match(/^\/api\/admin\/data-deletion-requests\/([^\/]+)$/);
      if (deletionDecisionMatch && method === 'POST') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can process data erasure requests.' }, 403);
        const body = await request.json().catch(() => ({}));
        const decision = String(body.decision || '');
        const notes = String(body.notes || '').trim().slice(0, 2000);
        if (!['approve', 'reject'].includes(decision)) return jsonResponse({ success: false, error: 'Decision must be approve or reject.' }, 400);
        const supabase = getSupabaseAdmin(env);
        const { data: deletionRequest, error: requestError } = await supabase.from('data_deletion_requests').select('id,user_id,status').eq('id', deletionDecisionMatch[1]).maybeSingle();
        if (requestError) throw requestError;
        if (!deletionRequest) return jsonResponse({ success: false, error: 'Deletion request not found.' }, 404);
        if (deletionRequest.status !== 'pending') return jsonResponse({ success: false, error: 'This deletion request has already been processed.' }, 409);

        if (decision === 'reject') {
          const { error } = await supabase.from('data_deletion_requests').update({ status: 'rejected', admin_notes: notes || 'Request rejected after review.', processed_by: auth.userId, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', deletionRequest.id).eq('status', 'pending');
          if (error) throw error;
          await logAdminAction(auth.userId, 'privacy.erasure_rejected', 'user', deletionRequest.user_id, { requestId: deletionRequest.id, notes }, request.headers.get('cf-connecting-ip'), env);
          return jsonResponse({ success: true, data: { status: 'rejected' } });
        }

        await supabase.from('profiles').update({ is_banned: true, updated_at: new Date().toISOString() }).eq('id', deletionRequest.user_id);
        const { data: result, error: eraseError } = await supabase.rpc('erase_user_personal_data', { p_user_id: deletionRequest.user_id, p_actor_id: auth.userId, p_request_id: deletionRequest.id });
        if (eraseError) throw eraseError;
        const authDeletion = await supabase.auth.admin.deleteUser(deletionRequest.user_id);
        if (authDeletion.error) throw new Error(`Personal data was anonymized, but authentication deletion needs retry: ${authDeletion.error.message}`);
        await logAdminAction(auth.userId, 'privacy.erasure_completed', 'user', deletionRequest.user_id, { requestId: deletionRequest.id, financialRecordsRetained: true }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, data: result });
      }

      const supportUpdateMatch = path.match(/^\/api\/admin\/support\/tickets\/([^\/]+)$/);
      if (supportUpdateMatch && method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        const ticket = await updateSupportTicket(supportUpdateMatch[1], auth.userId, body, env);
        await logAdminAction(auth.userId, 'support.update', 'support_ticket', ticket.id, { status: ticket.status, priority: ticket.priority, replied: Boolean(ticket.public_reply) }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, data: ticket });
      }

      const supportReplyMatch = path.match(/^\/api\/admin\/support\/tickets\/([^\/]+)\/reply$/);
      if (supportReplyMatch && method === 'POST') {
        const ticket = await replyToSupportTicket(supportReplyMatch[1], auth.userId, await request.json().catch(() => ({})), true, env);
        await logAdminAction(auth.userId, 'support.reply', 'support_ticket', ticket.id, { replied: true }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, data: ticket });
      }

      if (path === '/api/admin/reconcile' && method === 'POST') {
        const result = await reconcileExpiredOrders(env, 200);
        await logAdminAction(auth.userId, 'orders.reconcile', 'system', null, result, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, data: result });
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

      // GET /api/admin/users/:id/export — Complete User Data Dossier Export
      const userExportMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/export$/);
      if (userExportMatch && method === 'GET') {
        const targetId = userExportMatch[1];
        const supabase = getSupabaseAdmin(env);
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, wallet_balance, is_banned, referral_code, created_at, updated_at, last_login_ip, last_login_isp, last_login_at')
          .eq('id', targetId)
          .maybeSingle();

        if (profileErr || !profile) return jsonResponse({ success: false, error: 'User not found' }, 404);

        let authMeta: any = {};
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(targetId);
          if (authUser?.user) {
            authMeta = {
              email: authUser.user.email || profile.email,
              phone: authUser.user.phone || null,
              confirmed_at: authUser.user.email_confirmed_at || null,
              last_sign_in_at: authUser.user.last_sign_in_at || null,
              user_metadata: authUser.user.user_metadata || {},
              app_metadata: authUser.user.app_metadata || {},
            };
          }
        } catch {}

        const [securityLogs, orders, transactions, paymentRequests, referralsGiven, referralsReceived, supportTickets, deletionRequests] = await Promise.all([
          supabase.from('user_security_logs').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(200),
          supabase.from('orders').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(200),
          supabase.from('wallet_transactions').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(200),
          supabase.from('payment_requests').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(100),
          supabase.from('referrals').select('*').eq('referrer_id', targetId).order('created_at', { ascending: false }).limit(100),
          supabase.from('referrals').select('*').eq('referee_id', targetId).order('created_at', { ascending: false }).limit(10),
          supabase.from('support_tickets').select('*').eq('user_id', targetId).order('created_at', { ascending: false }).limit(100),
          supabase.from('data_deletion_requests').select('*').eq('user_id', targetId).order('requested_at', { ascending: false }).limit(10),
        ]);

        return jsonResponse({
          success: true,
          data: {
            exportedAt: new Date().toISOString(),
            exportedBy: auth.email || auth.userId,
            profile: {
              ...profile,
              auth: authMeta,
            },
            securityLogs: securityLogs.data || [],
            orders: orders.data || [],
            walletTransactions: transactions.data || [],
            paymentRequests: paymentRequests.data || [],
            referrals: {
              given: referralsGiven.data || [],
              received: referralsReceived.data || [],
            },
            supportTickets: supportTickets.data || [],
            deletionRequests: deletionRequests.data || [],
          },
        });
      }

      const userCreditMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/credit$/);
      if (userCreditMatch && method === 'POST') {
        const targetUserId = userCreditMatch[1];
        const body = await request.json().catch(() => ({}));
        const amount = parseFloat(body.amount);
        // The funding source is mandatory: it decides whether this counts as
        // money really collected or as free balance handed out by an admin.
        // Legacy clients sent the reason as `description`; accept both keys.
        const note = body.note ?? body.description;
        const fundingSource = String(body.fundingSource || '').trim();
        const credit = await creditUserBalance(targetUserId, amount, note, fundingSource, env);
        await logAdminAction(
          auth.userId,
          credit.ledgerType === 'admin_grant' ? 'wallet.grant_free_funds' : 'wallet.credit_manual_funding',
          'user',
          targetUserId,
          { amount, reason: note, fundingSource: credit.fundingSource, ledgerType: credit.ledgerType },
          request.headers.get('cf-connecting-ip'),
          env,
        );
        return jsonResponse({ success: true, data: { fundingSource: credit.fundingSource, ledgerType: credit.ledgerType, balance: credit.balance } });
      }

      // GET /api/admin/funding-summary — canonical balance-sheet funding totals.
      if (path === '/api/admin/funding-summary' && method === 'GET') {
        const summary = await getFundingSummary(env);
        return jsonResponse({ success: true, data: summary });
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
        await logAdminAction(auth.userId, body.banned ? 'user.ban' : 'user.unban', 'user', targetUserId, { reason: body.reason || null }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, message: body.banned ? 'User banned' : 'User unbanned' });
      }

      // POST /api/admin/users/:id/purge
      const userPurgeMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/purge$/);
      if (userPurgeMatch && method === 'POST') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can erase user data.' }, 403);
        const targetUserId = userPurgeMatch[1];
        const body = await request.json().catch(() => ({}));
        const purgeMode = String(body.mode || 'history');
        if (!['complete', 'history'].includes(purgeMode)) return jsonResponse({ success: false, error: 'Purge mode must be complete or history.' }, 400);
        const supabase = getSupabaseAdmin(env);
        if (targetUserId === auth.userId) return jsonResponse({ success: false, error: 'You cannot delete your own account.' }, 400);

        const { data: profile } = await supabase.from('profiles').select('id,email,role,is_banned').eq('id', targetUserId).maybeSingle();
        if (!profile) return jsonResponse({ success: false, error: 'User not found' }, 404);
        if (profile.role === 'admin' || profile.role === 'superadmin') return jsonResponse({ success: false, error: 'Cannot delete an administrator account.' }, 400);
        if (!profile.is_banned) return jsonResponse({ success: false, error: 'User must be banned before they can be deleted. Please ban the user first.' }, 400);

        const { data: erased, error: eraseError } = await supabase.rpc('purge_user_account', { p_user_id: targetUserId, p_actor_id: auth.userId, p_mode: purgeMode });
        if (eraseError) throw eraseError;
        await logAdminAction(auth.userId, 'privacy.user_purged', purgeMode === 'history' ? 'user' : 'system', purgeMode === 'history' ? targetUserId : null, { source: 'admin-user-management', mode: purgeMode, historyRetained: purgeMode === 'history' }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, data: erased, message: purgeMode === 'history' ? 'User data was purged and a non-personal history summary was retained.' : 'User data was purged completely.' });
      }

      if (path === '/api/admin/user-purge-history' && method === 'GET') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can view purge history.' }, 403);
        try {
          const { data, error } = await getSupabaseAdmin(env).from('user_purge_history').select('id,user_reference,user_email_hash,purge_mode,orders_count,wallet_transactions_count,payment_requests_count,total_order_sales,total_deposits,purged_at').order('purged_at', { ascending: false }).limit(200);
          if (error) throw error;
          return jsonResponse({ success: true, data: data || [] });
        } catch (error: any) {
          console.error('Admin purge history error:', error);
          return jsonResponse({ success: false, error: 'Failed to load purge history.' }, 500);
        }
      }

      // POST /api/admin/users/bulk-ban
      if (path === '/api/admin/users/bulk-ban' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { userIds, banned } = body;
        if (!Array.isArray(userIds) || userIds.length === 0) return jsonResponse({ success: false, error: 'No users selected.' }, 400);
        const targets = userIds.filter((uid: string) => uid !== auth.userId);
        if (targets.length === 0) return jsonResponse({ success: false, error: 'Cannot ban your own account.' }, 400);
        const supabase = getSupabaseAdmin(env);
        const { error } = await supabase.from('profiles').update({ is_banned: !!banned, updated_at: new Date().toISOString() }).in('id', targets).neq('role', 'admin').neq('role', 'superadmin');
        if (error) throw error;
        return jsonResponse({ success: true, message: `${targets.length} user(s) ${banned ? 'banned' : 'unbanned'} successfully.` });
      }

      // POST /api/admin/users/bulk-delete
      if (path === '/api/admin/users/bulk-purge' && method === 'POST') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can erase user data.' }, 403);
        const body = await request.json().catch(() => ({}));
        const { userIds } = body;
        const purgeMode = String(body.mode || 'history');
        if (!['complete', 'history'].includes(purgeMode)) return jsonResponse({ success: false, error: 'Purge mode must be complete or history.' }, 400);
        if (!Array.isArray(userIds) || userIds.length === 0) return jsonResponse({ success: false, error: 'No users selected.' }, 400);
        const targets = userIds.filter((uid: string) => uid !== auth.userId);
        const supabase = getSupabaseAdmin(env);
        const { data: profiles } = await supabase.from('profiles').select('id,email,role,is_banned').in('id', targets);
        if (!profiles || profiles.length === 0) return jsonResponse({ success: false, error: 'No matching users found.' }, 404);
        const unbanned = profiles.filter((p: any) => !p.is_banned);
        if (unbanned.length > 0) return jsonResponse({ success: false, error: `Cannot delete unbanned users (${unbanned.length} unbanned). All selected users must be banned first.` }, 400);
        const eligible = profiles.filter((p: any) => p.role !== 'admin' && p.role !== 'superadmin' && p.is_banned).map((p: any) => p.id);
        if (eligible.length === 0) return jsonResponse({ success: false, error: 'No eligible banned users to delete.' }, 400);
        const results = [];
        for (const uid of eligible) {
          const { error: eraseError } = await supabase.rpc('purge_user_account', { p_user_id: uid, p_actor_id: auth.userId, p_mode: purgeMode });
          if (eraseError) throw eraseError;
          results.push(uid);
        }
        await logAdminAction(auth.userId, 'privacy.bulk_user_purge', 'system', null, { count: results.length, userIds: purgeMode === 'history' ? results : undefined, mode: purgeMode, historyRetained: purgeMode === 'history' }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, message: `${results.length} banned user account(s) purged (${purgeMode} mode).` });
      }

      // POST /api/admin/users/:id/promote
      const userPromoteMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/promote$/);
      if (userPromoteMatch && method === 'POST') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can promote users to admin.' }, 403);
        const targetUserId = userPromoteMatch[1];
        if (targetUserId === auth.userId) return jsonResponse({ success: false, error: 'Cannot promote yourself.' }, 400);
        
        const supabase = getSupabaseAdmin(env);
        const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', targetUserId).maybeSingle();
        if (!profile) return jsonResponse({ success: false, error: 'User not found' }, 404);
        if (profile.role === 'admin' || profile.role === 'superadmin') return jsonResponse({ success: false, error: 'User is already an admin or superadmin.' }, 400);
        
        await supabase.from('profiles').update({ role: 'admin' }).eq('id', targetUserId);
        await logAdminAction(auth.userId, 'user.promote', 'user', targetUserId, { role: 'admin' }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, message: 'User promoted to admin' });
      }

      // POST /api/admin/users/:id/demote
      const userDemoteMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/demote$/);
      if (userDemoteMatch && method === 'POST') {
        if (auth.role !== 'superadmin') return jsonResponse({ success: false, error: 'Only Super Admin can demote admins.' }, 403);
        const targetUserId = userDemoteMatch[1];
        if (targetUserId === auth.userId) return jsonResponse({ success: false, error: 'Cannot demote yourself.' }, 400);
        const supabase = getSupabaseAdmin(env);
        const { data: profile } = await supabase.from('profiles').select('id,role').eq('id', targetUserId).maybeSingle();
        if (!profile) return jsonResponse({ success: false, error: 'User not found' }, 404);
        if (profile.role === 'superadmin') return jsonResponse({ success: false, error: 'Cannot demote a superadmin.' }, 400);

        await supabase.from('profiles').update({ role: 'user' }).eq('id', targetUserId);
        await logAdminAction(auth.userId, 'user.demote', 'user', targetUserId, { role: 'user' }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, message: 'User demoted to standard user' });
      }

      if (path === '/api/admin/orders' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10);
        const offset = parseInt(url.searchParams.get('offset') || '0', 10);
        const status = url.searchParams.get('status') || 'all';
        const orders = await getAdminOrders(limit, offset, status, env);
        return jsonResponse({ success: true, data: orders });
      }

      if (path === '/api/admin/pricing' && method === 'GET') {
        const rules = await getAdminPricing(env);
        return jsonResponse({ success: true, data: rules });
      }

      if (path === '/api/admin/pricing' && method === 'POST') {
        const rule = await request.json();
        const created = await createPricingRule(rule, env);
        await logAdminAction(auth.userId, 'pricing.create', 'pricing_rule', created.id || null, { scope: rule.scope || null }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, data: created });
      }

      const priceDeleteMatch = path.match(/^\/api\/admin\/pricing\/([^\/]+)$/);
      if (priceDeleteMatch && method === 'DELETE') {
        await deletePricingRule(priceDeleteMatch[1], env);
        await logAdminAction(auth.userId, 'pricing.delete', 'pricing_rule', priceDeleteMatch[1], {}, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true });
      }

      if (path === '/api/admin/settings' && method === 'GET') {
        const settings = await getAdminSettings(env);
        return jsonResponse({ success: true, data: settings });
      }

      if (path === '/api/admin/settings' && method === 'POST') {
        const body = await request.json();
        const changedSettings = body.settings || body;
        await saveAdminSettings(changedSettings, env);
        await logAdminAction(auth.userId, 'settings.update', 'settings', null, { keys: Object.keys(changedSettings) }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true });
      }
      if (path === '/api/admin/payment-requests' && method === 'GET') {
        const requests = await getPaymentRequests(env);
        return jsonResponse({ success: true, data: requests });
      }

      if (path === '/api/admin/recharges' && method === 'GET') {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const search = url.searchParams.get('search') || '';
        const source = url.searchParams.get('source') || 'all';
        const recharges = await getAdminRecharges(limit, offset, search, source, env);
        return jsonResponse({ success: true, data: recharges });
      }

      const paymentApproveMatch = path.match(/^\/api\/admin\/payment-requests\/([^\/]+)\/approve$/);
      if (paymentApproveMatch && method === 'POST') {
        await approvePaymentRequest(paymentApproveMatch[1], auth.userId, env);
        await logAdminAction(auth.userId, 'payment.approve', 'payment_request', paymentApproveMatch[1], {}, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true });
      }

      const paymentRejectMatch = path.match(/^\/api\/admin\/payment-requests\/([^\/]+)\/reject$/);
      if (paymentRejectMatch && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        await rejectPaymentRequest(paymentRejectMatch[1], body.reason, env);
        await logAdminAction(auth.userId, 'payment.reject', 'payment_request', paymentRejectMatch[1], { reason: body.reason || null }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true });
      }

      // ─── Admin Catalog ───
      if (path === '/api/admin/catalog' && method === 'GET') {
        const tiger = new TigerSmsClient(env);
        const [servicesList, countriesList, { disabledServices, disabledCountries, featuredServices, featuredCountries }] = await Promise.all([
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
          featured: featuredServices.includes(s.code.toLowerCase()),
        }));

        const countries = countriesList.map((c: any) => ({
          id: c.id,
          name: c.eng,
          enabled: !disabledCountriesSet.has(Number(c.id)),
          featured: featuredCountries.includes(Number(c.id)),
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
        await logAdminAction(auth.userId, 'catalog.service_visibility', 'service', String(code), { enabled }, request.headers.get('cf-connecting-ip'), env);
        return jsonResponse({ success: true, message: `Service ${code.toUpperCase()} is now ${enabled ? 'enabled' : 'disabled'}`, data: updated });
      }

      if (path === '/api/admin/catalog/service/featured' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { code, featured } = body;
        if (!code || typeof featured !== 'boolean') {
          return jsonResponse({ success: false, error: 'Invalid code or featured status' }, 400);
        }
        const updated = await setFeaturedService(code, featured, env);
        return jsonResponse({ success: true, data: updated });
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

      if (path === '/api/admin/catalog/country/featured' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { id, featured } = body;
        if (!Number.isFinite(Number(id)) || typeof featured !== 'boolean') {
          return jsonResponse({ success: false, error: 'Invalid id or featured status' }, 400);
        }
        const updated = await setFeaturedCountry(Number(id), featured, env);
        return jsonResponse({ success: true, data: updated });
      }

      if (path === '/api/admin/catalog/batch' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { action } = body;

        const tiger = new TigerSmsClient(env);
        const [allServices, allCountries] = await Promise.all([
          tiger.getServicesList().catch(() => []),
          tiger.getCountries().catch(() => []),
        ]);

        if (action === 'enable_all_services') {
          await setDisabledCatalog([], undefined, env);
        } else if (action === 'disable_all_services') {
          await setDisabledCatalog((allServices as any[]).map((s) => s.code), undefined, env);
        } else if (action === 'enable_all_countries') {
          await setDisabledCatalog(undefined, [], env);
        } else if (action === 'disable_all_countries') {
          await setDisabledCatalog(undefined, (allCountries as any[]).map((c) => c.id), env);
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
