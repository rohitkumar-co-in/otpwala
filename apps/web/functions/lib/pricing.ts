import { getSupabaseAdmin } from './supabase';
import { parsePricingSettings, roundSafeSellPrice } from './pricing-safety';

export async function getPricingSettings(env?: any): Promise<{ rate: number; defaultMarkup: number }> {
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

    return { rate, defaultMarkup };
  } catch {
    throw new Error('Pricing configuration unavailable. Please retry shortly.');
  }
}

async function loadPricingRules(env?: any) {
  const supabase = getSupabaseAdmin(env);
  try {
    const { data, error } = await supabase
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) throw new Error('Unable to load pricing rules');
    return data || [];
  } catch {
    throw new Error('Pricing configuration unavailable. Please retry shortly.');
  }
}

async function loadZeroMarkupUsers(env?: any) {
  const supabase = getSupabaseAdmin(env);
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'zero_markup_user_ids')
      .maybeSingle();

    if (error) throw new Error('Unable to load user pricing');
    let zeroUsers: string[] = [];
    if (data?.value) {
      zeroUsers = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } else {
      zeroUsers = [];
    }
    if (!Array.isArray(zeroUsers) || !zeroUsers.every((id) => typeof id === 'string')) throw new Error('Invalid user pricing');
    return zeroUsers || [];
  } catch {
    throw new Error('Pricing configuration unavailable. Please retry shortly.');
  }
}

export async function calculateSellPrice(
  costPriceUsd: number,
  serviceCode: string,
  countryCode: number,
  userId?: string,
  env?: any,
  settings?: { rate: number; defaultMarkup: number },
): Promise<number> {
  const { rate, defaultMarkup } = settings || await getPricingSettings(env);
  const costPriceInr = costPriceUsd * rate;

  if (userId) {
    const zeroUsers = await loadZeroMarkupUsers(env);
    if (Array.isArray(zeroUsers) && zeroUsers.includes(userId)) {
      return roundSafeSellPrice(costPriceInr, costPriceInr);
    }
  }

  const rules = await loadPricingRules(env);
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
    loadPricingRules(env),
    userId ? loadZeroMarkupUsers(env) : Promise.resolve([]),
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
  return loadZeroMarkupUsers(env) as Promise<string[]>;
}

export async function setZeroMarkupUser(userId: string, hasZeroMarkup: boolean, env?: any): Promise<boolean> {
  const supabase = getSupabaseAdmin(env);
  const current = await loadZeroMarkupUsers(env) as string[];
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

  return hasZeroMarkup;
}

