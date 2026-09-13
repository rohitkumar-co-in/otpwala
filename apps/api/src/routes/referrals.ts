import { Router } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getReferralStats, attributeReferral } from '../services/referrals.js';

const router = Router();

/**
 * GET /api/referrals
 * Get current user's referral code, statistics, referred users (Name & Date only), and bonus logs.
 */
router.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const stats = await getReferralStats(req.userId);
    res.json({ success: true, data: stats });
  } catch (e: any) {
    console.error('Referrals stats error:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to fetch referral details' });
  }
});

/**
 * POST /api/referrals/attribute
 * Attribute current user to a referrer code after registration.
 * Body: { referralCode: string }
 */
router.post('/attribute', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { referralCode } = req.body;
    if (!referralCode) {
      res.status(400).json({ success: false, error: 'Referral code is required' });
      return;
    }

    const result = await attributeReferral(req.userId, referralCode);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }

    res.json({
      success: true,
      data: { attributed: true, referrerCode: result.referrerCode },
      message: result.message,
    });
  } catch (e: any) {
    console.error('Referrals attribute error:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to link referral' });
  }
});

/**
 * POST /api/referrals/claim
 * Alias for claiming referral code within 24h from account settings.
 */
router.post('/claim', async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { referralCode } = req.body;
    if (!referralCode) {
      res.status(400).json({ success: false, error: 'Referral code is required' });
      return;
    }

    const result = await attributeReferral(req.userId, referralCode);
    if (!result.success) {
      res.status(400).json({ success: false, error: result.message });
      return;
    }

    res.json({
      success: true,
      data: { attributed: true, referrerCode: result.referrerCode },
      message: result.message,
    });
  } catch (e: any) {
    console.error('Referrals claim error:', e);
    res.status(500).json({ success: false, error: e.message || 'Failed to link referral' });
  }
});

export default router;
