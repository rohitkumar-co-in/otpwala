import assert from 'node:assert/strict';
import test from 'node:test';
import { assertProviderCanFund, assertPurchaseAllowed, assertValidAdminCredit, assertValidAdminFundingSource, classifyExpiredProviderStatus, adminFundingLedgerTypes, resolveAdminCreditLedgerType } from './policies.ts';

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

test('admin funding source is required and maps to the right ledger type', () => {
  assert.doesNotThrow(() => assertValidAdminFundingSource('manual_funding'));
  assert.doesNotThrow(() => assertValidAdminFundingSource('free_grant'));
  // An ambiguous credit must never reach the ledger.
  assert.throws(() => assertValidAdminFundingSource(''), /manually funded/);
  assert.throws(() => assertValidAdminFundingSource('admin_credit'), /manually funded/);
  assert.throws(() => assertValidAdminFundingSource('free'), /manually funded/);

  assert.equal(resolveAdminCreditLedgerType('manual_funding'), 'admin_credit');
  assert.equal(resolveAdminCreditLedgerType('free_grant'), 'admin_grant');
});

test('recharge source filter only ever selects funding credits', () => {
  assert.deepEqual(adminFundingLedgerTypes('upi'), ['topup']);
  assert.deepEqual(adminFundingLedgerTypes('manual'), ['admin_credit']);
  assert.deepEqual(adminFundingLedgerTypes('free'), ['admin_grant']);
  assert.deepEqual(adminFundingLedgerTypes('all'), ['topup', 'admin_credit', 'admin_grant']);
  // Unknown filters fall back to the full funding set, never to deductions.
  assert.deepEqual(adminFundingLedgerTypes('deduction'), ['topup', 'admin_credit', 'admin_grant']);
  assert.ok(!adminFundingLedgerTypes('refund').includes('refund' as never));
});

test('expired provider statuses always resolve deterministically', () => {
  assert.equal(classifyExpiredProviderStatus('code_received'), 'deliver');
  assert.equal(classifyExpiredProviderStatus('status_ok'), 'deliver');
  assert.equal(classifyExpiredProviderStatus('status_wait_retry'), 'deliver');
  assert.equal(classifyExpiredProviderStatus('status_wait_retry:8522'), 'deliver');
  assert.equal(classifyExpiredProviderStatus('waiting'), 'cancel_and_refund');
  assert.equal(classifyExpiredProviderStatus('status_wait_code'), 'cancel_and_refund');
  assert.equal(classifyExpiredProviderStatus('cancelled'), 'refund');
  assert.equal(classifyExpiredProviderStatus('access_cancel'), 'refund');
  assert.equal(classifyExpiredProviderStatus('status_cancel'), 'refund');
  assert.equal(classifyExpiredProviderStatus('no_activation'), 'refund');
  assert.equal(classifyExpiredProviderStatus('completed'), 'deliver');
  assert.equal(classifyExpiredProviderStatus('unexpected'), 'unsupported');
});
