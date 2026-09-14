import { getSupabaseAdmin } from './supabase';
import { TigerSmsClient, TigerSmsError } from './tiger';
import { calculateSellPrice } from './pricing';
import { deductBalance, creditBalance } from './wallet';
import { getDisabledCatalog } from './catalog';

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
  const priceData = await tiger.getPricesV3(serviceCode, countryCode);
  const countryPrices = priceData[String(countryCode)];
  if (!countryPrices || !countryPrices[serviceCode]) {
    throw new Error('Service not available for this country');
  }
  const costPriceUsd = countryPrices[serviceCode].price;

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

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      activation_id: activationId,
      service_code: serviceCode,
      service_name: serviceCode.toUpperCase(),
      country_code: countryCode,
      country_name: `Country ${countryCode}`,
      phone_number: phoneNumber,
      cost_price_usd: costPriceUsd,
      sell_price_inr: sellPriceInr,
      status: 'waiting',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (orderError) {
    console.error('Failed to create order record:', orderError);
  }

  return {
    orderId: order?.id || activationId,
    activationId,
    phoneNumber,
    serviceCode,
    countryCode,
    sellPriceInr,
    expiresAt,
  };
}

export async function checkOrderStatus(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) {
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
      .eq('id', orderId);

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
      .eq('id', orderId);

    return { status: 'cancelled' };
  }

  return { status: order.status };
}

export async function cancelOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

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
    .eq('id', orderId);

  return { success: true };
}

export async function completeOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (!order) throw new Error('Order not found');

  try {
    await tiger.setStatus(order.activation_id, 6);
  } catch {}

  await supabase
    .from('orders')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  return { success: true };
}

export async function retryOrder(orderId: string, userId: string, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const tiger = new TigerSmsClient(env);

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (!order) throw new Error('Order not found');

  await tiger.setStatus(order.activation_id, 3);
  return { success: true };
}
