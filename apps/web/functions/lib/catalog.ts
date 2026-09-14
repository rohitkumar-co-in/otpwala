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

export async function getDisabledCatalog(env?: any): Promise<{ disabledServices: string[]; disabledCountries: number[]; featuredServices: string[] }> {
  const supabase = getSupabaseAdmin(env);
  try {
    const { data } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['disabled_services', 'disabled_countries', 'featured_services']);

    let disabledServices: string[] = [];
    let disabledCountries: number[] = [];
    let featuredServices: string[] = [];

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
    });

    return { disabledServices, disabledCountries, featuredServices };
  } catch {
    return { disabledServices: [], disabledCountries: [], featuredServices: [] };
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
          ? `https://tiger-sms.com/img/service/${iconId}.svg`
          : 'https://tiger-sms.com/img/service/unknown.svg');

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

  const flags = countryFlags as Record<string, { id: number; name: string; iso: string; flagUrl: string }>;

  const countries = tigerCountries
    .filter((c) => !disabledCountries.includes(Number(c.id)))
    .map((c) => {
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
  const [{ disabledCountries }, allCountries, livePrices] = await Promise.all([
    getDisabledCatalog(env),
    tiger.getCountries(),
    tiger.getPrices(serviceCode),
  ]);

  const flags = countryFlags as Record<string, { id: number; name: string; iso: string; flagUrl: string }>;
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
    const meta = flags[countryIdStr];
    const iso = meta?.iso || '';
    const isoUpper = iso.toUpperCase();
    const flagUrl = meta?.flagUrl || (isoUpper ? `https://tiger-sms.com/img/country/${isoUpper}.svg` : 'https://flagcdn.com/un.svg');

    results.push({
      countryId,
      id: countryId,
      name: countryMap.get(countryIdStr) || `Country ${countryId}`,
      iso,
      flagUrl,
      count: stock,
      available: stock,
      priceInr,
      priceUsd: costPriceUsd,
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}
