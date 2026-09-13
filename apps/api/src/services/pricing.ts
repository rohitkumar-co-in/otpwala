import { supabaseAdmin } from '../config/supabase.js';
import type { PricingRule } from '@otpwala/shared';

/**
 * Pricing Engine
 * Calculates the sell price in INR for a Tiger SMS number.
 *
 * Priority: service+country > service-only > country-only > global default
 */

// In-memory cache for settings
let cachedRate: number | null = null;
let cachedDefaultMarkup: number | null = null;
let rateLastFetched = 0;
const RATE_CACHE_TTL = 60_000; // 1 minute

async function getSettings(): Promise<{ rate: number; defaultMarkup: number }> {
  const now = Date.now();
  if (cachedRate !== null && cachedDefaultMarkup !== null && now - rateLastFetched < RATE_CACHE_TTL) {
    return { rate: cachedRate!, defaultMarkup: cachedDefaultMarkup! };
  }

  const { data } = await supabaseAdmin
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

  const map = Object.fromEntries((data || []).map(r => [r.key, r.value]));

  const mode = map.dollar_rate_mode || 'custom';
  const tigerDefaultRate = parseFloat(map.tiger_default_rate || '85.00');
  const customDollarRate = parseFloat(map.custom_dollar_rate || map.usd_to_inr_rate || '86.50');

  // If tiger_default is selected, use 85.00 (or configured tiger default); otherwise use custom rate
  cachedRate = mode === 'tiger_default' ? tigerDefaultRate : customDollarRate;
  cachedDefaultMarkup = parseFloat(map.default_markup_percentage || map.default_markup_percent || '25');
  rateLastFetched = now;

  return { rate: cachedRate, defaultMarkup: cachedDefaultMarkup };
}

// In-memory cache for pricing rules
let cachedRules: PricingRule[] | null = null;
let rulesLastFetched = 0;
const RULES_CACHE_TTL = 30_000; // 30 seconds

async function getPricingRules(): Promise<PricingRule[]> {
  const now = Date.now();
  if (cachedRules && now - rulesLastFetched < RULES_CACHE_TTL) {
    return cachedRules;
  }

  const { data } = await supabaseAdmin
    .from('pricing_rules')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });

  cachedRules = (data as PricingRule[]) || [];
  rulesLastFetched = now;
  return cachedRules;
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

// In-memory cache for zero-markup user IDs
let cachedZeroMarkupUsers: Set<string> | null = null;
let zeroMarkupLastFetched = 0;
const ZERO_MARKUP_CACHE_TTL = 30_000; // 30 seconds

export async function getZeroMarkupUserIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedZeroMarkupUsers && now - zeroMarkupLastFetched < ZERO_MARKUP_CACHE_TTL) {
    return cachedZeroMarkupUsers;
  }

  const { data } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'zero_markup_user_ids')
    .maybeSingle();

  let userIds: string[] = [];
  try {
    if (data?.value) {
      userIds = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (!Array.isArray(userIds)) userIds = [];
    }
  } catch {
    userIds = [];
  }

  cachedZeroMarkupUsers = new Set(userIds);
  zeroMarkupLastFetched = now;
  return cachedZeroMarkupUsers;
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

  cachedZeroMarkupUsers = currentSet;
  zeroMarkupLastFetched = Date.now();
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
  userId?: string
): Promise<number> {
  const { rate, defaultMarkup } = await getSettings();

  // Convert USD to INR
  const costPriceInr = costPriceUsd * rate;

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
  return Math.ceil(sellPrice * 2) / 2;
}

/**
 * Invalidate pricing caches (called from admin when settings change)
 */
export function invalidatePricingCache(): void {
  cachedRate = null;
  cachedDefaultMarkup = null;
  cachedRules = null;
  cachedZeroMarkupUsers = null;
  rateLastFetched = 0;
  rulesLastFetched = 0;
  zeroMarkupLastFetched = 0;
}
