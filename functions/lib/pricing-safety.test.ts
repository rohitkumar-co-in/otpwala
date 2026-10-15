import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePricingSettings, roundSafeSellPrice, assertAcceptedPrice, providerReceiptCost, lowestAvailableBucket } from './pricing-safety.ts';

test('configured rate and zero markup are preserved', () => {
  assert.deepEqual(parsePricingSettings({ dollar_rate_mode: 'custom', custom_dollar_rate: '115', default_markup_percentage: '0' }), { rate: 115, defaultMarkup: 0 });
  assert.deepEqual(parsePricingSettings({ dollar_rate_mode: 'tiger_default', tiger_default_rate: '85', default_markup_percent: '50' }), { rate: 85, defaultMarkup: 50 });
});

test('checkout requires exactly the displayed price, including downward changes', () => {
  assert.doesNotThrow(() => assertAcceptedPrice(8,8));
  for (const invalid of [undefined, null, '8', 0, NaN, Infinity]) assert.throws(() => assertAcceptedPrice(invalid,8), (e: any) => e.code === 'PRICE_REQUIRED');
  assert.throws(() => assertAcceptedPrice(4.5,77.5), (e: any) => e.code === 'PRICE_CHANGED' && e.currentPriceInr === 77.5);
  assert.throws(() => assertAcceptedPrice(8,7.5), (e: any) => e.code === 'PRICE_CHANGED');
});

test('provider cost uses the receipt and never exceeds the approved cap', () => {
  assert.equal(providerReceiptCost({activationCost:0.04,currency:840},0.045),0.04);
  for (const cost of [null, '', undefined, NaN, 0, -1, 0.448]) assert.throws(() => providerReceiptCost({activationCost:cost,currency:840},0.025));
  assert.throws(() => providerReceiptCost({activationCost:0.025,currency:643},0.025));
});

test('live prices use the cheapest in-stock bucket, not historical averages or empty offers', () => {
  assert.deepEqual(lowestAvailableBucket({'0.025':0,'0.448':20,'0.507':50,'bad':20,'0.01':-1}),{cost:0.448,count:20});
  assert.equal(lowestAvailableBucket({}),null);
  assert.equal(lowestAvailableBucket(undefined),null);
});

test('missing and invalid configuration never falls back to a cheaper rate', () => {
  for (const rate of [undefined, null, '', 'bad', '115junk', 0, -1, Infinity]) {
    assert.throws(() => parsePricingSettings({ dollar_rate_mode: 'custom', custom_dollar_rate: rate, default_markup_percentage: '50' }));
  }
  assert.throws(() => parsePricingSettings({}));
  assert.throws(() => parsePricingSettings({ dollar_rate_mode: 'custom', custom_dollar_rate: '115' }));
});

test('sale rounding preserves markup and floors outdated fixed prices at cost', () => {
  assert.equal(roundSafeSellPrice(0.025 * 115 * 1.5, 0.025 * 115), 4.5);
  assert.equal(roundSafeSellPrice(5, 12.3), 12.5);
  assert.equal(roundSafeSellPrice(12.3, 12.3), 12.5);
  for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => roundSafeSellPrice(10, bad));
  assert.throws(() => roundSafeSellPrice(NaN, 10));
});
