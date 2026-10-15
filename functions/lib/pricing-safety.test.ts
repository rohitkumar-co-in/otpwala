import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePricingSettings, roundSafeSellPrice } from './pricing-safety.ts';

test('configured rate and zero markup are preserved', () => {
  assert.deepEqual(parsePricingSettings({ dollar_rate_mode: 'custom', custom_dollar_rate: '115', default_markup_percentage: '0' }), { rate: 115, defaultMarkup: 0 });
  assert.deepEqual(parsePricingSettings({ dollar_rate_mode: 'tiger_default', tiger_default_rate: '85', default_markup_percent: '50' }), { rate: 85, defaultMarkup: 50 });
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
