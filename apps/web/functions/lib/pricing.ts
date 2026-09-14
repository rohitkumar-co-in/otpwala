import { getSupabaseAdmin } from './supabase';

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
    const { data } = await supabase
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

    const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]));
    const mode = map.dollar_rate_mode || 'custom';
    const tigerDefaultRate = parseFloat(map.tiger_default_rate || '85.00') || 85.0;
    const customDollarRate = parseFloat(map.custom_dollar_rate || map.usd_to_inr_rate || '86.50') || 86.5;

    const rate = mode === 'tiger_default' ? tigerDefaultRate : customDollarRate;
    const defaultMarkup = parseFloat(map.default_markup_percentage || map.default_markup_percent || '25') || 25;

    cachedSettings = { rate, defaultMarkup };
    settingsTime = now;
    return cachedSettings;
  } catch {
    return { rate: 86.5, defaultMarkup: 25 };
  }
}

async function getCachedRules(env?: any) {
  const now = Date.now();
  if (cachedRules && now - rulesTime < 60_000) return cachedRules;

  const supabase = getSupabaseAdmin(env);
  try {
    const { data } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    cachedRules = data || [];
    rulesTime = now;
    return cachedRules;
  } catch {
    return [];
  }
}

async function getCachedZeroUsers(env?: any) {
  const now = Date.now();
  if (cachedZeroUsers && now - zeroUsersTime < 60_000) return cachedZeroUsers;

  const supabase = getSupabaseAdmin(env);
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'zero_markup_user_ids')
      .maybeSingle();

    if (data?.value) {
      cachedZeroUsers = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } else {
      cachedZeroUsers = [];
    }
    zeroUsersTime = now;
    return cachedZeroUsers || [];
  } catch {
    return [];
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
      return Math.ceil(costPriceInr * 2) / 2;
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

  return Math.ceil(sellPrice * 2) / 2;
}
