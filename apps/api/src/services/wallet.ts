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
  description: string,
  referenceType: string | null = null,
  referenceId: string | null = null,
  idempotencyKey: string | null = null,
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Transaction amount must be positive');
  }

  const { data, error } = await supabaseAdmin.rpc('post_wallet_transaction', {
    p_user_id: userId,
    p_amount: -amount,
    p_type: 'deduction',
    p_description: description,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (error.message?.includes('insufficient_wallet_balance')) {
      throw new WalletError('INSUFFICIENT_BALANCE', 'Insufficient wallet balance');
    }
    throw new WalletError('WALLET_POST_FAILED', error.message || 'Wallet deduction failed');
  }

  return parseFloat(data?.[0]?.balance_after || '0');
}

/**
 * Credit balance (for refunds, top-ups, admin credits).
 */
export async function creditBalance(
  userId: string,
  amount: number,
  typeOrDesc: 'topup' | 'refund' | 'admin_credit' | 'admin_grant' | 'referral_bonus' | string,
  descOrType?: string,
  paymentInfo?: { paymentId?: string; method?: string }
): Promise<number> {
  const validTypes = ['topup', 'refund', 'admin_credit', 'admin_grant', 'referral_bonus'];
  let type: 'topup' | 'refund' | 'admin_credit' | 'admin_grant' | 'referral_bonus' = 'topup';
  let description = '';

  if (validTypes.includes(typeOrDesc)) {
    type = typeOrDesc as any;
    description = descOrType || '';
  } else {
    description = typeOrDesc;
    type = (descOrType && validTypes.includes(descOrType)) ? (descOrType as any) : 'topup';
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new WalletError('INVALID_AMOUNT', 'Transaction amount must be positive');
  }

  const { data, error } = await supabaseAdmin.rpc('post_wallet_transaction', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description,
    p_reference_type: paymentInfo?.method || null,
    p_reference_id: paymentInfo?.paymentId || null,
    p_idempotency_key: paymentInfo?.paymentId || null,
  });

  if (error) throw new WalletError('WALLET_POST_FAILED', error.message || 'Wallet credit failed');

  const newBalance = parseFloat(data?.[0]?.balance_after || '0');

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
