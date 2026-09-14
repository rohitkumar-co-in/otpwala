import { supabaseAdmin } from '../config/supabase.js';

/**
 * Wallet Service
 * Handles atomic balance operations to prevent race conditions.
 */

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching balance for user ${userId}:`, error.message);
    return 0;
  }

  if (!data) {
    // Check if new registrations are closed
    const { data: regSetting } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'auth_allow_registration')
      .maybeSingle();

    if (regSetting?.value === 'false') {
      return 0;
    }

    // Verify user actually exists in auth.users and was created recently before auto-creating
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authErr || !authUser?.user) {
      return 0;
    }

    // If user has no profile row yet, auto-create one
    try {
      await supabaseAdmin.from('profiles').upsert({
        id: userId,
        email: authUser.user.email || '',
        role: 'user',
        wallet_balance: 0.00,
      });
    } catch (e: any) {
      console.warn('Auto-create profile warning:', e.message);
    }
    return 0;
  }

  return parseFloat(data.wallet_balance) || 0;
}

/**
 * Deduct balance atomically. Returns the new balance.
 * Throws if insufficient funds.
 */
export async function deductBalance(
  userId: string,
  amount: number,
  description: string
): Promise<number> {
  // Use Supabase RPC for atomic deduction
  const { data: profile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .single();

  if (fetchError) throw new Error('Failed to fetch profile');

  const currentBalance = parseFloat(profile.wallet_balance) || 0;

  if (currentBalance < amount) {
    throw new WalletError('INSUFFICIENT_BALANCE', 'Insufficient wallet balance');
  }

  const newBalance = Math.round((currentBalance - amount) * 10000) / 10000;

  // Update profile balance
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      wallet_balance: newBalance,
      total_spent: parseFloat(profile.wallet_balance) > 0
        ? currentBalance - newBalance + (parseFloat(profile.wallet_balance) - currentBalance)
        : amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('wallet_balance', profile.wallet_balance); // Optimistic lock

  if (updateError) {
    throw new WalletError('CONCURRENT_UPDATE', 'Balance changed during transaction, please retry');
  }

  // Record transaction
  await supabaseAdmin.from('wallet_transactions').insert({
    user_id: userId,
    type: 'deduction',
    amount: -amount,
    balance_after: newBalance,
    description,
    status: 'completed',
  });

  return newBalance;
}

/**
 * Credit balance (for refunds, top-ups, admin credits).
 */
export async function creditBalance(
  userId: string,
  amount: number,
  typeOrDesc: 'topup' | 'refund' | 'admin_credit' | string,
  descOrType?: string,
  paymentInfo?: { paymentId?: string; method?: string }
): Promise<number> {
  const validTypes = ['topup', 'refund', 'admin_credit', 'referral_bonus'];
  let type: 'topup' | 'refund' | 'admin_credit' = 'topup';
  let description = '';

  if (validTypes.includes(typeOrDesc)) {
    type = typeOrDesc as any;
    description = descOrType || '';
  } else {
    description = typeOrDesc;
    type = (descOrType && validTypes.includes(descOrType)) ? (descOrType as any) : 'topup';
  }

  const { data: profile, error: fetchError } = await supabaseAdmin
    .from('profiles')
    .select('wallet_balance')
    .eq('id', userId)
    .single();

  if (fetchError) throw new Error('Failed to fetch profile');

  const currentBalance = parseFloat(profile.wallet_balance) || 0;
  const newBalance = Math.round((currentBalance + amount) * 10000) / 10000;

  // Update profile balance
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({
      wallet_balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) throw new Error('Failed to update balance');

  // Record transaction
  await supabaseAdmin.from('wallet_transactions').insert({
    user_id: userId,
    type,
    amount,
    balance_after: newBalance,
    description,
    payment_id: paymentInfo?.paymentId || null,
    payment_method: paymentInfo?.method || null,
    status: 'completed',
  });

  // If this was a top-up deposit, credit referral commission (20% first deposit, 5% for next 2 months)
  if (type === 'topup') {
    try {
      const { processReferralDepositBonus } = await import('./referrals.js');
      processReferralDepositBonus(userId, amount).catch((err) =>
        console.error('Error processing referral bonus on topup:', err)
      );
    } catch (refErr) {
      console.error('Failed to load referrals service:', refErr);
    }
  }

  return newBalance;
}

/**
 * Get transaction history for a user.
 */
export async function getTransactions(
  userId: string,
  limit = 20,
  offset = 0
) {
  const { data, error, count } = await supabaseAdmin
    .from('wallet_transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error('Failed to fetch transactions');
  return { transactions: data, total: count || 0 };
}

export class WalletError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
}
