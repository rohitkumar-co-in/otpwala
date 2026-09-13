import { Router } from 'express';
import { buyNumber, checkOrderStatus, cancelOrder, completeOrder, retryOrder } from '../services/order.js';
import { OrderError } from '../services/order.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/numbers/buy
 * Purchase a number for a service/country.
 * Body: { service: "tg", country: 6 }
 */
router.post('/buy', async (req: AuthenticatedRequest, res) => {
  try {
    const { service, country } = req.body;

    if (!service || country === undefined) {
      res.status(400).json({ success: false, error: 'Missing service or country' });
      return;
    }

    const result = await buyNumber(req.userId!, service, parseInt(country));
    res.json({ success: true, data: result });
  } catch (e) {
    if (e instanceof OrderError) {
      const statusCode = e.code === 'INSUFFICIENT_BALANCE' ? 402 : 400;
      res.status(statusCode).json({ success: false, error: e.message, code: e.code });
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
