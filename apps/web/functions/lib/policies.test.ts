import assert from 'node:assert/strict';
import test from 'node:test';
import { assertProviderCanFund, assertPurchaseAllowed, assertValidAdminCredit, classifyExpiredProviderStatus } from './policies.ts';

test('purchase limits allow values below every boundary', () => {
  assert.doesNotThrow(() => assertPurchaseAllowed({ active: 2, recent: 9, daily: 49 }));
});

test('purchase limits reject each boundary', () => {
  assert.throws(() => assertPurchaseAllowed({ active: 3, recent: 0, daily: 0 }), /3 active/);
  assert.throws(() => assertPurchaseAllowed({ active: 0, recent: 10, daily: 0 }), /10 minutes/);
  assert.throws(() => assertPurchaseAllowed({ active: 0, recent: 0, daily: 50 }), /Daily/);
});

test('provider funding accepts equality and rejects shortages or invalid values', () => {
  assert.doesNotThrow(() => assertProviderCanFund(1, 1));
  assert.throws(() => assertProviderCanFund(0.99, 1), (error: any) => error.code === 'PROVIDER_LOW_BALANCE');
  assert.throws(() => assertProviderCanFund(Number.NaN, 1));
});

test('admin credit validates amount and reason boundaries', () => {
  assert.doesNotThrow(() => assertValidAdminCredit(1, 'Valid reason'));
  assert.doesNotThrow(() => assertValidAdminCredit(1000000, 'Valid reason'));
  assert.throws(() => assertValidAdminCredit(0, 'Valid reason'));
  assert.throws(() => assertValidAdminCredit(1000001, 'Valid reason'));
  assert.throws(() => assertValidAdminCredit(5, 'bad'));
});

test('expired provider statuses always resolve deterministically', () => {
  assert.equal(classifyExpiredProviderStatus('code_received'), 'deliver');
  assert.equal(classifyExpiredProviderStatus('waiting'), 'cancel_and_refund');
  assert.equal(classifyExpiredProviderStatus('status_wait_retry'), 'cancel_and_refund');
  assert.equal(classifyExpiredProviderStatus('cancelled'), 'refund');
  assert.equal(classifyExpiredProviderStatus('completed'), 'refund');
  assert.equal(classifyExpiredProviderStatus('unexpected'), 'unsupported');
});
