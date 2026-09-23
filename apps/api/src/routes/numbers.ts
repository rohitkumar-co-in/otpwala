import { Router } from 'express';
import { buyNumber, checkOrderStatus, cancelOrder, completeOrder, retryOrder } from '../services/order.js';
import { OrderError } from '../services/order.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

/**
 * POST /api/numbers/buy
 * Purchase a number for a service/country.
 * Body: { service: "tg", country: 6 }
 */
router.post('/buy', async (req: AuthenticatedRequest, res) => {
  try {
    const { service, country, requestId } = req.body;

    if (!service || country === undefined) {
      res.status(400).json({ success: false, error: 'Missing service or country' });
      return;
    }

    if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId))) {
      res.status(400).json({ success: false, error: 'invalid_request_id', message: 'A valid purchase request ID is required.' });
      return;
    }

    const normalizedService = String(service).toLowerCase();
    const normalizedCountry = parseInt(country, 10);
    if (!Number.isInteger(normalizedCountry)) {
      res.status(400).json({ success: false, error: 'Invalid country' });
      return;
    }

    const claim = await supabaseAdmin.from('purchase_intents').insert({
      request_id: requestId,
      user_id: req.userId,
      service_code: normalizedService,
      country_code: normalizedCountry,
    });
    if (claim.error) {
      if (claim.error.code !== '23505') throw claim.error;
      const { data: prior, error: priorError } = await supabaseAdmin
        .from('purchase_intents')
        .select('*')
        .eq('request_id', requestId)
        .eq('user_id', req.userId)
        .maybeSingle();
      if (priorError || !prior || prior.service_code !== normalizedService || prior.country_code !== normalizedCountry) {
        res.status(409).json({ success: false, error: 'idempotency_conflict', message: 'Purchase request ID conflict.' });
        return;
      }
      if (prior.status === 'completed' && prior.response) {
        res.json({ success: true, data: prior.response });
        return;
      }
      if (prior.status === 'processing') {
        res.status(409).json({ success: false, error: 'purchase_in_progress', message: 'This purchase is still processing. Please wait.' });
        return;
      }
      res.status(409).json({ success: false, error: prior.error_code || 'purchase_failed', message: prior.error_message || 'This purchase attempt failed. Please try again.' });
      return;
    }

    let result;
    try {
      result = await buyNumber(req.userId!, normalizedService, normalizedCountry, requestId);
      await supabaseAdmin.from('purchase_intents').update({ status: 'completed', response: result, updated_at: new Date().toISOString() }).eq('request_id', requestId).eq('status', 'processing');
    } catch (buyError: any) {
      await supabaseAdmin.from('purchase_intents').update({ status: 'failed', error_code: buyError?.code || 'purchase_failed', error_message: String(buyError?.message || 'Purchase failed').slice(0, 500), updated_at: new Date().toISOString() }).eq('request_id', requestId).eq('status', 'processing');
      throw buyError;
    }
    res.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OrderError) {
      const statusCode = (e.code === 'USER_INSUFFICIENT_FUNDS' || e.code === 'INSUFFICIENT_BALANCE') ? 402 : 400;
      res.status(statusCode).json({ success: false, error: e.code, message: e.message, code: e.code });
      return;
    }
    console.error('Buy number error:', e);
    res.status(500).json({ success: false, error: 'Failed to purchase number' });
  }
});

/**
 * GET /api/numbers/:orderId/status
 * Poll the OTP status of an order.
 */
router.get('/:orderId/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { orderId } = req.params;
    const status = await checkOrderStatus(orderId, req.userId!);
    res.json({ success: true, data: status });
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(404).json({ success: false, error: e.message, code: e.code });
      return;
    }
    console.error('Check status error:', e);
    res.status(500).json({ success: false, error: 'Failed to check status' });
  }
});

/**
 * POST /api/numbers/:orderId/cancel
 * Cancel an order and refund.
 */
router.post('/:orderId/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const { orderId } = req.params;
    await cancelOrder(orderId, req.userId!);
    res.json({ success: true, message: 'Order cancelled and refunded' });
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(400).json({ success: false, error: e.message, code: e.code });
      return;
    }
    console.error('Cancel order error:', e);
    res.status(500).json({ success: false, error: 'Failed to cancel order' });
  }
});

/**
 * POST /api/numbers/:orderId/complete
 * Mark an order as complete.
 */
router.post('/:orderId/complete', async (req: AuthenticatedRequest, res) => {
  try {
    const { orderId } = req.params;
    await completeOrder(orderId, req.userId!);
    res.json({ success: true, message: 'Order completed' });
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(400).json({ success: false, error: e.message, code: e.code });
      return;
    }
    console.error('Complete order error:', e);
    res.status(500).json({ success: false, error: 'Failed to complete order' });
  }
});

/**
 * POST /api/numbers/:orderId/retry
 * Request another SMS for an order.
 */
router.post('/:orderId/retry', async (req: AuthenticatedRequest, res) => {
  try {
    const { orderId } = req.params;
    await retryOrder(orderId, req.userId!);
    res.json({ success: true, message: 'Another SMS requested' });
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(400).json({ success: false, error: e.message, code: e.code });
      return;
    }
    console.error('Retry order error:', e);
    res.status(500).json({ success: false, error: 'Failed to request another SMS' });
  }
});

export default router;
