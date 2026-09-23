import { supabaseAdmin } from '../config/supabase.js';
import { tigerSms, TigerSmsError } from './tigerSms.js';
import { calculateSellPrice } from './pricing.js';
import { deductBalance, creditBalance } from './wallet.js';
import { isServiceActive, isCountryActive } from './catalogFilter.js';
import type { Order, BuyNumberResponse, OrderStatusResponse } from '@otpwala/shared';

/**
 * Order Manager
 * Orchestrates the full lifecycle of a number purchase order.
 */

// Cache for service/country names
const serviceNameCache = new Map<string, string>();
const countryNameCache = new Map<number, string>();

async function getServiceName(code: string): Promise<string> {
  if (serviceNameCache.has(code)) return serviceNameCache.get(code)!;
  try {
    const services = await tigerSms.getServicesList();
    services.forEach(s => serviceNameCache.set(s.code, s.name));
    return serviceNameCache.get(code) || code;
  } catch {
    return code;
  }
}

async function getCountryName(id: number): Promise<string> {
  if (countryNameCache.has(id)) return countryNameCache.get(id)!;
  try {
    const countries = await tigerSms.getCountries();
    countries.forEach(c => countryNameCache.set(c.id, c.eng));
    return countryNameCache.get(id) || `Country ${id}`;
  } catch {
    return `Country ${id}`;
  }
}

async function refundOrderAtomically(
  orderId: string,
  terminalStatus: 'cancelled' | 'expired',
  reason: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc('refund_order_atomic', {
    p_order_id: orderId,
    p_terminal_status: terminalStatus,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'Order refund failed');
}

/**
 * Buy a number — full transactional flow.
 */
export async function buyNumber(
  userId: string,
  serviceCode: string,
  countryCode: number,
  requestedOrderId?: string,
): Promise<BuyNumberResponse> {
  const orderId = requestedOrderId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedOrderId)
    ? requestedOrderId
    : crypto.randomUUID();
  // 0. Verify service and country are enabled by admin
  const [serviceEnabled, countryEnabled] = await Promise.all([
    isServiceActive(serviceCode),
    isCountryActive(countryCode),
  ]);

  if (!serviceEnabled) {
    throw new OrderError('SERVICE_DISABLED', 'This service is currently unavailable');
  }
  if (!countryEnabled) {
    throw new OrderError('COUNTRY_DISABLED', 'This country is currently unavailable');
  }

  // 1. Get pricing from Tiger SMS
  let costPriceUsd: number;
  try {
    const priceData = await tigerSms.getPrices(serviceCode, countryCode);
    const countryPrices = priceData[String(countryCode)];
    if (!countryPrices || !countryPrices[serviceCode]) {
      throw new OrderError('NOT_AVAILABLE', 'Service not available for this country');
    }
    const sData = countryPrices[serviceCode] as any;
    costPriceUsd = parseFloat(String(sData.cost ?? sData.price ?? '0'));
    if (isNaN(costPriceUsd) || costPriceUsd <= 0) {
      throw new OrderError('PRICE_FETCH_FAILED', 'Could not fetch pricing');
    }
  } catch (e) {
    if (e instanceof TigerSmsError || e instanceof OrderError) {
      throw e;
    }
    throw new OrderError('PRICE_FETCH_FAILED', 'Could not fetch pricing');
  }

  // 2. Calculate sell price in INR (zero-markup users get Tiger cost)
  const sellPriceInr = await calculateSellPrice(costPriceUsd, serviceCode, countryCode, userId);

  // 3. Get names for records
  const [serviceName, countryName] = await Promise.all([
    getServiceName(serviceCode),
    getCountryName(countryCode),
  ]);

  // 4. Deduct user wallet
  try {
    await deductBalance(userId, sellPriceInr, `Number purchase: ${serviceName} (${countryName})`, 'order', orderId, `purchase:${orderId}`);
  } catch (e: any) {
    throw new OrderError('USER_INSUFFICIENT_FUNDS', e.message || 'Insufficient wallet balance');
  }

  // 5. Purchase number from Tiger SMS
  let activationId: string;
  let phoneNumber: string;

  try {
    const result = await tigerSms.getNumber(serviceCode, countryCode);
    activationId = result.activationId;
    phoneNumber = result.phoneNumber;
  } catch (e) {
    // Tiger SMS failed — refund the user
    await creditBalance(
      userId,
      sellPriceInr,
      'refund',
      `Refund: Number purchase failed (${serviceName})`,
      { paymentId: `refund:${orderId}`, method: 'order' }
    );

    if (e instanceof TigerSmsError) {
      const code = e.code === 'NO_BALANCE' ? 'PROVIDER_OUT_OF_STOCK' : e.code;
      throw new OrderError(code, e.message);
    }
    throw new OrderError('PURCHASE_FAILED', 'Failed to purchase number');
  }

  // 6. Create order record
  const { data: order, error } = await supabaseAdmin
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
      status: 'waiting',
      tiger_status: 'STATUS_WAIT_CODE',
      expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error || !order) {
    console.error('Failed to create order record:', error);
    try { await tigerSms.setStatus(activationId, 8); } catch {}
    await creditBalance(
      userId,
      sellPriceInr,
      'refund',
      `Refund: Order creation failed (${serviceName})`,
      { paymentId: `refund:${orderId}`, method: 'order' }
    );
    throw new OrderError('ORDER_CREATION_FAILED', 'Failed to record order. Wallet refunded.');
  }

  // 7. Update user stats
  try {
    await supabaseAdmin.rpc('increment_total_orders', { user_id: userId });
  } catch {
    // Non-fatal if RPC function is not yet created in Supabase
  }

  return {
    orderId: order.id,
    activationId,
    phoneNumber,
    priceInr: sellPriceInr,
    serviceName,
    countryName,
  };
}

/**
 * Poll the OTP status of an order.
 */
export async function checkOrderStatus(
  orderId: string,
  userId: string
): Promise<OrderStatusResponse> {
  // Fetch order
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) {
    throw new OrderError('ORDER_NOT_FOUND', 'Order not found');
  }

  // If already completed/cancelled/refunded/expired, return cached status
  if (['completed', 'cancelled', 'refunded', 'expired'].includes(order.status)) {
    return formatOrderStatus(order as Order);
  }

  // 1. Poll Tiger SMS for latest status first
  try {
    const v1Status = await tigerSms.getStatus(order.activation_id);

    if (v1Status.status === 'code_received' && v1Status.code) {
      await supabaseAdmin
        .from('orders')
        .update({
          sms_code: v1Status.code,
          sms_text: `Your code is ${v1Status.code}`,
          status: 'code_received',
          tiger_status: v1Status.providerStatus || 'STATUS_OK',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      return formatOrderStatus({
        ...order,
        sms_code: v1Status.code,
        sms_text: `Your code is ${v1Status.code}`,
        status: 'code_received',
      } as Order);
    }

    if (v1Status.status === 'cancelled') {
      if (order.status === 'code_received' || order.sms_code) {
        return formatOrderStatus(order as Order);
      }

      await refundOrderAtomically(
        orderId,
        'cancelled',
        `Auto-refund: Activation cancelled upstream (${order.service_name})`
      );

      return formatOrderStatus({
        ...order,
        status: 'cancelled',
        tiger_status: 'ACCESS_CANCEL',
      } as Order);
    }
  } catch (e: any) {
    // If Tiger SMS fails temporarily or returns transient error, keep current status
    // NEVER refund while in the active waiting period unless explicitly cancelled or expired
    console.error('Tiger SMS status poll failed:', e?.message || e);
  }

  // 2. Check 20-minute validity timeout (1200 seconds) ONLY after checking if OTP arrived
  const elapsedSec = (Date.now() - new Date(order.created_at).getTime()) / 1000;
  if (order.status === 'waiting' && elapsedSec > 1200) {
    // Attempt best-effort cancellation upstream
    try {
      await tigerSms.setStatus(order.activation_id, 8);
    } catch {
      // Ignore upstream error if already expired
    }

    await refundOrderAtomically(
      orderId,
      'expired',
      `Auto-refund: Order expired without SMS (${order.service_name})`
    );

    return formatOrderStatus({
      ...order,
      status: 'expired',
      tiger_status: 'EXPIRED',
    } as Order);
  }

  // 3. While in active waiting period (< 20 mins): DO NOTHING, no refund!
  return formatOrderStatus(order as Order);
}

/**
 * Cancel an order and refund the user.
 */
export async function cancelOrder(orderId: string, userId: string): Promise<void> {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) {
    throw new OrderError('ORDER_NOT_FOUND', 'Order not found');
  }

  if (order.status !== 'waiting' || order.sms_code) {
    throw new OrderError('INVALID_STATUS', 'Cannot cancel order in current status');
  }

  const activationAgeMs = Date.now() - new Date(order.created_at).getTime();
  if (!Number.isFinite(activationAgeMs) || activationAgeMs < 120_000) {
    throw new OrderError(
      'WAIT_BEFORE_CANCEL',
      'Please wait 2 minutes for the OTP before cancelling this number.'
    );
  }

  // Tiger is the source of truth. Do not refund or mutate the local order unless
  // the provider explicitly confirms this exact cancellation operation.
  try {
    const tigerStatus = await tigerSms.setStatus(order.activation_id, 8);
    if (tigerStatus !== 'ACCESS_CANCEL') {
      throw new TigerSmsError(tigerStatus, tigerStatus);
    }
  } catch (e) {
    if (e instanceof TigerSmsError) {
      console.error(`Tiger SMS cancel rejected activation ${order.activation_id}:`, e.code);
      throw new OrderError(e.code, e.code);
    }
    console.error('Tiger SMS cancel failed:', e);
    throw new OrderError('TIGER_SMS_UNAVAILABLE', 'TIGER_SMS_UNAVAILABLE');
  }

  // ACCESS_CANCEL confirms that Tiger accepted the cancellation/refund. The
  // database function records the credit and terminal order state together.
  await refundOrderAtomically(
    orderId,
    'cancelled',
    `Refund: Cancelled ${order.service_name} (${order.country_name})`
  );
}

/**
 * Mark an order as complete.
 */
export async function completeOrder(orderId: string, userId: string): Promise<void> {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) {
    throw new OrderError('ORDER_NOT_FOUND', 'Order not found');
  }

  if (order.status !== 'code_received') {
    throw new OrderError('INVALID_STATUS', 'Can only complete orders with received codes');
  }

  // Confirm on Tiger SMS
  try {
    await tigerSms.setStatus(order.activation_id, 6);
  } catch {
    // Log but continue — mark as complete locally
    console.error('Tiger SMS complete failed');
  }

  await supabaseAdmin
    .from('orders')
    .update({
      status: 'completed',
      tiger_status: 'ACCESS_ACTIVATION',
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
}

/**
 * Request another SMS for an order.
 */
export async function retryOrder(orderId: string, userId: string): Promise<void> {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', userId)
    .single();

  if (error || !order) {
    throw new OrderError('ORDER_NOT_FOUND', 'Order not found');
  }

  if (!['waiting', 'code_received'].includes(order.status)) {
    throw new OrderError('INVALID_STATUS', 'Cannot retry in current status');
  }

  try {
    await tigerSms.setStatus(order.activation_id, 3);
  } catch (e) {
    if (e instanceof TigerSmsError) {
      throw new OrderError(e.code, e.message);
    }
    throw new OrderError('RETRY_FAILED', 'Failed to request another SMS');
  }
}

/**
 * Get order history for a user.
 */
export async function getOrderHistory(
  userId: string,
  limit = 20,
  offset = 0,
  status?: string
) {
  let query = supabaseAdmin
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) throw new Error('Failed to fetch orders');

  return { orders: (data || []) as Order[], total: count || 0 };
}

function formatOrderStatus(order: Order): OrderStatusResponse {
  return {
    orderId: order.id,
    status: order.status,
    phoneNumber: order.phone_number,
    smsCode: order.sms_code,
    smsText: order.sms_text,
    serviceName: order.service_name,
    countryName: order.country_name,
    priceInr: order.sell_price_inr,
    createdAt: order.created_at,
  };
}

export class OrderError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'OrderError';
    this.code = code;
  }
}
