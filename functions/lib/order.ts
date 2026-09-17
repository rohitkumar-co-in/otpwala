import { getSupabaseAdmin } from './supabase';
import { TigerSmsClient, TigerSmsError } from './tiger';
import { calculateSellPrice, getPricingSettings } from './pricing';
import { deductBalance, creditBalance } from './wallet';
import { getDisabledCatalog } from './catalog';
import { assertProviderCanFund, assertPurchaseAllowed, classifyExpiredProviderStatus } from './policies';
import { notifyLowProviderBalance } from './telegram';

async function enforcePurchaseLimits(supabase: any, userId: string) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [active, recent, daily] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'waiting'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', tenMinutesAgo),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', dayAgo),
  ]);
  const queryError = active.error || recent.error || daily.error;
  if (queryError) throw new Error('Unable to verify purchase safety limits. Please retry shortly.');
  assertPurchaseAllowed({ active: active.count || 0, recent: recent.count || 0, daily: daily.count || 0 });
}

export async function buyNumber(
  userId: string,
  serviceCode: string,
  countryCode: number,
  env?: any,
  requestedOrderId?: string,
) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);
  const orderId = requestedOrderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOrderId)
    ? requestedOrderId
    : crypto.randomUUID();

  // Reject abusive velocity before contacting or charging the provider.
  await enforcePurchaseLimits(supabase, userId);

  // 1. Verify service/country not disabled
  const { disabledServices, disabledCountries } = await getDisabledCatalog(env);
  if (disabledServices.includes(serviceCode.toLowerCase())) {
    throw new Error('This service is currently unavailable');
  }
  if (disabledCountries.includes(countryCode)) {
    throw new Error('This country is currently unavailable');
  }

  // 2. Fetch pricing from Tiger SMS
  const priceData = await tiger.getPrices(serviceCode, countryCode);
  const countryPrices = priceData[String(countryCode)];
  if (!countryPrices || !countryPrices[serviceCode]) {
    throw new Error('Service not available for this country');
  }
  const sData = countryPrices[serviceCode] as any;
  const costPriceUsd = parseFloat(String(sData.cost ?? sData.price ?? '0'));
  if (isNaN(costPriceUsd) || costPriceUsd <= 0) {
    throw new Error('Service pricing unavailable for this country');
  }

  // Avoid charging the wallet when the upstream account cannot fund the order.
  const providerBalance = parseFloat((await tiger.getBalance()).balance || '0');
  assertProviderCanFund(providerBalance, costPriceUsd);

  // 3. Calculate sell price in INR
  const { rate: fxRate } = await getPricingSettings(env);
  const costPriceInr = Math.round(costPriceUsd * fxRate * 10000) / 10000;
  const sellPriceInr = await calculateSellPrice(costPriceUsd, serviceCode, countryCode, userId, env);

  // 4. Deduct balance from user wallet
  try {
    await deductBalance(userId, sellPriceInr, `Number purchase: ${serviceCode.toUpperCase()}`, env, 'order', orderId, `purchase:${orderId}`);
  } catch (err: any) {
    const error = new Error('Insufficient wallet balance');
    (error as any).code = 'USER_INSUFFICIENT_FUNDS';
    throw error;
  }

  // 5. Purchase from Tiger SMS
  let activationId: string;
  let phoneNumber: string;

  try {
    const result = await tiger.getNumber(serviceCode, countryCode);
    activationId = result.activationId;
    phoneNumber = result.phoneNumber;
  } catch (err: any) {
    // Auto-refund on purchase failure
    await creditBalance(userId, sellPriceInr, `Auto-refund: Purchase failed for ${serviceCode.toUpperCase()}`, 'refund', env, 'order', orderId, `refund:${orderId}`);
    throw err;
  }

  // 6. Save order in Supabase
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min TTL
  // Store Tiger's catalog labels rather than maintaining a separate country ID
  // or service-name mapping that can drift from the provider.
  const [tigerServices, tigerCountries] = await Promise.all([
    tiger.getServicesList().catch(() => []),
    tiger.getCountries().catch(() => []),
  ]);
  const serviceName = tigerServices.find((service: any) => service.code === serviceCode)?.name || serviceCode;
  const countryName = tigerCountries.find((country: any) => Number(country.id) === countryCode)?.eng || String(countryCode);

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      id: orderId,
      user_id: userId,
      activation_id: activationId,
      service_code: serviceCode,
      service_name: serviceName,
      country_code: countryCode,
      country_name: countryName,
      phone_number: phoneNumber,
      cost_price_usd: costPriceUsd,
      cost_price_inr: costPriceInr,
      fx_rate: fxRate,
      sell_price_inr: sellPriceInr,
      price_inr: sellPriceInr,
      status: 'waiting',
      tiger_status: 'STATUS_WAIT_CODE',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (orderError) {
    console.error('Failed to create order record:', orderError);
    try { await tiger.setStatus(activationId, 8); } catch {}
    await creditBalance(userId, sellPriceInr, `Auto-refund: Order recording failed for ${serviceCode.toUpperCase()}`, 'refund', env, 'order', orderId, `refund:${orderId}`);
    throw new Error('Purchase could not be recorded. Your wallet has been refunded.');
  }

  // 7. Update user stats in profiles
  try {
    const { data: prof } = await supabase.from('profiles').select('total_orders, total_spent').eq('id', userId).single();
    if (prof) {
      await supabase.from('profiles').update({
        total_orders: (prof.total_orders || 0) + 1,
        total_spent: parseFloat(((prof.total_spent || 0) + sellPriceInr).toFixed(2)),
        updated_at: new Date().toISOString(),
      }).eq('id', userId);
    }
  } catch (statErr) {
    console.warn('Failed to increment user order stats:', statErr);
  }

  return {
    orderId,
    activationId,
    phoneNumber,
    serviceCode,
    serviceName,
    countryCode,
    countryName,
    priceInr: sellPriceInr,
    sellPriceInr,
    expiresAt,
  };
}

async function findOrder(supabase: any, orderId: string, userId: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
  let query = supabase.from('orders').select('*').eq('user_id', userId);
  query = isUuid ? query.eq('id', orderId) : query.eq('activation_id', orderId);
  const { data } = await query.maybeSingle();
  return data;
}

async function refundOrder(supabase: any, orderId: string, terminalStatus: 'cancelled' | 'expired', reason: string) {
  const { data, error } = await supabase.rpc('refund_order_atomic', {
    p_order_id: orderId,
    p_terminal_status: terminalStatus,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'Order refund failed');
  return data?.[0];
}

export async function checkOrderStatus(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const order = await findOrder(supabase, orderId, userId);

  if (!order) {
    throw new Error('Order not found');
  }

  // If already terminal status, return saved status
  if (['completed', 'cancelled', 'refunded', 'expired'].includes(order.status)) {
    return {
      orderId: order.id,
      status: order.status,
      phoneNumber: order.phone_number,
      smsCode: order.sms_code,
      smsText: order.sms_text,
      serviceCode: order.service_code,
      serviceName: order.service_name,
      countryName: order.country_name,
      priceInr: order.sell_price_inr,
      createdAt: order.created_at,
    };
  }

  // Poll Tiger SMS
  const statusResult = await tiger.getStatus(order.activation_id);

  if (statusResult.status === 'code_received' && statusResult.code) {
    await supabase
      .from('orders')
      .update({
        status: 'code_received',
        sms_code: statusResult.code,
        sms_text: statusResult.text || '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return {
      orderId: order.id,
      status: 'code_received',
      phoneNumber: order.phone_number,
      smsCode: statusResult.code,
      smsText: statusResult.text,
      serviceCode: order.service_code,
      serviceName: order.service_name,
      countryName: order.country_name,
      priceInr: order.sell_price_inr,
      createdAt: order.created_at,
    };
  }

  if (statusResult.status === 'cancelled' && order.status !== 'cancelled') {
    await refundOrder(supabase, order.id, 'cancelled', `Refund: Order cancelled (${order.service_name})`);

    return {
      orderId: order.id,
      status: 'cancelled',
      phoneNumber: order.phone_number,
      serviceCode: order.service_code,
      serviceName: order.service_name,
      countryName: order.country_name,
      priceInr: order.sell_price_inr,
      createdAt: order.created_at,
    };
  }

  const expiryTime = order.expires_at ? new Date(order.expires_at).getTime() : new Date(order.created_at).getTime() + 20 * 60 * 1000;
  if (statusResult.status === 'waiting' && Number.isFinite(expiryTime) && Date.now() >= expiryTime) {
    const tigerStatus = await tiger.setStatus(order.activation_id, 8);
    if (tigerStatus === 'ACCESS_CANCEL') {
      await refundOrder(supabase, order.id, 'expired', `Refund: Order automatically expired (${order.service_name})`);
      return {
        orderId: order.id,
        status: 'expired',
        phoneNumber: order.phone_number,
        serviceCode: order.service_code,
        serviceName: order.service_name,
        countryName: order.country_name,
        priceInr: order.sell_price_inr,
        createdAt: order.created_at,
      };
    }
  }

  return {
    orderId: order.id,
    status: order.status,
    phoneNumber: order.phone_number,
    smsCode: order.sms_code,
    smsText: order.sms_text,
    serviceCode: order.service_code,
    serviceName: order.service_name,
    countryName: order.country_name,
    priceInr: order.sell_price_inr,
    createdAt: order.created_at,
  };
}

export async function cancelOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const order = await findOrder(supabase, orderId, userId);

  if (!order) throw new Error('Order not found');
  if (order.status !== 'waiting') {
    throw new Error('Order cannot be cancelled in its current status');
  }

  const activationAgeMs = Date.now() - new Date(order.created_at).getTime();
  if (!Number.isFinite(activationAgeMs) || activationAgeMs < 120_000) {
    throw new TigerSmsError(
      'WAIT_BEFORE_CANCEL',
      'Please wait 2 minutes for the OTP before cancelling this number.'
    );
  }

  // Tiger is the source of truth. Never refund or change the local status unless
  // it explicitly confirms the cancellation with ACCESS_CANCEL.
  try {
    const tigerStatus = await tiger.setStatus(order.activation_id, 8);
    if (tigerStatus !== 'ACCESS_CANCEL') {
      throw new TigerSmsError(tigerStatus, tigerStatus);
    }
  } catch (err) {
    if (err instanceof TigerSmsError) throw err;
    throw new TigerSmsError('SERVICE_TEMPORARILY_UNAVAILABLE', 'SERVICE_TEMPORARILY_UNAVAILABLE');
  }

  // ACCESS_CANCEL confirms that Tiger accepted the cancellation/refund. Only
  // now is it safe to credit the user's OTPWala wallet.
  await refundOrder(supabase, order.id, 'cancelled', `Refund: Order cancelled by user (${order.service_name})`);

  return { success: true };
}

export async function retryOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const order = await findOrder(supabase, orderId, userId);

  if (!order) throw new Error('Order not found');

  await tiger.setStatus(order.activation_id, 3);
  return { success: true };
}

export async function reconcileExpiredOrders(env?: any, limit = 50) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);
  const now = new Date();
  const legacyCutoff = new Date(now.getTime() - 20 * 60 * 1000);
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'waiting')
    .or(`expires_at.lte.${now.toISOString()},and(expires_at.is.null,created_at.lte.${legacyCutoff.toISOString()})`)
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw error;

  const result: any = { scanned: orders?.length || 0, delivered: 0, refunded: 0, failed: 0 };
  for (const order of orders || []) {
    try {
      const provider = await tiger.getStatus(order.activation_id);
      if (provider.status === 'code_received' && provider.code) {
        await supabase.from('orders').update({
          status: 'code_received', sms_code: provider.code, sms_text: provider.text || '',
          tiger_status: 'STATUS_OK', updated_at: new Date().toISOString(),
        }).eq('id', order.id).eq('status', 'waiting');
        result.delivered++;
        continue;
      }
      const providerOutcome = classifyExpiredProviderStatus(provider.status);
      const isProviderWaiting = providerOutcome === 'cancel_and_refund';
      const isTerminalWithoutOtp = providerOutcome === 'refund';

      if (isProviderWaiting) await tiger.setStatus(order.activation_id, 8);
      if (isProviderWaiting || isTerminalWithoutOtp) {
        await refundOrder(supabase, order.id, 'expired', `Refund: Order automatically expired (${order.service_name})`);
        result.refunded++;
        continue;
      }

      throw new Error(`Unsupported provider status during expiry reconciliation: ${provider.status}`);
    } catch (err: any) {
      result.failed++;
      await supabase.from('orders').update({
        refund_status: 'failed', refund_failure_reason: String(err?.message || err).slice(0, 500), updated_at: new Date().toISOString(),
      }).eq('id', order.id).eq('status', 'waiting');
    }
  }
  try {
    const providerBalance = parseFloat((await tiger.getBalance()).balance || '0');
    const { data: thresholdSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'provider_low_balance_threshold_usd')
      .maybeSingle();
    const configuredThreshold = parseFloat(String(thresholdSetting?.value ?? '').replace(/^"|"$/g, ''));
    const fallbackThreshold = parseFloat(String(env?.PROVIDER_LOW_BALANCE_USD || '5')) || 5;
    const threshold = Math.max(Number.isFinite(configuredThreshold) ? configuredThreshold : fallbackThreshold, 0.01);
    await notifyLowProviderBalance(providerBalance, threshold, env);
  } catch (error) {
    console.warn('Provider balance alert check failed:', error);
  }
  try {
    const { data, error } = await supabase.rpc('cleanup_operational_records');
    if (error) throw error;
    result.cleanup = data || {};
  } catch (error) {
    console.warn('Operational retention cleanup failed:', error);
  }
  return result;
}
