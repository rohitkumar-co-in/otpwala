import { Router } from 'express';
import { tigerSms, TigerSmsError } from '../services/tigerSms.js';
import { calculateSellPrice } from '../services/pricing.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/prices/:service/:country
 * Returns pricing + availability for a service/country pair.
 */
router.get('/:service/:country', async (req: AuthenticatedRequest, res) => {
  try {
    const { service, country } = req.params;
    const countryCode = parseInt(country);

    if (isNaN(countryCode)) {
      res.status(400).json({ success: false, error: 'Invalid country code' });
      return;
    }

    const priceData = await tigerSms.getPricesV3(service, countryCode);
    const countryPrices = priceData[country];

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
