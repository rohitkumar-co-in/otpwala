import { supabaseAdmin } from '../config/supabase.js';

interface CatalogFilterConfig {
  disabledServices: string[];
  disabledCountries: number[];
}

let cachedConfig: CatalogFilterConfig | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 30_000; // 30 seconds

/**
 * Load disabled services & countries from settings table.
 */
export async function getCatalogFilterConfig(): Promise<CatalogFilterConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastFetchTime < CACHE_TTL) {
    return cachedConfig;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('key, value')
      .in('key', ['disabled_services', 'disabled_countries']);

    if (error) throw error;

    let disabledServices: string[] = [];
    let disabledCountries: number[] = [];

    (data || []).forEach((row) => {
      let parsed = row.value;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }

      if (row.key === 'disabled_services' && Array.isArray(parsed)) {
        disabledServices = parsed.map((s: any) => String(s).toLowerCase());
      }
      if (row.key === 'disabled_countries' && Array.isArray(parsed)) {
        disabledCountries = parsed.map((c: any) => Number(c));
      }
    });

    cachedConfig = { disabledServices, disabledCountries };
    lastFetchTime = now;
    return cachedConfig;
  } catch (err) {
    console.error('Error fetching catalog filter config:', err);
    return cachedConfig || { disabledServices: [], disabledCountries: [] };
  }
}

export function invalidateCatalogFilterCache() {
  cachedConfig = null;
  lastFetchTime = 0;
}

/**
 * Check if a service is enabled on the platform.
 */
export async function isServiceActive(code: string): Promise<boolean> {
  const config = await getCatalogFilterConfig();
  return !config.disabledServices.includes(code.toLowerCase());
}

/**
 * Check if a country is enabled on the platform.
 */
export async function isCountryActive(countryId: number): Promise<boolean> {
  const config = await getCatalogFilterConfig();
  return !config.disabledCountries.includes(Number(countryId));
}

/**
 * Toggle or set a service enabled/disabled status.
 */
export async function setServiceActiveStatus(code: string, enabled: boolean): Promise<CatalogFilterConfig> {
  const config = await getCatalogFilterConfig();
  const lowerCode = code.toLowerCase();
  let updatedServices = [...config.disabledServices];

  if (enabled) {
    // Remove from disabled list
    updatedServices = updatedServices.filter((c) => c !== lowerCode);
  } else {
    // Add to disabled list
    if (!updatedServices.includes(lowerCode)) {
      updatedServices.push(lowerCode);
    }
  }

  await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'disabled_services',
      value: JSON.stringify(updatedServices),
      updated_at: new Date().toISOString(),
    });

  invalidateCatalogFilterCache();
  return getCatalogFilterConfig();
}

/**
 * Toggle or set a country enabled/disabled status.
 */
export async function setCountryActiveStatus(countryId: number, enabled: boolean): Promise<CatalogFilterConfig> {
  const config = await getCatalogFilterConfig();
  const idNum = Number(countryId);
  let updatedCountries = [...config.disabledCountries];

  if (enabled) {
    // Remove from disabled list
    updatedCountries = updatedCountries.filter((id) => id !== idNum);
  } else {
    // Add to disabled list
    if (!updatedCountries.includes(idNum)) {
      updatedCountries.push(idNum);
    }
  }

  await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'disabled_countries',
      value: JSON.stringify(updatedCountries),
      updated_at: new Date().toISOString(),
    });

  invalidateCatalogFilterCache();
  return getCatalogFilterConfig();
}

/**
 * Bulk set disabled services or countries.
 */
export async function setDisabledCatalog(services?: string[], countries?: number[]): Promise<CatalogFilterConfig> {
  if (services !== undefined) {
    await supabaseAdmin.from('settings').upsert({
      key: 'disabled_services',
      value: JSON.stringify(services.map((s) => s.toLowerCase())),
      updated_at: new Date().toISOString(),
    });
  }

  if (countries !== undefined) {
    await supabaseAdmin.from('settings').upsert({
      key: 'disabled_countries',
      value: JSON.stringify(countries.map((c) => Number(c))),
      updated_at: new Date().toISOString(),
    });
  }

  invalidateCatalogFilterCache();
  return getCatalogFilterConfig();
}
