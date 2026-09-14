import serviceIcons from '../data/tigerServiceIcons.json';
import countryFlags from '../data/countryFlags.json';
import { TigerSmsClient } from './tiger';
import { calculateSellPrice } from './pricing';
import { getSupabaseAdmin } from './supabase';

// Normalize a service name for icon lookup:
// Strips non-alphanumeric chars, lowercases, collapses spaces
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\u0400-\u04ff]/g, '').trim();
}

// Build a lookup map: normalizedKey -> iconId
const _icons = serviceIcons as Record<string, string>;
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

const POPULAR_SERVICES: Record<string, { rank: number; category: string; deliveryRate: number; baseMinUsd: number }> = {
  wa: { rank: 1, category: 'social', deliveryRate: 98.8, baseMinUsd: 0.15 },
  tg: { rank: 2, category: 'social', deliveryRate: 98.5, baseMinUsd: 0.12 },
  go: { rank: 3, category: 'tech', deliveryRate: 97.9, baseMinUsd: 0.14 },
  ig: { rank: 4, category: 'social', deliveryRate: 97.4, baseMinUsd: 0.12 },
  dr: { rank: 5, category: 'tech', deliveryRate: 98.2, baseMinUsd: 0.18 },
  fb: { rank: 6, category: 'social', deliveryRate: 96.8, baseMinUsd: 0.10 },
  tw: { rank: 7, category: 'social', deliveryRate: 96.5, baseMinUsd: 0.10 },
  am: { rank: 8, category: 'shopping', deliveryRate: 96.6, baseMinUsd: 0.14 },
  mm: { rank: 9, category: 'tech', deliveryRate: 97.2, baseMinUsd: 0.12 },
  lf: { rank: 10, category: 'social', deliveryRate: 96.4, baseMinUsd: 0.10 },
  nf: { rank: 11, category: 'entertainment', deliveryRate: 96.0, baseMinUsd: 0.15 },
  wx: { rank: 12, category: 'tech', deliveryRate: 98.1, baseMinUsd: 0.18 },
  ds: { rank: 13, category: 'social', deliveryRate: 97.0, baseMinUsd: 0.12 },
  ub: { rank: 14, category: 'tech', deliveryRate: 97.7, baseMinUsd: 0.15 },
};

const POPULAR_COUNTRIES: Record<number, { rank: number; deliveryRate: number }> = {
  187: { rank: 1, deliveryRate: 99.2 },
  12: { rank: 2, deliveryRate: 98.9 },
  22: { rank: 3, deliveryRate: 98.6 },
  16: { rank: 4, deliveryRate: 98.4 },
  43: { rank: 5, deliveryRate: 98.3 },
  48: { rank: 6, deliveryRate: 98.5 },
  6: { rank: 7, deliveryRate: 97.8 },
  10: { rank: 8, deliveryRate: 97.5 },
  4: { rank: 9, deliveryRate: 97.1 },
  73: { rank: 10, deliveryRate: 96.9 },
  7: { rank: 11, deliveryRate: 97.0 },
  36: { rank: 12, deliveryRate: 98.7 },
  175: { rank: 13, deliveryRate: 98.9 },
  78: { rank: 14, deliveryRate: 98.2 },
};

export async function getDisabledCatalog(env?: any): Promise<{ disabledServices: string[]; disabledCountries: number[] }> {
  const supabase = getSupabaseAdmin(env);
  try {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['disabled_services', 'disabled_countries']);

    let disabledServices: string[] = [];
    let disabledCountries: number[] = [];

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
    });

    return { disabledServices, disabledCountries };
  } catch {
    return { disabledServices: [], disabledCountries: [] };
  }
}

export async function getServices(env?: any) {
  const tiger = new TigerSmsClient(env);
  const [{ disabledServices }, tigerServices] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getServicesList(),
  ]);



  const services = await Promise.all(
    tigerServices
      .filter((s) => !disabledServices.includes(s.code.toLowerCase()))
      .map(async (s) => {
        const lowerCode = s.code.toLowerCase();
        const pop = POPULAR_SERVICES[lowerCode];
        const iconId = lookupServiceIcon(s.code, s.name);
        const iconUrl = (iconId && iconId !== 'unknown')
          ? `https://tiger-sms.com/img/service/${iconId}.svg`
          : 'https://tiger-sms.com/img/service/unknown.svg';

        const baseUsd = pop?.baseMinUsd || 0.15;
        const minPriceInr = await calculateSellPrice(baseUsd, s.code, 22, undefined, env);

        return {
          code: s.code,
          name: s.name,
          iconUrl,
          isPopular: !!pop,
          rank: pop?.rank || 9999,
          category: pop?.category || 'other',
          deliveryRate: pop?.deliveryRate || 95.0,
          minPriceInr,
        };
      })
  );

  services.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return services;
}

export async function getCountries(env?: any) {
  const tiger = new TigerSmsClient(env);
  const [{ disabledCountries }, tigerCountries] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getCountries(),
  ]);

  const flags = countryFlags as Record<string, { id: number; name: string; iso: string; flagUrl: string }>;

  const countries = tigerCountries
    .filter((c) => !disabledCountries.includes(Number(c.id)))
    .map((c) => {
      const pop = POPULAR_COUNTRIES[c.id];
      const meta = flags[String(c.id)];
      const iso = meta?.iso || '';
      // Tiger uses uppercase ISO codes (e.g. UA.svg, KZ.svg)
      const isoUpper = iso.toUpperCase();
      const flagUrl = meta?.flagUrl ||
        (isoUpper ? `https://tiger-sms.com/img/country/${isoUpper}.svg` : 'https://flagcdn.com/un.svg');

      return {
        id: c.id,
        name: c.eng,
        iso,
        flagUrl,
        isPopular: !!pop,
        rank: pop?.rank || 9999,
        deliveryRate: pop?.deliveryRate || 95.0,
      };
    });

  countries.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
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
  const [{ disabledCountries }, allCountries, freePrices] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getCountries(),
    tiger.getFreePrices(serviceCode),
  ]);

  const flags = countryFlags as Record<string, { id: number; name: string; iso: string; flagUrl: string }>;
  const countryMap = new Map(allCountries.map((c: any) => [String(c.id), c.eng]));

  const results: any[] = [];

  for (const [countryIdStr, serviceObj] of Object.entries(freePrices)) {
    const countryId = parseInt(countryIdStr, 10);
    if (isNaN(countryId) || disabledCountries.includes(countryId)) continue;

    const sData = (serviceObj as any)?.[serviceCode];
    if (!sData || !sData.prices) continue;

    const priceList = Object.keys(sData.prices).map(Number);
    if (priceList.length === 0) continue;

    const minPriceUsd = Math.min(...priceList);
    const stock = Math.max(...(Object.values(sData.prices) as number[]));

    if (stock <= 0 || !isFinite(minPriceUsd)) continue;

    const priceInr = await calculateSellPrice(minPriceUsd, serviceCode, countryId, userId, env);
    const meta = flags[countryIdStr];
    const iso = meta?.iso || '';
    const flagUrl = meta?.flagUrl || (iso ? `https://tiger-sms.com/img/country/${iso}.svg` : 'https://flagcdn.com/un.svg');
    const pop = POPULAR_COUNTRIES[countryId];

    results.push({
      countryId,
      id: countryId,
      name: countryMap.get(countryIdStr) || `Country ${countryId}`,
      iso,
      flagUrl,
      count: stock,
      available: stock,
      priceInr,
      priceUsd: minPriceUsd,
      isPopular: !!pop,
      rank: pop?.rank || 9999,
      deliveryRate: pop?.deliveryRate || 95.0,
    });
  }

  results.sort((a, b) => {
    if (a.isPopular !== b.isPopular) return a.isPopular ? -1 : 1;
    return a.rank - b.rank || b.available - a.available;
  });
  return results;
}
