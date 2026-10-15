import { supabaseAdmin } from '../config/supabase.js';
import type { PricingRule } from '@otpwala/shared';

/**
 * Pricing Engine
 * Calculates the sell price in INR for a Tiger SMS number.
 *
 * Priority: service+country > service-only > country-only > global default
 */

export async function getPricingSettings(): Promise<{ rate: number; defaultMarkup: number }> {
  const { data, error } = await supabaseAdmin
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

  if (error) throw new Error('Pricing configuration unavailable');
  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));

  const mode = map.dollar_rate_mode;
  if (mode !== 'custom' && mode !== 'tiger_default') throw new Error('Pricing configuration unavailable');
  const tigerDefaultRate = Number(map.tiger_default_rate);
  const customDollarRate = Number(map.custom_dollar_rate ?? map.usd_to_inr_rate);
  const rate = mode === 'tiger_default' ? tigerDefaultRate : customDollarRate;
  const rawMarkup = map.default_markup_percentage ?? map.default_markup_percent;
  const markup = Number(rawMarkup);
  if (!Number.isFinite(rate) || rate <= 0 || rawMarkup == null || rawMarkup === '' || !Number.isFinite(markup) || markup < 0) {
    throw new Error('Pricing configuration unavailable');
  }

  return { rate, defaultMarkup: markup };
}

async function getPricingRules(): Promise<PricingRule[]> {
  const { data, error } = await supabaseAdmin.from('pricing_rules').select('*').eq('is_active', true).order('priority', { ascending: false });
  if (error) throw new Error('Pricing rules unavailable');
  return (data as PricingRule[]) || [];
}

/**
 * Find the best matching pricing rule for a service/country pair.
 * Priority: service+country specific → service-only → country-only → null (use global default)
 */
function findRule(rules: PricingRule[], serviceCode: string, countryCode: number): PricingRule | null {
  // First: exact service + country match
  const exact = rules.find(
    r => r.service_code === serviceCode && r.country_code === countryCode
  );
  if (exact) return exact;

  // Second: service-only match
  const serviceOnly = rules.find(
    r => r.service_code === serviceCode && r.country_code === null
  );
  if (serviceOnly) return serviceOnly;

  // Third: country-only match
  const countryOnly = rules.find(
    r => r.service_code === null && r.country_code === countryCode
  );
  if (countryOnly) return countryOnly;

  return null;
}

// No in-memory cache for zero-markup user IDs — always read fresh from DB
// so that admin changes are reflected immediately across all server instances.
export async function getZeroMarkupUserIds(): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'zero_markup_user_ids')
    .maybeSingle();

  if (error) throw new Error('User pricing unavailable');
  let userIds: string[] = [];
  try {
    if (data?.value) {
      userIds = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (!Array.isArray(userIds) || !userIds.every(id => typeof id === 'string')) throw new Error('Invalid user pricing');
    }
  } catch {
    throw new Error('User pricing unavailable');
  }

  return new Set(userIds);
}

export async function isZeroMarkupUser(userId?: string): Promise<boolean> {
  if (!userId) return false;
  const zeroMarkupUsers = await getZeroMarkupUserIds();
  return zeroMarkupUsers.has(userId);
}

export async function setZeroMarkupUser(userId: string, hasZeroMarkup: boolean): Promise<boolean> {
  const currentSet = await getZeroMarkupUserIds();
  if (hasZeroMarkup) {
    currentSet.add(userId);
  } else {
    currentSet.delete(userId);
  }

  const userIdsArray = Array.from(currentSet);
  const { error } = await supabaseAdmin
    .from('settings')
    .upsert({
      key: 'zero_markup_user_ids',
      value: JSON.stringify(userIdsArray),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to update zero_markup_user_ids:', error);
    throw error;
  }

  return hasZeroMarkup;
}

/**
 * Calculate the sell price in INR given a cost price in USD.
 * If user has zero-markup flag, sell price equals base Tiger SMS cost in INR.
 */
export async function calculateSellPrice(
  costPriceUsd: number,
  serviceCode: string,
  countryCode: number,
  userId?: string,
  userRole?: string,
  settings?: { rate: number; defaultMarkup: number },
): Promise<number> {
  const { rate, defaultMarkup } = settings || await getPricingSettings();

  // Convert USD to INR
  const costPriceInr = costPriceUsd * rate;
  if (!Number.isFinite(costPriceInr) || costPriceInr <= 0) throw new Error('Service pricing unavailable');

  // Admins always buy at Tiger SMS base cost (0% markup)
  if (userRole === 'admin') {
    return Math.ceil(costPriceInr * 2) / 2;
  }

  // Check if user is granted Zero-Markup (buys at pure Tiger SMS base rate)
  if (userId && (await isZeroMarkupUser(userId))) {
    return Math.ceil(costPriceInr * 2) / 2;
  }

  const rules = await getPricingRules();

  // Find applicable rule
  const rule = findRule(rules, serviceCode, countryCode);

  let sellPrice: number;

  if (rule) {
    switch (rule.markup_type) {
      case 'percentage':
        sellPrice = costPriceInr * (1 + rule.markup_value / 100);
        break;
      case 'flat':
        sellPrice = costPriceInr + rule.markup_value;
        break;
      case 'fixed_price':
        sellPrice = rule.markup_value; // Admin sets the exact selling price in INR
        break;
      default:
        sellPrice = costPriceInr * (1 + defaultMarkup / 100);
    }
  } else {
    // Use global default markup
    sellPrice = costPriceInr * (1 + defaultMarkup / 100);
  }

  // Round up to nearest ₹0.50
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) throw new Error('Service pricing unavailable');
  return Math.ceil(Math.max(sellPrice, costPriceInr) * 2) / 2;
}

/**
 * Invalidate pricing caches (called from admin when settings change)
 */
export function invalidatePricingCache(): void {
  // Pricing configuration is read fresh for each request.
}
