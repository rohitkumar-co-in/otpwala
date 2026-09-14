import { Router } from 'express';
import { tigerSms, TigerSmsError } from '../services/tigerSms.js';
import { calculateSellPrice } from '../services/pricing.js';
import { getCatalogFilterConfig, isServiceActive } from '../services/catalogFilter.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const serviceIcons: Record<string, string> = require('../data/tigerServiceIcons.json');
const countryFlags: Record<string, { id: number; name: string; iso: string; flagUrl: string }> = require('../data/countryFlags.json');

const router = Router();
let servicesCache: any[] | null = null;
let countriesCache: any[] | null = null;
let servicesCacheTime = 0;
let countriesCacheTime = 0;
const CATALOG_TTL = 3600_000;

const LOCAL_SERVICE_ICONS: Record<string, string> = {
  wa: '/icons/services/wa.svg', wa2: '/icons/services/wa.svg', tg: '/icons/services/tg.svg',
  eh: '/icons/services/tg.svg', go: '/icons/services/go.svg', gch: '/icons/services/go.svg',
  gms: '/icons/services/go.svg', gpy: '/icons/services/go.svg', gf: '/icons/services/go.svg',
  ig: '/icons/services/ig.svg', dr: '/icons/services/dr.svg', fb: '/icons/services/fb.svg',
  tw: '/icons/services/tw.svg', lf: '/icons/services/lf.svg', mm: '/icons/services/mm.svg',
  wx: '/icons/services/wx.svg', am: '/icons/services/am.svg', nf: '/icons/services/nf.svg',
  ds: '/icons/services/ds.svg', ub: '/icons/services/ub.svg', fu: '/icons/services/fu.svg',
  oi: '/icons/services/oi.svg', so: '/icons/services/so.svg', spot: '/icons/services/so.svg',
  ln: '/icons/services/ln.svg', rd: '/icons/services/rd.svg', mt: '/icons/services/mt.svg',
  steam: '/icons/services/mt.svg', ts: '/icons/services/ts.svg', mb: '/icons/services/mb.svg',
  vi: '/icons/services/vi.svg', me: '/icons/services/me.svg',
};

function getServiceIcon(code: string, name: string): string {
  const lowerCode = code.toLowerCase();
  const iconId = serviceIcons[name.toLowerCase().trim()] || serviceIcons[lowerCode] || null;
  return LOCAL_SERVICE_ICONS[lowerCode]
    || (iconId ? `https://tiger-sms.com/img/service/${iconId}.svg` : 'https://tiger-sms.com/img/service/unknown.svg');
}

async function getCachedServices() {
  const now = Date.now();
  if (!servicesCache || now - servicesCacheTime > CATALOG_TTL) {
    servicesCache = await tigerSms.getServicesList('en');
    servicesCacheTime = now;
  }
  return servicesCache || [];
}

async function getCachedCountries() {
  const now = Date.now();
  if (!countriesCache || now - countriesCacheTime > CATALOG_TTL) {
    countriesCache = await tigerSms.getCountries();
    countriesCacheTime = now;
  }
  return countriesCache || [];
}

/** Returns Tiger services. Featured ordering is controlled only by the admin setting. */
router.get('/services', async (req: AuthenticatedRequest, res) => {
  try {
    const [tigerServices, config] = await Promise.all([getCachedServices(), getCatalogFilterConfig()]);
    const featured = new Set(config.featuredServices.map((code) => code.toLowerCase()));
    const featuredOnly = req.query.featured === 'true';
    const sortOption = (req.query.sort as string) || 'featured';
    const services = tigerServices
      .filter((service) => !config.disabledServices.includes(service.code.toLowerCase()))
      .filter((service) => !featuredOnly || featured.has(service.code.toLowerCase()))
      .map((service) => ({
        code: service.code,
        name: service.name,
        iconUrl: getServiceIcon(service.code, service.name),
        isFeatured: featured.has(service.code.toLowerCase()),
      }));

    services.sort((a, b) => {
      if (sortOption === 'name_desc') return b.name.localeCompare(a.name);
      if (sortOption === 'name_asc') return a.name.localeCompare(b.name);
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json({ success: true, data: services });
  } catch (e) {
    console.error('Error fetching services:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch services' });
  }
});

/** Returns countries supplied by Tiger, excluding only those disabled by the admin. */
router.get('/countries', async (req: AuthenticatedRequest, res) => {
  try {
    const [tigerCountries, { disabledCountries }] = await Promise.all([getCachedCountries(), getCatalogFilterConfig()]);
    const sortOption = (req.query.sort as string) || 'name_asc';
    const countries = tigerCountries
      .filter((country) => !disabledCountries.includes(Number(country.id)))
      .map((country) => {
        const flag = countryFlags[String(country.id)];
        return {
          id: country.id,
          name: country.eng,
          iso: flag?.iso || 'un',
          flagUrl: flag?.flagUrl || 'https://flagcdn.com/un.svg',
        };
      });
    countries.sort((a, b) => sortOption === 'name_desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
    res.json({ success: true, data: countries });
  } catch (e) {
    console.error('Error fetching countries:', e);
    res.status(500).json({ success: false, error: 'Failed to fetch countries' });
  }
});

/** Returns Tiger's live stock/cost, converted with the configured pricing rules. */
router.get('/services/:code/countries', async (req: AuthenticatedRequest, res) => {
  try {
    const { code } = req.params;
    const sortOption = (req.query.sort as string) || 'name_asc';
    if (!(await isServiceActive(code))) {
      res.status(404).json({ success: false, error: 'Service is currently unavailable' });
      return;
    }

    const [livePrices, config, tigerCountries] = await Promise.all([
      tigerSms.getPrices(code), getCatalogFilterConfig(), getCachedCountries(),
    ]);
    const countryMap = new Map(tigerCountries.map((country) => [String(country.id), country.eng]));
    const countries: any[] = [];
    for (const [countryKey, serviceData] of Object.entries(livePrices)) {
      const countryId = Number.parseInt(countryKey, 10);
      if (!Number.isFinite(countryId) || config.disabledCountries.includes(countryId)) continue;
      const tigerOffer = (serviceData as any)?.[code];
      if (!tigerOffer) continue;
      const priceUsd = Number.parseFloat(String(tigerOffer.cost ?? '0'));
      const available = Number.parseInt(String(tigerOffer.count ?? '0'), 10);
      if (available <= 0 || !Number.isFinite(priceUsd) || priceUsd <= 0) continue;
      const flag = countryFlags[String(countryId)];
      countries.push({
        id: countryId,
        countryId,
        name: countryMap.get(String(countryId)) || `Country ${countryId}`,
        iso: flag?.iso || 'un',
        flagUrl: flag?.flagUrl || 'https://flagcdn.com/un.svg',
        available,
        count: available,
        priceInr: await calculateSellPrice(priceUsd, code, countryId, req.userId),
        priceUsd,
      });
    }

    countries.sort((a, b) => {
      if (sortOption === 'name_desc') return b.name.localeCompare(a.name);
      if (sortOption === 'price_asc') return a.priceInr - b.priceInr || a.priceUsd - b.priceUsd;
      if (sortOption === 'price_desc') return b.priceInr - a.priceInr || b.priceUsd - a.priceUsd;
      if (sortOption === 'stock_desc') return b.available - a.available || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
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
