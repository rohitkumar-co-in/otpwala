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
const SERVICES_TTL = 10_000;
const tigerServiceSlugCache = new Map<string, string>();
const tigerDeliveryCache = new Map<string, { names: string[]; expiresAt: number }>();

function normalizeCatalogName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]/g, '').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTigerPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': 'OTPWala/1.0' },
      signal: controller.signal,
    });
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function getTigerHighDeliveryCountries(serviceName: string): Promise<string[]> {
  const normalizedName = normalizeCatalogName(serviceName);
  if (!tigerServiceSlugCache.has(normalizedName)) {
    const directoryHtml = await fetchTigerPage('https://tiger-sms.com/services');
    const linkPattern = /<a[^>]+href=["'](?:https:\/\/tiger-sms\.com)?\/services\/([^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of directoryHtml.matchAll(linkPattern)) {
      const label = stripHtml(match[2]);
      if (label) tigerServiceSlugCache.set(normalizeCatalogName(label), match[1].replace(/^\/+|\/+$/g, ''));
    }
  }

  const slug = tigerServiceSlugCache.get(normalizedName) || normalizedName;
  const cached = tigerDeliveryCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) return cached.names;

  const pageHtml = await fetchTigerPage(`https://tiger-sms.com/services/${encodeURIComponent(slug)}`);
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let names: string[] = [];
  for (const match of pageHtml.matchAll(scriptPattern)) {
    try {
      const value = JSON.parse(match[1]);
      if (value?.['@type'] !== 'ItemList' || !/countries for/i.test(String(value.name || ''))) continue;
      names = (value.itemListElement || [])
        .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
        .map((item: any) => String(item.name || '').trim())
        .filter(Boolean);
      break;
    } catch {}
  }
  tigerDeliveryCache.set(slug, { names, expiresAt: Date.now() + 15 * 60_000 });
  return names;
}

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
  if (!servicesCache || now - servicesCacheTime > SERVICES_TTL) {
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
          flagUrl: flag?.iso ? `https://flagcdn.com/${flag.iso}.svg` : 'https://flagcdn.com/un.svg',
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
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { code } = req.params;
    const sortOption = (req.query.sort as string) || 'name_asc';
    if (!(await isServiceActive(code))) {
      res.status(404).json({ success: false, error: 'Service is currently unavailable' });
      return;
    }

    const [livePrices, config, tigerCountries] = await Promise.all([
      tigerSms.getLivePrices(code), getCatalogFilterConfig(), getCachedCountries(),
    ]);
    const serviceName = code;
    const highDeliveryNames = await Promise.race([
      getTigerHighDeliveryCountries(serviceName),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 250)),
    ]);
    const deliveryRanks = new Map(highDeliveryNames.map((name, index) => [normalizeCatalogName(name), index + 1]));
    const countryMap = new Map(tigerCountries.map((country) => [String(country.id), country.eng]));
    const countries = (await Promise.all(Object.entries(livePrices).map(async ([countryKey, serviceData]) => {
      const countryId = Number.parseInt(countryKey, 10);
      if (!Number.isFinite(countryId) || config.disabledCountries.includes(countryId)) return null;
      const tigerOffer = (serviceData as any)?.[code];
      if (!tigerOffer) return null;
      const priceUsd = Number.parseFloat(String(tigerOffer.cost ?? '0'));
      const available = Number.parseInt(String(tigerOffer.count ?? '0'), 10);
      if (available <= 0 || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
      const flag = countryFlags[String(countryId)];
      return {
        id: countryId,
        countryId,
        name: countryMap.get(String(countryId)) || `Country ${countryId}`,
        iso: flag?.iso || 'un',
        flagUrl: flag?.iso ? `https://flagcdn.com/${flag.iso}.svg` : 'https://flagcdn.com/un.svg',
        available,
        count: available,
        priceInr: await calculateSellPrice(priceUsd, code, countryId, req.userId, req.userRole),
        priceUsd,
        isHighDelivery: deliveryRanks.has(normalizeCatalogName(countryMap.get(String(countryId)) || '')),
        deliveryRank: deliveryRanks.get(normalizeCatalogName(countryMap.get(String(countryId)) || '')) || null,
        isPopular: config.featuredCountries.includes(countryId),
      };
    }))).filter(Boolean) as any[];

    countries.sort((a, b) => {
      if (a.isHighDelivery !== b.isHighDelivery) return a.isHighDelivery ? -1 : 1;
      if (a.isHighDelivery && b.isHighDelivery) return a.deliveryRank - b.deliveryRank;
      if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
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
