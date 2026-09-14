import { getSupabaseAdmin } from './supabase';
import { TigerSmsClient, TigerSmsError } from './tiger';
import { calculateSellPrice } from './pricing';
import { deductBalance, creditBalance } from './wallet';
import { getDisabledCatalog } from './catalog';

import countryFlags from '../data/countryFlags.json';

const POPULAR_SERVICE_NAMES: Record<string, string> = {
  wa: 'WhatsApp',
  tg: 'Telegram',
  go: 'Google / YouTube',
  ig: 'Instagram',
  fb: 'Facebook',
  tw: 'Twitter / X',
  vi: 'Viber',
  oi: 'Tinder',
  mb: 'Yahoo',
  ds: 'Discord',
  nf: 'Netflix',
  am: 'Amazon',
  tk: 'TikTok',
  dr: 'OpenAI / ChatGPT',
  mm: 'Microsoft',
  ap: 'Apple',
};

export async function buyNumber(
  userId: string,
  serviceCode: string,
  countryCode: number,
  env?: any
) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

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

  // 3. Calculate sell price in INR
  const sellPriceInr = await calculateSellPrice(costPriceUsd, serviceCode, countryCode, userId, env);

  // 4. Deduct balance from user wallet
  try {
    await deductBalance(userId, sellPriceInr, `Number purchase: ${serviceCode.toUpperCase()}`, env);
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
    await creditBalance(userId, sellPriceInr, `Auto-refund: Purchase failed for ${serviceCode.toUpperCase()}`, 'refund', env);
    throw err;
  }

  // 6. Save order in Supabase
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString(); // 20 min TTL
  const flagMeta = (countryFlags as any)[String(countryCode)];
  const countryName = flagMeta?.name || `Country ${countryCode}`;
  const serviceName = POPULAR_SERVICE_NAMES[serviceCode.toLowerCase()] || serviceCode.toUpperCase();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      activation_id: activationId,
      service_code: serviceCode,
      service_name: serviceName,
      country_code: countryCode,
      country_name: countryName,
      phone_number: phoneNumber,
      cost_price_usd: costPriceUsd,
      sell_price_inr: sellPriceInr,
      price_inr: sellPriceInr,
      status: 'waiting',
      tiger_status: 'STATUS_WAIT_CODE',
    })
    .select()
    .single();

  if (orderError) {
    console.error('Failed to create order record:', orderError);
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
    orderId: order?.id || activationId,
    activationId,
    phoneNumber,
    serviceCode,
    serviceName,
    countryCode,
    countryName,
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
      status: order.status,
      smsCode: order.sms_code,
      smsText: order.sms_text,
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
      status: 'code_received',
      smsCode: statusResult.code,
      smsText: statusResult.text,
    };
  }

  if (statusResult.status === 'cancelled' && order.status !== 'cancelled') {
    await creditBalance(userId, parseFloat(order.sell_price_inr), `Refund: Order cancelled (${order.service_name})`, 'refund', env);
    await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', order.id);

    return { status: 'cancelled' };
  }

  return { status: order.status };
}

export async function cancelOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const order = await findOrder(supabase, orderId, userId);

  if (!order) throw new Error('Order not found');
  if (['completed', 'cancelled', 'refunded'].includes(order.status)) {
    throw new Error('Order cannot be cancelled');
  }

  // Cancel in Tiger SMS
  try {
    await tiger.setStatus(order.activation_id, 8);
  } catch {}

  // Refund user
  await creditBalance(userId, parseFloat(order.sell_price_inr), `Refund: Order cancelled by user (${order.service_name})`, 'refund', env);

  await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', order.id);

  return { success: true };
}

export async function completeOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const order = await findOrder(supabase, orderId, userId);

  if (!order) throw new Error('Order not found');

  try {
    await tiger.setStatus(order.activation_id, 6);
  } catch {}

  await supabase
    .from('orders')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', order.id);

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
