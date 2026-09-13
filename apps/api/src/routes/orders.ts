import { Router } from 'express';
import { getOrderHistory } from '../services/order.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/orders
 * User's order history with pagination.
 */
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string | undefined;

    const { orders, total } = await getOrderHistory(req.userId!, limit, offset, status);

    res.json({ success: true, data: { orders, total } });
  } catch (e) {
    console.error('Orders fetch error:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

export default router;
