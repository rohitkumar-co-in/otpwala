import { getSupabaseAdmin } from './supabase';
import { parsePricingSettings, roundSafeSellPrice } from './pricing-safety';

let cachedSettings: { rate: number; defaultMarkup: number } | null = null;
let settingsTime = 0;
let cachedRules: any[] | null = null;
let rulesTime = 0;
let cachedZeroUsers: string[] | null = null;
let zeroUsersTime = 0;

export async function getPricingSettings(env?: any): Promise<{ rate: number; defaultMarkup: number }> {
  const now = Date.now();
  if (cachedSettings && now - settingsTime < 60_000) {
    return cachedSettings;
  }

  const supabase = getSupabaseAdmin(env);
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', [
        'usd_to_inr_rate',
        'dollar_rate_mode',
        'tiger_default_rate',
        'custom_dollar_rate',
        'default_markup_percentage',
        'default_markup_percent',
      ]);

    if (error) throw new Error('Unable to load pricing settings');
    const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    const { rate, defaultMarkup } = parsePricingSettings(map);

    cachedSettings = { rate, defaultMarkup };
    settingsTime = now;
    return cachedSettings;
  } catch {
    throw new Error('Pricing configuration unavailable. Please retry shortly.');
  }
}

async function getCachedRules(env?: any) {
  const now = Date.now();
  if (cachedRules && now - rulesTime < 60_000) return cachedRules;

  const supabase = getSupabaseAdmin(env);
  try {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) throw new Error('Unable to load pricing rules');
    cachedRules = data || [];
    rulesTime = now;
    return cachedRules;
  } catch {
    throw new Error('Pricing configuration unavailable. Please retry shortly.');
  }
}

async function getCachedZeroUsers(env?: any) {
  const now = Date.now();
  if (cachedZeroUsers && now - zeroUsersTime < 60_000) return cachedZeroUsers;

  const supabase = getSupabaseAdmin(env);
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'zero_markup_user_ids')
      .maybeSingle();

    if (error) throw new Error('Unable to load user pricing');
    if (data?.value) {
      cachedZeroUsers = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } else {
      cachedZeroUsers = [];
    }
    if (!Array.isArray(cachedZeroUsers) || !cachedZeroUsers.every((id) => typeof id === 'string')) throw new Error('Invalid user pricing');
    zeroUsersTime = now;
    return cachedZeroUsers || [];
  } catch {
    throw new Error('Pricing configuration unavailable. Please retry shortly.');
  }
}

export async function calculateSellPrice(
  costPriceUsd: number,
  serviceCode: string,
  countryCode: number,
  userId?: string,
  env?: any
): Promise<number> {
  const { rate, defaultMarkup } = await getPricingSettings(env);
  const costPriceInr = costPriceUsd * rate;

  if (userId) {
    const zeroUsers = await getCachedZeroUsers(env);
    if (Array.isArray(zeroUsers) && zeroUsers.includes(userId)) {
      return roundSafeSellPrice(costPriceInr, costPriceInr);
    }
  }

  const rules = await getCachedRules(env);
  let sellPrice = costPriceInr * (1 + defaultMarkup / 100);

  if (rules && rules.length > 0) {
    const exact = rules.find((r: any) => r.service_code === serviceCode && r.country_code === countryCode);
    const serviceOnly = rules.find((r: any) => r.service_code === serviceCode && r.country_code === null);
    const countryOnly = rules.find((r: any) => r.service_code === null && r.country_code === countryCode);
    const rule = exact || serviceOnly || countryOnly;

    if (rule) {
      if (rule.markup_type === 'percentage') {
        sellPrice = costPriceInr * (1 + rule.markup_value / 100);
      } else if (rule.markup_type === 'flat') {
        sellPrice = costPriceInr + rule.markup_value;
      } else if (rule.markup_type === 'fixed_price') {
        sellPrice = rule.markup_value;
      }
    }
  }

  return roundSafeSellPrice(sellPrice, costPriceInr);
}

export async function calculateSellPrices(
  prices: Array<{ costPriceUsd: number; countryCode: number }>,
  serviceCode: string,
  userId?: string,
  env?: any
): Promise<number[]> {
  const [settings, rules, zeroUsers] = await Promise.all([
    getPricingSettings(env),
    getCachedRules(env),
    userId ? getCachedZeroUsers(env) : Promise.resolve([]),
  ]);
  const { rate, defaultMarkup } = settings;
  const hasZeroMarkup = Boolean(userId && zeroUsers.includes(userId));

  return prices.map(({ costPriceUsd, countryCode }) => {
    const costPriceInr = costPriceUsd * rate;
    if (hasZeroMarkup) return roundSafeSellPrice(costPriceInr, costPriceInr);

    let sellPrice = costPriceInr * (1 + defaultMarkup / 100);
    const exact = rules.find((r: any) => r.service_code === serviceCode && r.country_code === countryCode);
    const serviceOnly = rules.find((r: any) => r.service_code === serviceCode && r.country_code === null);
    const countryOnly = rules.find((r: any) => r.service_code === null && r.country_code === countryCode);
    const rule = exact || serviceOnly || countryOnly;

    if (rule?.markup_type === 'percentage') sellPrice = costPriceInr * (1 + rule.markup_value / 100);
    if (rule?.markup_type === 'flat') sellPrice = costPriceInr + rule.markup_value;
    if (rule?.markup_type === 'fixed_price') sellPrice = rule.markup_value;
    return roundSafeSellPrice(sellPrice, costPriceInr);
  });
}

export async function getZeroMarkupUsers(env?: any): Promise<string[]> {
  return getCachedZeroUsers(env) as Promise<string[]>;
}

export async function setZeroMarkupUser(userId: string, hasZeroMarkup: boolean, env?: any): Promise<boolean> {
  const supabase = getSupabaseAdmin(env);
  const current = await getCachedZeroUsers(env) as string[];
  let updated: string[];

  if (hasZeroMarkup) {
    updated = current.includes(userId) ? current : [...current, userId];
  } else {
    updated = current.filter((id) => id !== userId);
  }

  const { error } = await supabase.from('settings').upsert({
    key: 'zero_markup_user_ids',
    value: JSON.stringify(updated),
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;

  // Invalidate cache
  cachedZeroUsers = updated;
  zeroUsersTime = Date.now();
  return hasZeroMarkup;
}

