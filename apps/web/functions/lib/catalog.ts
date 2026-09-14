import serviceIcons from '../data/tigerServiceIcons.json';
import { TigerSmsClient } from './tiger';
import { calculateSellPrice } from './pricing';
import { getSupabaseAdmin } from './supabase';

// Normalize a service name for icon lookup:
// Strips non-alphanumeric chars, lowercases, collapses spaces
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]/g, '').trim();
}

// Build a lookup map: normalizedKey -> iconId
function unwrapJsonRecord<T>(value: unknown): Record<string, T> {
  const imported = value as any;
  const record = imported?.default && typeof imported.default === 'object' ? imported.default : imported;
  return record && typeof record === 'object' ? record as Record<string, T> : {};
}

const _icons = unwrapJsonRecord<string>(serviceIcons);
const _iconLookup: Record<string, string> = {};
for (const [key, val] of Object.entries(_icons)) {
  _iconLookup[normalizeName(key)] = val;
  // Also store the raw lowercased key
  _iconLookup[key.toLowerCase().trim()] = val;
}

function lookupServiceIcon(code: string, name: string): string | null {
  // 1. Try code directly (e.g. "wa", "tg")
  if (_iconLookup[code.toLowerCase()]) return _iconLookup[code.toLowerCase()];
  // 2. Try exact lowercased name
  const lowerName = name.toLowerCase().trim();
  if (_iconLookup[lowerName]) return _iconLookup[lowerName];
  // 3. Try normalized name (strip special chars)
  const norm = normalizeName(name);
  if (_iconLookup[norm]) return _iconLookup[norm];
  // 4. Try first word of name (e.g. "WhatsApp Business" -> "whatsapp")
  const firstWord = normalizeName(name.split(/[^a-z0-9]/i)[0]);
  if (firstWord && _iconLookup[firstWord]) return _iconLookup[firstWord];
  return null;
}

type CatalogConfig = {
  disabledServices: string[];
  disabledCountries: number[];
  featuredServices: string[];
  featuredCountries: number[];
};

const tigerServiceSlugCache = new Map<string, string>();
const tigerDeliveryCache = new Map<string, { names: string[]; expiresAt: number }>();

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCountryName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Provider country IDs have changed over time, so resolving flags by a saved
// numeric ID can pair a country with the wrong flag. Build the lookup from the
// current country name instead and keep aliases for provider-specific labels.
const COUNTRY_ISO_ALIASES: Record<string, string> = {
  myanmar: 'mm',
  unitedstatesvirt: 'us',
  unitedkingdom: 'gb',
  hongkong: 'hk',
  drcongo: 'cd',
  macau: 'mo',
  laopeoples: 'la',
  cotedivoireivorycoast: 'ci',
  argentinas: 'ar',
  turkey: 'tr',
  czechrepublic: 'cz',
  trinidadandtobago: 'tt',
  swaziland: 'sz',
  bosniaandherzegovina: 'ba',
  syrianarabrepublic: 'sy',
  bruneidarussalam: 'bn',
  saintkittsandnevis: 'kn',
  reunion: 're',
  congo: 'cg',
  saintlucia: 'lc',
  saintvincent: 'vc',
  antiguaandbarbuda: 'ag',
  saotomeandprincipe: 'st',
  macedonia: 'mk',
  palestine: 'ps',
  korea: 'kr',
  unitedstatesvip: 'us',
};

const countryIsoByName = new Map<string, string>();
try {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const iso = String.fromCharCode(first, second);
      const name = displayNames.of(iso);
      if (name && name !== iso && name !== 'Unknown Region') {
        const normalizedName = normalizeCountryName(name);
        // Intl recognizes retired aliases too (for example DY for Benin and
        // VD for Vietnam). Canonicalize them before creating the flag URL.
        const canonicalIso = new Intl.Locale(`und-${iso}`).maximize().region || iso;
        if (!countryIsoByName.has(normalizedName)) {
          countryIsoByName.set(normalizedName, canonicalIso.toLowerCase());
        }
      }
    }
  }
} catch {}
for (const [name, iso] of Object.entries(COUNTRY_ISO_ALIASES)) {
  countryIsoByName.set(name, iso);
}

async function fetchTigerPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': 'OTPWala/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function getTigerServiceSlug(serviceName: string): Promise<string> {
  const normalizedName = normalizeName(serviceName);
  const cached = tigerServiceSlugCache.get(normalizedName);
  if (cached) return cached;

  const directoryHtml = await fetchTigerPage('https://tiger-sms.com/services');
  const linkPattern = /<a[^>]+href=["'](?:https:\/\/tiger-sms\.com)?\/services\/([^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of directoryHtml.matchAll(linkPattern)) {
    const slug = match[1].replace(/^\/+|\/+$/g, '');
    const label = stripHtml(match[2]);
    if (label) tigerServiceSlugCache.set(normalizeName(label), slug);
  }

  return tigerServiceSlugCache.get(normalizedName) || normalizedName;
}

async function getTigerHighDeliveryCountries(serviceName: string): Promise<string[]> {
  const slug = await getTigerServiceSlug(serviceName);
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

export async function getDisabledCatalog(env?: any): Promise<CatalogConfig> {
  const supabase = getSupabaseAdmin(env);
  try {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['disabled_services', 'disabled_countries', 'featured_services', 'featured_countries']);

    let disabledServices: string[] = [];
    let disabledCountries: number[] = [];
    let featuredServices: string[] = [];
    let featuredCountries: number[] = [];

    (data || []).forEach((r: any) => {
      let val = r.value;
      if (typeof val === 'string') {
        try { val = JSON.parse(val); } catch {}
      }
      if (r.key === 'disabled_services' && Array.isArray(val)) {
        disabledServices = val.map((s: any) => String(s).toLowerCase());
      }
      if (r.key === 'disabled_countries' && Array.isArray(val)) {
        disabledCountries = val.map((c: any) => Number(c));
      }
      if (r.key === 'featured_services' && Array.isArray(val)) {
        featuredServices = val.map((s: any) => String(s).toLowerCase());
      }
      if (r.key === 'featured_countries' && Array.isArray(val)) {
        featuredCountries = val.map((c: any) => Number(c)).filter(Number.isFinite);
      }
    });

    return { disabledServices, disabledCountries, featuredServices, featuredCountries };
  } catch {
    return { disabledServices: [], disabledCountries: [], featuredServices: [], featuredCountries: [] };
  }
}

export async function getServices(featuredOnly = false, env?: any) {
  const tiger = new TigerSmsClient(env);
  const [{ disabledServices, featuredServices }, tigerServices] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getServicesList(),
  ]);

  const candidateServices = featuredOnly
    ? tigerServices.filter((s) => featuredServices.includes(s.code.toLowerCase()))
    : tigerServices;

  const services = await Promise.all(
    candidateServices
      .filter((s) => !disabledServices.includes(s.code.toLowerCase()))
      .map(async (s) => {
        const lowerCode = s.code.toLowerCase();
        
        // Consistent local SVG icons when a matching brand asset exists
        const LOCAL_SERVICE_ICONS: Record<string, string> = {
          wa: '/icons/services/wa.svg',
          wa2: '/icons/services/wa.svg',
          tg: '/icons/services/tg.svg',
          eh: '/icons/services/tg.svg',
          go: '/icons/services/go.svg',
          gch: '/icons/services/go.svg',
          gms: '/icons/services/go.svg',
          gpy: '/icons/services/go.svg',
          gf: '/icons/services/go.svg',
          ig: '/icons/services/ig.svg',
          dr: '/icons/services/dr.svg',
          fb: '/icons/services/fb.svg',
          tw: '/icons/services/tw.svg',
          lf: '/icons/services/lf.svg',
          mm: '/icons/services/mm.svg',
          wx: '/icons/services/wx.svg',
          am: '/icons/services/am.svg',
          nf: '/icons/services/nf.svg',
          ds: '/icons/services/ds.svg',
          ub: '/icons/services/ub.svg',
          fu: '/icons/services/fu.svg',
          oi: '/icons/services/oi.svg',
          so: '/icons/services/so.svg',
          spot: '/icons/services/so.svg',
          ln: '/icons/services/ln.svg',
          rd: '/icons/services/rd.svg',
          mt: '/icons/services/mt.svg',
          steam: '/icons/services/mt.svg',
          ts: '/icons/services/ts.svg',
          mb: '/icons/services/mb.svg',
          vi: '/icons/services/vi.svg',
          me: '/icons/services/me.svg',
        };

        const iconId = lookupServiceIcon(s.code, s.name);
        const iconUrl = LOCAL_SERVICE_ICONS[lowerCode] || ((iconId && iconId !== 'unknown')
          ? `/api/catalog/service-icon/${encodeURIComponent(iconId)}`
          : '/icons/services/default.svg');

        return {
          code: s.code,
          name: s.name,
          iconUrl,
          isFeatured: featuredServices.includes(lowerCode),
        };
      })
  );

  services.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.name.localeCompare(b.name));
  return services;
}

export async function getCountries(env?: any) {
  const tiger = new TigerSmsClient(env);
  const [{ disabledCountries }, tigerCountries] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getCountries(),
  ]);

  const countries = tigerCountries
    .filter((c) => !disabledCountries.includes(Number(c.id)))
    .map((c) => {
      const iso = countryIsoByName.get(normalizeCountryName(c.eng)) || '';
      const flagUrl = iso ? `/api/catalog/country-flag/${iso}` : '/icons/services/default.svg';

      return {
        id: c.id,
        name: c.eng,
        iso,
        flagUrl,
      };
    });

  countries.sort((a, b) => a.name.localeCompare(b.name));
  return countries;
}

export async function setServiceActiveStatus(code: string, enabled: boolean, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { disabledServices, disabledCountries } = await getDisabledCatalog(env);
  const lowerCode = code.toLowerCase();
  let updatedServices = [...disabledServices];

  if (enabled) {
    updatedServices = updatedServices.filter((c) => c !== lowerCode);
  } else {
    if (!updatedServices.includes(lowerCode)) updatedServices.push(lowerCode);
  }

  await supabase.from('settings').upsert({ key: 'disabled_services', value: JSON.stringify(updatedServices), updated_at: new Date().toISOString() });
  return { disabledServices: updatedServices, disabledCountries };
}

export async function setCountryActiveStatus(countryId: number, enabled: boolean, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { disabledServices, disabledCountries } = await getDisabledCatalog(env);
  const idNum = Number(countryId);
  let updatedCountries = [...disabledCountries];

  if (enabled) {
    updatedCountries = updatedCountries.filter((id) => id !== idNum);
  } else {
    if (!updatedCountries.includes(idNum)) updatedCountries.push(idNum);
  }

  await supabase.from('settings').upsert({ key: 'disabled_countries', value: JSON.stringify(updatedCountries), updated_at: new Date().toISOString() });
  return { disabledServices, disabledCountries: updatedCountries };
}

export async function setFeaturedService(code: string, featured: boolean, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { featuredServices } = await getDisabledCatalog(env);
  const normalizedCode = code.toLowerCase();
  const updated = featured
    ? Array.from(new Set([...featuredServices, normalizedCode]))
    : featuredServices.filter((item) => item !== normalizedCode);
  await supabase.from('settings').upsert({
    key: 'featured_services',
    value: JSON.stringify(updated),
    updated_at: new Date().toISOString(),
  });
  return { featuredServices: updated };
}

export async function setFeaturedCountry(countryId: number, featured: boolean, env?: any) {
  const supabase = getSupabaseAdmin(env);
  const { featuredCountries } = await getDisabledCatalog(env);
  const normalizedId = Number(countryId);
  const updated = featured
    ? Array.from(new Set([...featuredCountries, normalizedId]))
    : featuredCountries.filter((item) => item !== normalizedId);
  await supabase.from('settings').upsert({
    key: 'featured_countries',
    value: JSON.stringify(updated),
    updated_at: new Date().toISOString(),
  });
  return { featuredCountries: updated };
}

export async function setDisabledCatalog(services?: string[], countries?: number[], env?: any) {
  const supabase = getSupabaseAdmin(env);

  if (services !== undefined) {
    await supabase.from('settings').upsert({ key: 'disabled_services', value: JSON.stringify(services.map((s) => s.toLowerCase())), updated_at: new Date().toISOString() });
  }

  if (countries !== undefined) {
    await supabase.from('settings').upsert({ key: 'disabled_countries', value: JSON.stringify(countries.map((c) => Number(c))), updated_at: new Date().toISOString() });
  }

  return getDisabledCatalog(env);
}

export async function getServiceCountries(serviceCode: string, userId?: string, env?: any) {
  const tiger = new TigerSmsClient(env);
  const [{ disabledCountries, featuredCountries }, allCountries, livePrices, allServices] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getCountries(),
    tiger.getPrices(serviceCode),
    tiger.getServicesList(),
  ]);
  const serviceName = allServices.find((service: any) => service.code.toLowerCase() === serviceCode.toLowerCase())?.name || serviceCode;
  const highDeliveryNames = await getTigerHighDeliveryCountries(serviceName);
  const deliveryRanks = new Map(highDeliveryNames.map((name, index) => [normalizeName(name), index + 1]));

  const countryMap = new Map(allCountries.map((c: any) => [String(c.id), c.eng]));

  const results: any[] = [];

  for (const [countryIdStr, serviceObj] of Object.entries(livePrices)) {
    const countryId = parseInt(countryIdStr, 10);
    if (isNaN(countryId) || disabledCountries.includes(countryId)) continue;

    const sData = (serviceObj as any)?.[serviceCode];
    if (!sData) continue;

    const costPriceUsd = parseFloat(String(sData.cost ?? '0'));
    const stock = parseInt(String(sData.count ?? '0'), 10);

    if (stock <= 0 || isNaN(costPriceUsd) || costPriceUsd <= 0) continue;

    const priceInr = await calculateSellPrice(costPriceUsd, serviceCode, countryId, userId, env);
    const countryName = countryMap.get(countryIdStr) || `Country ${countryId}`;
    const iso = countryIsoByName.get(normalizeCountryName(countryName)) || '';
    const flagUrl = iso ? `/api/catalog/country-flag/${iso}` : '/icons/services/default.svg';

    results.push({
      countryId,
      id: countryId,
      name: countryName,
      iso,
      flagUrl,
      count: stock,
      available: stock,
      priceInr,
      priceUsd: costPriceUsd,
      isHighDelivery: deliveryRanks.has(normalizeName(countryMap.get(countryIdStr) || '')),
      deliveryRank: deliveryRanks.get(normalizeName(countryMap.get(countryIdStr) || '')) || null,
      isPopular: featuredCountries.includes(countryId),
    });
  }

  results.sort((a, b) => {
    if (a.isHighDelivery !== b.isHighDelivery) return a.isHighDelivery ? -1 : 1;
    if (a.isHighDelivery && b.isHighDelivery) return a.deliveryRank - b.deliveryRank;
    if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return results;
}
