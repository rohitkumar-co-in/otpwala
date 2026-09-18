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
  binancePayEnabled?: boolean;
  binancePayId?: string;
  binancePayNickname?: string;
  binancePayQrUrl?: string;
  usdtInrRate?: number;
  usdToInrRate?: number;
  binanceMinDeposit?: number;
  binanceMaxDeposit?: number;
  binanceSuggestions?: number[];
}

export async function getWalletConfig(): Promise<WalletConfig> {
  const { data } = await supabaseAdmin.from('settings').select('*');
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));

  const minDeposit = parseFloat(map.get('min_deposit_inr') || '50') || 50;
  const maxDeposit = parseFloat(map.get('max_deposit_inr') || '50000') || 50000;

  // Amount suggestions (up to 5)
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

  // Ensure up to 5 suggestions
  suggestions = suggestions.slice(0, 5);
  if (suggestions.length === 0) {
    suggestions = [50, 100, 200, 300, 500];
  }

  const binanceMinDeposit = parseFloat(map.get('binance_min_deposit_usdt') || '1') || 1;
  const binanceMaxDeposit = parseFloat(map.get('binance_max_deposit_usdt') || '500') || 500;

  // Dynamic Binance USDT suggestions (up to 5) configured in Admin Settings
  const rawBinanceSuggestions = map.get('binance_deposit_suggestions') || '1,2,5,10,20';
  let binanceSuggestions: number[] = [];
  try {
    if (typeof rawBinanceSuggestions === 'string' && rawBinanceSuggestions.startsWith('[')) {
      binanceSuggestions = JSON.parse(rawBinanceSuggestions);
    } else if (typeof rawBinanceSuggestions === 'string') {
      binanceSuggestions = rawBinanceSuggestions
        .split(',')
        .map((s: string) => parseFloat(s.trim()))
        .filter((n: number) => !isNaN(n) && n > 0);
    }
  } catch {
    binanceSuggestions = [1, 2, 5, 10, 20];
  }

  binanceSuggestions = binanceSuggestions.slice(0, 5);
  if (binanceSuggestions.length === 0) {
    binanceSuggestions = [1, 2, 5, 10, 20];
  }

  const upiId = (map.get('upi_id') as string) || 'otpwala@upi';
  const upiName = (map.get('upi_merchant_name') as string) || 'OTPWala';

  const binancePayEnabled = map.get('binance_pay_enabled') !== 'false';
  const binancePayId = (map.get('binance_pay_id') as string) || '';
  const binancePayNickname = (map.get('binance_pay_nickname') as string) || '';
  const binancePayQrUrl = (map.get('binance_pay_qr_url') as string) || '';
  const catalogRate = parseFloat(map.get('custom_dollar_rate') || map.get('usd_to_inr_rate') || '115') || 115;
  const usdtInrRate = parseFloat(map.get('usdt_inr_rate') || String(catalogRate)) || catalogRate;

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
    binanceMinDeposit,
    binanceMaxDeposit,
    binanceSuggestions,
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

    const rawMethod = String(method || 'upi').toLowerCase();
    const isBinance = rawMethod.includes('binance');
    const paymentMethod = isBinance ? 'binance' : 'upi';

    if (isBinance) {
      const binanceRate = config.usdtInrRate || 115;
      const minInr = (config.binanceMinDeposit || 1) * binanceRate - 0.5;
      const maxInr = (config.binanceMaxDeposit || 500) * binanceRate + 0.5;
      if (!amountNum || amountNum < minInr || amountNum > maxInr) {
        res.status(400).json({
          success: false,
          error: `Deposit amount must be between ${config.binanceMinDeposit} and ${config.binanceMaxDeposit} USDT (≈ ₹${Math.round((config.binanceMinDeposit || 1) * binanceRate)} - ₹${Math.round((config.binanceMaxDeposit || 500) * binanceRate).toLocaleString('en-IN')})`,
        });
        return;
      }
    } else if (!amountNum || amountNum < config.minDeposit || amountNum > config.maxDeposit) {
      res.status(400).json({
        success: false,
        error: `Amount must be between ₹${config.minDeposit} and ₹${config.maxDeposit.toLocaleString('en-IN')}`,
      });
      return;
    }

    // Validate reference
    const cleanUtr = String(utr || '').trim().replace(/\s+/g, '');
    if (!isBinance) {
      if (!/^\d{12}$/.test(cleanUtr)) {
        res.status(400).json({
          success: false,
          error: 'Please enter a valid 12-digit numeric UPI reference ID / UTR (e.g. 129815979728)',
        });
        return;
      }
    } else {
      if (!/^\d+$/.test(cleanUtr)) {
        res.status(400).json({
          success: false,
          error: 'Please enter a valid numeric Binance Pay Order ID (digits only, e.g. 430406788154015744)',
        });
        return;
      }
    }

    let request: any = null;

    // Try modern column insert
    const modernInsert = await supabaseAdmin
      .from('payment_requests')
      .insert({
        user_id: req.userId,
        amount: amountNum,
        transaction_id: cleanUtr || null,
        payment_method: paymentMethod,
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
          gateway: paymentMethod,
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
            paymentMethod,
          });
        } catch (err) {
          console.error('Telegram notification error for top-up request:', err);
        }
      })();
    }

    const methodLabel = isBinance ? 'Binance Pay' : 'UPI';
    res.json({
      success: true,
      data: {
        message: `${methodLabel} deposit request of ₹${amountNum} submitted! Admin will verify and credit your wallet.`,
        amount: amountNum,
        utr: utr || null,
        requestId: request?.id,
        method: paymentMethod,
      },
    });
  } catch (e: any) {
    console.error('Topup error:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to process top-up' });
  }
});

export default router;
