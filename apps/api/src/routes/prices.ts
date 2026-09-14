import { Router } from 'express';
import { tigerSms, TigerSmsError } from '../services/tigerSms.js';
import { calculateSellPrice } from '../services/pricing.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/prices/:service/:country or /api/prices?service=wa&country=187
 * Returns pricing + availability for a service/country pair.
 */
router.get(['/', '/:service/:country'], async (req: AuthenticatedRequest, res) => {
  try {
    const service = req.params.service || (req.query.service as string);
    const countryRaw = req.params.country || (req.query.country as string);
    const countryCode = parseInt(countryRaw || '', 10);

    if (!service || isNaN(countryCode)) {
      res.status(400).json({ success: false, error: 'service and country required' });
      return;
    }

    const priceData = await tigerSms.getPricesV3(service, countryCode);
    const countryPrices = priceData[String(countryCode)];

    if (!countryPrices || !countryPrices[service]) {
      res.json({
        success: true,
        data: { available: false, count: 0, priceInr: 0 },
      });
      return;
    }

    const info = countryPrices[service];
    const priceInr = await calculateSellPrice(info.price, service, countryCode, req.userId);

    res.json({
      success: true,
      data: {
        available: info.count > 0,
        count: info.count,
        priceInr,
        priceUsd: info.price,
      },
    });
  } catch (e) {
    if (e instanceof TigerSmsError) {
      res.status(400).json({ success: false, error: e.message });
      return;
    }
    console.error('Error fetching prices:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch prices' });
  }
});

export default router;
