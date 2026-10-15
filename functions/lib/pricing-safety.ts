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
