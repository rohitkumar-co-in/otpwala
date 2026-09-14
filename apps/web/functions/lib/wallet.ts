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
  env?: any
): Promise<number> {
  const supabase = getSupabaseAdmin(env);
  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .single();

  if (fetchError || !profile) throw new Error('User profile not found');

  const currentBalance = parseFloat(profile.wallet_balance) || 0;
  if (currentBalance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  const newBalance = Math.round((currentBalance - amount) * 10000) / 10000;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      wallet_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('wallet_balance', profile.wallet_balance);

  if (updateError) {
    throw new Error('Balance changed during transaction, please retry');
  }

  await supabase.from('wallet_transactions').insert({
    user_id: userId,
    type: 'deduction',
    amount,
    balance_after: newBalance,
    description,
    status: 'completed',
  });

  return newBalance;
}

export async function creditBalance(
  userId: string,
  amount: number,
  description: string,
  type: 'refund' | 'topup' | 'admin_credit' = 'refund',
  env?: any
): Promise<number> {
  const supabase = getSupabaseAdmin(env);
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .single();

  if (error || !profile) throw new Error('User profile not found');

  const currentBalance = parseFloat(profile.wallet_balance) || 0;
  const newBalance = Math.round((currentBalance + amount) * 10000) / 10000;

  await supabase
    .from('profiles')
    .update({
      wallet_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  await supabase.from('wallet_transactions').insert({
    user_id: userId,
    type,
    amount,
    balance_after: newBalance,
    description,
    status: 'completed',
  });

  return newBalance;
}

export async function getWalletConfig(env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { data } = await supabase.from('settings').select('key, value');
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));

  const minDeposit = parseFloat(map.get('min_deposit_inr') || '50') || 50;
  const maxDeposit = parseFloat(map.get('max_deposit_inr') || '50000') || 50000;
  const upiId = (map.get('upi_id') as string) || 'otpwala@upi';
  const upiName = (map.get('upi_merchant_name') as string) || 'OTPWala';

  return {
    minDeposit,
    maxDeposit,
    suggestions: [50, 100, 200, 500, 1000],
    upiId,
    upiName,
  };
}
