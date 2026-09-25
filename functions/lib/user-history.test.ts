import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOrderHistoryClear,
  applyPaymentHistoryClear,
  applyWalletHistoryClear,
  type UserHistoryClear,
} from './user-history.ts';

const clear: UserHistoryClear = {
  cleared_at: '2026-09-25T10:00:00.000Z',
  mode: 'preserve_funding',
  funding_since: null,
};

function queryStub() {
  const calls: Array<[string, ...any[]]> = [];
  const query: any = {};
  for (const method of ['gte', 'or']) {
    query[method] = (...args: any[]) => {
      calls.push([method, ...args]);
      return query;
    };
  }
  return { query, calls };
}

test('order history is scoped to activity created after the latest clear', () => {
  const { query, calls } = queryStub();
  assert.equal(applyOrderHistoryClear(query, clear), query);
  assert.deepEqual(calls, [['gte', 'created_at', clear.cleared_at]]);
});

test('full clear hides pre-clear ledger activity and its reset debit', () => {
  const { query, calls } = queryStub();
  applyWalletHistoryClear(query, { ...clear, mode: 'all' });
  assert.deepEqual(calls, [
    ['gte', 'created_at', clear.cleared_at],
    ['or', 'reference_type.is.null,reference_type.neq.admin_history_clear'],
  ]);
});

test('activity clear keeps top-ups while hiding older non-deposit transactions', () => {
  const { query, calls } = queryStub();
  applyWalletHistoryClear(query, clear);
  assert.deepEqual(calls, [['or', `created_at.gte.${clear.cleared_at},type.eq.topup`]]);
});

test('activity clear after a full clear keeps only deposits since the last full clear', () => {
  const { query, calls } = queryStub();
  applyWalletHistoryClear(query, { ...clear, funding_since: '2026-09-20T10:00:00.000Z' });
  assert.deepEqual(calls, [['or', 'created_at.gte.2026-09-25T10:00:00.000Z,and(type.eq.topup,created_at.gte.2026-09-20T10:00:00.000Z)']]);
});

test('payment history is retained for activity clears and reset for full clears', () => {
  const preserve = queryStub();
  assert.equal(applyPaymentHistoryClear(preserve.query, clear), preserve.query);
  assert.deepEqual(preserve.calls, []);

  const full = queryStub();
  applyPaymentHistoryClear(full.query, { ...clear, mode: 'all' });
  assert.deepEqual(full.calls, [['gte', 'created_at', clear.cleared_at]]);
});

test('no clear marker leaves history queries unchanged', () => {
  const { query, calls } = queryStub();
  assert.equal(applyWalletHistoryClear(query, null), query);
  assert.deepEqual(calls, []);
});
