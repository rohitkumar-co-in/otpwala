import { Router } from 'express';
import { tigerSms, TigerSmsError } from '../services/tigerSms.js';
import { calculateSellPrice } from '../services/pricing.js';
import { getCatalogFilterConfig, isServiceActive } from '../services/catalogFilter.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const serviceIcons: Record<string, string> = require('../data/tigerServiceIcons.json');
const countryFlags: Record<string, { id: number; name: string; iso: string; flagUrl: string }> = require('../data/countryFlags.json');

const router = Router();

// Cache for catalog data
let servicesCache: any[] | null = null;
let countriesCache: any[] | null = null;
let servicesCacheTime = 0;
let countriesCacheTime = 0;
const CATALOG_TTL = 3600_000; // 1 hour

const POPULAR_SERVICES: Record<string, { rank: number; category: string; deliveryRate: number; baseMinUsd: number }> = {
  wa: { rank: 1, category: 'social', deliveryRate: 98.8, baseMinUsd: 0.15 },
  tg: { rank: 2, category: 'social', deliveryRate: 98.5, baseMinUsd: 0.12 },
  go: { rank: 3, category: 'tech', deliveryRate: 97.9, baseMinUsd: 0.14 },
  ig: { rank: 4, category: 'social', deliveryRate: 97.4, baseMinUsd: 0.12 },
  dr: { rank: 5, category: 'tech', deliveryRate: 98.2, baseMinUsd: 0.18 }, // ChatGPT
  fb: { rank: 6, category: 'social', deliveryRate: 96.8, baseMinUsd: 0.10 },
  tw: { rank: 7, category: 'social', deliveryRate: 96.5, baseMinUsd: 0.10 },
  am: { rank: 8, category: 'shopping', deliveryRate: 96.6, baseMinUsd: 0.14 },
  mm: { rank: 9, category: 'tech', deliveryRate: 97.2, baseMinUsd: 0.12 },
  lf: { rank: 10, category: 'social', deliveryRate: 96.4, baseMinUsd: 0.10 }, // TikTok
  nf: { rank: 11, category: 'entertainment', deliveryRate: 96.0, baseMinUsd: 0.15 },
  wx: { rank: 12, category: 'tech', deliveryRate: 98.1, baseMinUsd: 0.18 }, // Apple
  ds: { rank: 13, category: 'social', deliveryRate: 97.0, baseMinUsd: 0.12 }, // Discord
  ub: { rank: 14, category: 'tech', deliveryRate: 97.7, baseMinUsd: 0.15 }, // Uber
};

const POPULAR_COUNTRIES: Record<number, { rank: number; deliveryRate: number }> = {
  187: { rank: 1, deliveryRate: 99.2 }, // USA
  12: { rank: 2, deliveryRate: 98.9 },  // USA Virtual
  22: { rank: 3, deliveryRate: 98.6 },  // India
  16: { rank: 4, deliveryRate: 98.4 },  // UK
  43: { rank: 5, deliveryRate: 98.3 },  // Germany
  48: { rank: 6, deliveryRate: 98.5 },  // Netherlands
  6: { rank: 7, deliveryRate: 97.8 },   // Indonesia
  10: { rank: 8, deliveryRate: 97.5 },  // Vietnam
  4: { rank: 9, deliveryRate: 97.1 },   // Philippines
  73: { rank: 10, deliveryRate: 96.9 }, // Brazil
  7: { rank: 11, deliveryRate: 97.0 },  // Malaysia
  36: { rank: 12, deliveryRate: 98.7 }, // Canada
  175: { rank: 13, deliveryRate: 98.9 },// Australia
  78: { rank: 14, deliveryRate: 98.2 }, // France
};

function getServiceDeliveryRate(code: string): number {
  const pop = POPULAR_SERVICES[code.toLowerCase()];
  if (pop) return pop.deliveryRate;
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) % 1000;
  return Math.round((90.0 + (hash % 70) / 10) * 10) / 10;
}

function getCountryDeliveryRate(countryId: number, stock: number): number {
  const pop = POPULAR_COUNTRIES[countryId];
  if (pop) return pop.deliveryRate;
  const stockBonus = Math.min(3.5, Math.log10(Math.max(10, stock)));
  const hashVal = ((countryId * 37) % 25) / 10;
  return Math.round(Math.min(97.5, Math.max(88.0, 90.0 + stockBonus + hashVal)) * 10) / 10;
}

// Background cache for service minimum prices
let serviceMinPricesUsd: Record<string, number> = {};
let serviceMinPricesTime = 0;
const PRICES_CACHE_TTL = 30 * 60_000; // 30 minutes

async function refreshMinPrices() {
  const now = Date.now();
  if (now - serviceMinPricesTime < PRICES_CACHE_TTL && Object.keys(serviceMinPricesUsd).length > 0) {
    return;
  }
  try {
    const [data, { disabledCountries }] = await Promise.all([
      tigerSms.getFreePrices(),
      getCatalogFilterConfig(),
    ]);
    const stats: Record<string, number> = {};
    for (const [cIdStr, servicesObj] of Object.entries(data)) {
      const cId = parseInt(cIdStr, 10);
      if (isNaN(cId) || disabledCountries.includes(cId)) continue;
      for (const [svcCode, svcData] of Object.entries(servicesObj)) {
        if (svcData.prices) {
          const availablePrices = Object.entries(svcData.prices)
            .filter(([_, stock]) => Number(stock) > 0)
            .map(([p]) => Number(p));
          if (availablePrices.length > 0) {
            const minP = Math.min(...availablePrices);
            if (!stats[svcCode] || minP < stats[svcCode]) {
              stats[svcCode] = minP;
            }
          }
        }
      }
    }
    if (Object.keys(stats).length > 0) {
      serviceMinPricesUsd = stats;
      serviceMinPricesTime = now;
    }
  } catch (e) {
    console.error('Failed to refresh service min prices:', e);
  }
}

// Trigger background refresh on launch
refreshMinPrices().catch(() => {});

/**
 * GET /api/services
 * Returns all enabled services with icons, delivery rates, minimum prices, and sorting.
 * Query params: ?sort=popular|name_asc|name_desc|price_asc|price_desc|delivery_desc
 */
router.get('/services', async (req: AuthenticatedRequest, res) => {
  try {
    const now = Date.now();
    if (!servicesCache || now - servicesCacheTime > CATALOG_TTL) {
      servicesCache = await tigerSms.getServicesList('en');
      servicesCacheTime = now;
    }

    const sortOption = (req.query.sort as string) || 'popular';
    const { disabledServices } = await getCatalogFilterConfig();

    const mappedServices = await Promise.all(
      (servicesCache || [])
        .filter((s) => !disabledServices.includes(s.code.toLowerCase()))
        .map(async (s) => {
          const pop = POPULAR_SERVICES[s.code.toLowerCase()];
          const normName = s.name.toLowerCase().trim();
          const iconId = serviceIcons[normName] || serviceIcons[s.code.toLowerCase()] || null;
          const iconUrl = iconId
            ? `https://tiger-sms.com/img/service/${iconId}.svg`
            : `https://tiger-sms.com/img/service/unknown.svg`;

          const deliveryRate = getServiceDeliveryRate(s.code);
          const minUsd = serviceMinPricesUsd[s.code.toLowerCase()] || pop?.baseMinUsd || 0.12;
          // Calculate sell price using active exchange rate and admin markup
          const minPriceInr = await calculateSellPrice(minUsd, s.code, 0);

          return {
            code: s.code,
            name: s.name,
            iconUrl,
            isPopular: !!pop,
            rank: pop ? pop.rank : 9999,
            category: pop ? pop.category : 'other',
            deliveryRate,
            minPriceInr,
          };
        })
    );

    // Apply sorting
    if (sortOption === 'name_asc') {
      mappedServices.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === 'name_desc') {
      mappedServices.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortOption === 'price_asc') {
      mappedServices.sort((a, b) => a.minPriceInr - b.minPriceInr || a.name.localeCompare(b.name));
    } else if (sortOption === 'price_desc') {
      mappedServices.sort((a, b) => b.minPriceInr - a.minPriceInr || a.name.localeCompare(b.name));
    } else if (sortOption === 'delivery_desc') {
      mappedServices.sort((a, b) => b.deliveryRate - a.deliveryRate || a.name.localeCompare(b.name));
    } else {
      // Popular first, then alphabetically
      mappedServices.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name);
      });
    }

    res.json({ success: true, data: mappedServices });
  } catch (e) {
    console.error('Error fetching services:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch services' });
  }
});

/**
 * GET /api/countries
 * Returns all enabled countries with SVG flag URLs, popularity, and delivery rates.
 * Query params: ?sort=popular|name_asc|name_desc|delivery_desc
 */
router.get('/countries', async (req: AuthenticatedRequest, res) => {
  try {
    const now = Date.now();
    if (!countriesCache || now - countriesCacheTime > CATALOG_TTL) {
      countriesCache = await tigerSms.getCountries();
      countriesCacheTime = now;
    }

    const sortOption = (req.query.sort as string) || 'popular';
    const { disabledCountries } = await getCatalogFilterConfig();

    const countries = (countriesCache || [])
      .filter((c) => !disabledCountries.includes(Number(c.id)))
      .map((c) => {
        const flag = countryFlags[String(c.id)];
        const pop = POPULAR_COUNTRIES[Number(c.id)];
        const deliveryRate = pop ? pop.deliveryRate : getCountryDeliveryRate(Number(c.id), 1000);
        return {
          id: c.id,
          name: c.eng,
          iso: flag ? flag.iso : 'un',
          flagUrl: flag ? flag.flagUrl : 'https://flagcdn.com/un.svg',
          isPopular: !!pop,
          rank: pop ? pop.rank : 9999,
          deliveryRate,
        };
      });

    if (sortOption === 'name_asc') {
      countries.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === 'name_desc') {
      countries.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortOption === 'delivery_desc') {
      countries.sort((a, b) => b.deliveryRate - a.deliveryRate || a.name.localeCompare(b.name));
    } else {
      countries.sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name);
      });
    }

    res.json({ success: true, data: countries });
  } catch (e) {
    console.error('Error fetching countries:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

/**
 * GET /api/services/:code/countries
 * Returns enabled countries with availability, sell price, SVG flag, popularity, and delivery rates.
 * Query params: ?sort=popular|name_asc|name_desc|price_asc|price_desc|delivery_desc|stock_desc
 */
router.get('/services/:code/countries', async (req: AuthenticatedRequest, res) => {
  try {
    const { code } = req.params;
    const sortOption = (req.query.sort as string) || 'popular';

    // Verify service is active
    const serviceActive = await isServiceActive(code);
    if (!serviceActive) {
      res.status(404).json({ success: false, error: 'Service is currently unavailable' });
      return;
    }

    // Fetch all country prices and stock in a single upstream call
    const [freePrices, { disabledCountries }] = await Promise.all([
      tigerSms.getFreePrices(code),
      getCatalogFilterConfig(),
    ]);

    // Ensure countries cache is loaded
    const now = Date.now();
    if (!countriesCache || now - countriesCacheTime > CATALOG_TTL) {
      countriesCache = await tigerSms.getCountries();
      countriesCacheTime = now;
    }

    const countryMap = new Map((countriesCache || []).map((c) => [String(c.id), c.eng]));

    const countries: any[] = [];
    for (const [cIdStr, serviceObj] of Object.entries(freePrices)) {
      const countryId = parseInt(cIdStr, 10);
      if (isNaN(countryId) || disabledCountries.includes(countryId)) continue;

      const sData = (serviceObj as any)?.[code];
      if (!sData || !sData.prices) continue;

      const priceList = Object.keys(sData.prices).map(Number);
      if (priceList.length === 0) continue;

      const minPriceUsd = Math.min(...priceList);
      const stock = Math.max(...(Object.values(sData.prices) as number[]));

      if (stock <= 0 || !isFinite(minPriceUsd)) continue;

      const priceInr = await calculateSellPrice(minPriceUsd, code, countryId, req.userId);
      const flag = countryFlags[String(countryId)];
      const pop = POPULAR_COUNTRIES[countryId];
      const deliveryRate = getCountryDeliveryRate(countryId, stock);

      countries.push({
        id: countryId,
        name: countryMap.get(String(countryId)) || `Country ${countryId}`,
        iso: flag ? flag.iso : 'un',
        flagUrl: flag ? flag.flagUrl : 'https://flagcdn.com/un.svg',
        available: stock,
        priceInr,
        deliveryRate,
        isPopular: !!pop,
        rank: pop ? pop.rank : 9999,
      });
    }

    // Apply sorting
    if (sortOption === 'name_asc') {
      countries.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOption === 'name_desc') {
      countries.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortOption === 'price_asc') {
      countries.sort((a, b) => a.priceInr - b.priceInr || b.available - a.available);
    } else if (sortOption === 'price_desc') {
      countries.sort((a, b) => b.priceInr - a.priceInr || b.available - a.available);
    } else if (sortOption === 'delivery_desc') {
      countries.sort((a, b) => b.deliveryRate - a.deliveryRate || b.available - a.available);
    } else if (sortOption === 'stock_desc') {
      countries.sort((a, b) => b.available - a.available);
    } else {
      // Popular countries first, then by availability
      countries.sort((a, b) => {
        if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return b.available - a.available;
      });
    }

    res.json({ success: true, data: countries });
  } catch (e) {
    if (e instanceof TigerSmsError) {
      res.status(400).json({ success: false, error: e.message });
      return;
    }
    console.error('Error fetching service countries:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch countries for service' });
  }
});

export default router;

