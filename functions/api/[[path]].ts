import { getSupabaseAdmin, authenticateUser } from '../lib/supabase';
import { getServices, getCountries, getServiceCountries, getDisabledCatalog, setServiceActiveStatus, setCountryActiveStatus, setDisabledCatalog, setFeaturedService } from '../lib/catalog';
import { buyNumber, checkOrderStatus, cancelOrder, completeOrder, retryOrder } from '../lib/order';
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
  answerCallbackQuery,
  editTelegramMessageText,
} from '../lib/telegram';
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
    if (path === '/api/services' && method === 'GET') {
      const featuredOnly = url.searchParams.get('featured') === 'true';
      const services = await getServices(featuredOnly, env);
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
      const { service, country } = body;
      if (!service || country === undefined) {
        return jsonResponse({ success: false, error: 'service and country required' }, 400);
      }

      try {
        const result = await buyNumber(auth.userId, service, parseInt(country, 10), env);
        return jsonResponse({ success: true, data: result });
      } catch (buyErr: any) {
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
            provider: err.code === 'WAIT_BEFORE_CANCEL' ? 'otpwala' : 'tiger_sms',
          }, ['WAIT_BEFORE_CANCEL', 'EARLY_CANCEL_DENIED'].includes(err.code) ? 409 : 502);
        }
        throw err;
      }
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
      const amount = parseFloat(body.amount ?? body.amount_inr ?? 0);
      const utr = String(body.utr || body.transactionId || body.gateway_payment_id || '').trim();
      const paymentMethod = String(body.method || body.paymentMethod || body.gateway || 'upi').trim();
      const screenshotUrl = body.screenshotUrl || body.screenshot_url || null;

      if (!amount || isNaN(amount) || amount <= 0) {
        return jsonResponse({ success: false, error: 'Invalid deposit amount' }, 400);
      }

      const supabase = getSupabaseAdmin(env);
      let data: any = null;

      // Try inserting with modern column names
      const modernInsert = await supabase
        .from('payment_requests')
        .insert({
          user_id: auth.userId,
          amount,
          transaction_id: utr || null,
          payment_method: paymentMethod || 'upi',
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
            gateway: paymentMethod || 'upi',
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
        payment_method: paymentMethod,
        gateway: paymentMethod,
        status: data?.status === 'created' ? 'pending' : (data?.status || 'pending'),
        message: `UPI deposit request of ₹${amount} submitted! Admin will verify and credit your wallet.`,
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

    // ─── Telegram Bot Webhook & One-Click Actions ───
    if (path === '/api/telegram/webhook' && (method === 'POST' || method === 'GET')) {
      if (method === 'GET') {
        return jsonResponse({ ok: true, status: 'Telegram webhook active' });
      }

      try {
        const update = await request.json().catch(() => ({}));
        const callbackQuery = update?.callback_query;

        if (callbackQuery) {
          const config = await getTelegramConfig(env);
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
              await approvePaymentRequest(requestId, env);
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
      if (!id || !token || !action || !verifyActionToken(id, token, config.botToken)) {
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
          await approvePaymentRequest(id, env);
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
        const [servicesList, countriesList, { disabledServices, disabledCountries, featuredServices }] = await Promise.all([
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
