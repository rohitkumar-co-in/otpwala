import { getSupabaseAdmin } from './supabase';

export async function getBalance(userId: string, env?: any): Promise<number> {
  const supabase = getSupabaseAdmin(env);
  const { data, error } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return 0;
  }
  return parseFloat(data.wallet_balance) || 0;
}

export async function deductBalance(
  userId: string,
  amount: number,
  description: string,
  env?: any,
  referenceType?: string,
  referenceId?: string,
  idempotencyKey?: string
): Promise<number> {
  const supabase = getSupabaseAdmin(env);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid transaction amount');
  const { data, error } = await supabase.rpc('post_wallet_transaction', {
    p_user_id: userId,
    p_amount: -amount,
    p_type: 'deduction',
    p_description: description,
    p_reference_type: referenceType || null,
    p_reference_id: referenceId || null,
    p_idempotency_key: idempotencyKey || null,
  });
  if (error) {
    if (error.message?.includes('insufficient_wallet_balance')) throw new Error('Insufficient wallet balance');
    throw new Error(error.message || 'Wallet deduction failed');
  }
  return parseFloat(data?.[0]?.balance_after || '0');
}

export async function creditBalance(
  userId: string,
  amount: number,
  description: string,
  type: 'refund' | 'topup' | 'admin_credit' | 'admin_grant' = 'refund',
  env?: any,
  referenceType?: string,
  referenceId?: string,
  idempotencyKey?: string
): Promise<number> {
  const supabase = getSupabaseAdmin(env);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid transaction amount');
  const { data, error } = await supabase.rpc('post_wallet_transaction', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description,
    p_reference_type: referenceType || null,
    p_reference_id: referenceId || null,
    p_idempotency_key: idempotencyKey || null,
  });
  if (error) throw new Error(error.message || 'Wallet credit failed');
  return parseFloat(data?.[0]?.balance_after || '0');
}

export async function getWalletConfig(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data } = await supabase.from('settings').select('key, value');
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));

  const minDeposit = parseFloat(map.get('min_deposit_inr') || '50') || 50;
  const maxDeposit = parseFloat(map.get('max_deposit_inr') || '50000') || 50000;
  const upiId = (map.get('upi_id') as string) || 'otpwala@upi';
  const upiName = (map.get('upi_merchant_name') as string) || 'OTPWala';

  const binancePayEnabled = map.get('binance_pay_enabled') !== 'false';
  const binancePayId = (map.get('binance_pay_id') as string) || '';
  const binancePayNickname = (map.get('binance_pay_nickname') as string) || '';
  const binancePayQrUrl = (map.get('binance_pay_qr_url') as string) || '';
  const catalogRate = parseFloat(map.get('custom_dollar_rate') || map.get('usd_to_inr_rate') || '115') || 115;
  const usdtInrRate = parseFloat(map.get('usdt_inr_rate') || String(catalogRate)) || catalogRate;

  // Dynamic Amount suggestions (up to 5) configured in Admin Settings
  const rawSuggestions = map.get('deposit_suggestions') || '50,100,200,300,500';
  let suggestions: number[] = [];
  try {
    if (typeof rawSuggestions === 'string' && rawSuggestions.startsWith('[')) {
      suggestions = JSON.parse(rawSuggestions);
    } else if (typeof rawSuggestions === 'string') {
      suggestions = rawSuggestions
        .split(',')
        .map((s: string) => parseFloat(s.trim()))
        .filter((n: number) => !isNaN(n) && n > 0);
    }
  } catch {
    suggestions = [50, 100, 200, 300, 500];
  }

  suggestions = suggestions.slice(0, 5);
  if (suggestions.length === 0) {
    suggestions = [50, 100, 200, 300, 500];
  }

  return {
    minDeposit,
    maxDeposit,
    suggestions,
    upiId,
    upiName,
    binancePayEnabled,
    binancePayId,
    binancePayNickname,
    binancePayQrUrl,
    usdtInrRate,
    usdToInrRate: catalogRate,
  };
}
