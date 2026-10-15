export function parsePricingSettings(map: Record<string, unknown>): { rate: number; defaultMarkup: number } {
  const mode = map.dollar_rate_mode;
  if (mode !== 'custom' && mode !== 'tiger_default') throw new Error('Pricing configuration unavailable');
  const rawRate = mode === 'tiger_default' ? map.tiger_default_rate : (map.custom_dollar_rate ?? map.usd_to_inr_rate);
  const rawMarkup = map.default_markup_percentage ?? map.default_markup_percent;
  const rate = Number(rawRate);
  const defaultMarkup = Number(rawMarkup);
  if (rawRate === undefined || rawRate === null || rawRate === '' || !Number.isFinite(rate) || rate <= 0
    || rawMarkup === undefined || rawMarkup === null || rawMarkup === '' || !Number.isFinite(defaultMarkup) || defaultMarkup < 0) {
    throw new Error('Pricing configuration unavailable');
  }
  return { rate, defaultMarkup };
}

export function roundSafeSellPrice(sellPrice: number, costPriceInr: number): number {
  if (!Number.isFinite(costPriceInr) || costPriceInr <= 0 || !Number.isFinite(sellPrice) || sellPrice <= 0) {
    throw new Error('Service pricing unavailable');
  }
  // An outdated fixed-price rule must never sell below the provider cost.
  return Math.ceil(Math.max(sellPrice, costPriceInr) * 2) / 2;
}

export function assertAcceptedPrice(expectedPriceInr: unknown, currentPriceInr: number): void {
  if (typeof expectedPriceInr !== 'number' || !Number.isFinite(expectedPriceInr) || expectedPriceInr <= 0) {
    throw Object.assign(new Error('Refresh the price before buying.'), { code: 'PRICE_REQUIRED' });
  }
  if (Math.abs(expectedPriceInr - currentPriceInr) > 0.00001) {
    throw Object.assign(new Error('The price changed. Review the new price and click Buy again. No money was deducted.'), {
      code: 'PRICE_CHANGED', currentPriceInr,
    });
  }
}

export function providerReceiptCost(receipt: { activationCost: unknown; currency: unknown }, quotedCostUsd: number): number {
  const cost = Number(receipt.activationCost);
  if (receipt.activationCost === null || receipt.activationCost === '' || !Number.isFinite(cost) || cost <= 0
    || Number(receipt.currency) !== 840 || cost > quotedCostUsd + 0.000001) {
    throw Object.assign(new Error('Provider purchase price could not be verified within the approved limit.'), { code: 'INVALID_PROVIDER_RECEIPT' });
  }
  return cost;
}

export function lowestAvailableBucket(prices: Record<string, unknown> | undefined): { cost: number; count: number } | null {
  const buckets = Object.entries(prices || {}).map(([price, stock]) => ({ cost: Number(price), count: Number(stock) }))
    .filter(bucket => Number.isFinite(bucket.cost) && bucket.cost > 0 && Number.isFinite(bucket.count) && bucket.count > 0)
    .sort((a, b) => a.cost - b.cost);
  return buckets[0] || null;
}
