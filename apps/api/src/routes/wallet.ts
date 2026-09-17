import { Router } from 'express';
import { getBalance, creditBalance, getTransactions } from '../services/wallet.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { notifyPaymentApprovalRequest } from '../services/telegram.js';

const router = Router();

export interface WalletConfig {
  minDeposit: number;
  maxDeposit: number;
  suggestions: number[];
  upiId: string;
  upiName: string;
}

export async function getWalletConfig(): Promise<WalletConfig> {
  const { data } = await supabaseAdmin.from('settings').select('*');
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));

  const minDeposit = parseFloat(map.get('min_deposit_inr') || '50') || 50;
  const maxDeposit = parseFloat(map.get('max_deposit_inr') || '50000') || 50000;

  // Amount suggestions (up to 5)
  const rawSuggestions = map.get('deposit_suggestions') || '50,100,200,500,1000';
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
    suggestions = [50, 100, 200, 500, 1000];
  }

  // Ensure up to 5 suggestions
  suggestions = suggestions.slice(0, 5);
  if (suggestions.length === 0) {
    suggestions = [50, 100, 200, 500, 1000];
  }

  const upiId = (map.get('upi_id') as string) || 'otpwala@upi';
  const upiName = (map.get('upi_merchant_name') as string) || 'OTPWala';

  return {
    minDeposit,
    maxDeposit,
    suggestions,
    upiId,
    upiName,
  };
}

/**
 * GET /api/wallet/config
 * Public wallet configuration (min/max deposit, up to 5 suggestions, UPI details).
 */
router.get('/config', async (_req, res) => {
  try {
    const config = await getWalletConfig();
    res.json({ success: true, data: config });
  } catch (e: any) {
    console.error('Wallet config error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet config' });
  }
});

/**
 * GET /api/wallet
 * Get current balance, recent transactions, and wallet config.
 */
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const [balance, { transactions, total }, config] = await Promise.all([
      getBalance(req.userId!),
      getTransactions(req.userId!, 10, 0),
      getWalletConfig(),
    ]);

    res.json({
      success: true,
      data: { balance, transactions, totalTransactions: total, config },
    });
  } catch (e) {
    console.error('Wallet fetch error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet info' });
  }
});

/**
 * GET /api/wallet/transactions
 * Paginated transaction history.
 */
router.get('/transactions', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const { transactions, total } = await getTransactions(req.userId!, limit, offset);

    res.json({ success: true, data: { transactions, total } });
  } catch (e) {
    console.error('Transaction fetch error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /api/wallet/payment-requests
 * Fetch the authenticated user's recent deposit requests and statuses.
 */
router.get('/payment-requests', async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('payment_requests')
      .select('*')
      .eq('user_id', req.userId!)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const normalized = (data || []).map((r: any) => ({
      ...r,
      amount: parseFloat(r.amount ?? r.amount_inr ?? 0),
      amount_inr: parseFloat(r.amount_inr ?? r.amount ?? 0),
      transaction_id: r.transaction_id || r.gateway_payment_id || '',
      gateway_payment_id: r.gateway_payment_id || r.transaction_id || '',
      payment_method: r.payment_method || r.gateway || 'upi',
      gateway: r.gateway || r.payment_method || 'upi',
      status: r.status === 'created' ? 'pending' : (r.status === 'paid' ? 'approved' : (r.status === 'failed' ? 'rejected' : r.status)),
    }));

    res.json({ success: true, data: normalized });
  } catch (e) {
    console.error('User payment requests error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch deposit requests' });
  }
});

/**
 * POST /api/wallet/topup
 * Create a UPI payment deposit request.
 * Body: { amount: 500, method: "upi", utr: "123456789012" }
 */
router.post('/topup', async (req: AuthenticatedRequest, res) => {
  try {
    const { amount, method, utr } = req.body;
    const amountNum = parseFloat(amount);

    const config = await getWalletConfig();

    // Reject card payments
    if (method && method.toLowerCase().includes('card')) {
      res.status(400).json({
        success: false,
        error: 'Card payments are disabled. Please use UPI payment to deposit.',
      });
      return;
    }

    if (!amountNum || amountNum < config.minDeposit || amountNum > config.maxDeposit) {
      res.status(400).json({
        success: false,
        error: `Amount must be between ₹${config.minDeposit} and ₹${config.maxDeposit.toLocaleString('en-IN')}`,
      });
      return;
    }

    let request: any = null;

    // Try modern column insert
    const modernInsert = await supabaseAdmin
      .from('payment_requests')
      .insert({
        user_id: req.userId,
        amount: amountNum,
        transaction_id: utr ? String(utr).trim() : null,
        payment_method: 'upi',
        status: 'pending',
      })
      .select()
      .single();

    if (modernInsert.error) {
      // Fallback for legacy columns
      const legacyInsert = await supabaseAdmin
        .from('payment_requests')
        .insert({
          user_id: req.userId,
          amount_inr: amountNum,
          gateway: 'upi',
          gateway_payment_id: utr ? String(utr).trim() : null,
          status: 'created',
        })
        .select()
        .single();

      if (legacyInsert.error) throw modernInsert.error || legacyInsert.error;
      request = legacyInsert.data;
    } else {
      request = modernInsert.data;
    }

    // Asynchronously notify admin on Telegram if UTR is provided
    if (utr) {
      const trimmedUtr = String(utr).trim();
      (async () => {
        try {
          const { data: userProfile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, email')
            .eq('id', req.userId)
            .maybeSingle();

          await notifyPaymentApprovalRequest({
            requestId: request?.id || 'N/A',
            amount: amountNum,
            utr: trimmedUtr,
            userId: req.userId!,
            userEmail: userProfile?.email || req.userEmail || 'Unknown Email',
            userName: userProfile?.full_name || undefined,
            createdAt: request?.created_at,
          });
        } catch (err) {
          console.error('Telegram notification error for top-up request:', err);
        }
      })();
    }

    res.json({
      success: true,
      data: {
        message: `UPI deposit request of ₹${amountNum} submitted! Admin will verify and credit your wallet.`,
        amount: amountNum,
        utr: utr || null,
        requestId: request?.id,
      },
    });
  } catch (e: any) {
    console.error('Topup error:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to process top-up' });
  }
});

export default router;
