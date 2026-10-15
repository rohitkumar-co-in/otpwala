import assert from 'node:assert/strict';
import test from 'node:test';
import { addNetOrderPrices, getDeliveredPricingCorrectionTotal } from './order-adjustments.ts';

function database() {
  const entries = [
    { reference_id: 'a', amount: 73, type: 'deduction' },
    { reference_id: 'b', amount: 4, type: 'refund' },
    { reference_id: 'c', amount: 5, type: 'deduction' },
  ];
  return { from(table: string) {
    const query: any = {
      select: () => query, eq: () => query,
      in: (column: string, values: string[]) => { if (column === 'type') assert.deepEqual(values, ['refund', 'deduction']); return query; },
      range: () => query,
      then: (resolve: any) => resolve({ data: table === 'wallet_transactions' ? entries : [
        { id: 'a', status: 'code_received' }, { id: 'b', status: 'completed' }, { id: 'c', status: 'cancelled' },
      ], error: null }),
    };
    return query;
  } };
}

test('net order prices include recovery debits and correction credits', async () => {
  const rows = await addNetOrderPrices(database(), [{id:'a',sell_price_inr:4.5},{id:'b',sell_price_inr:10}]);
  assert.equal(rows[0].net_price_inr, 77.5);
  assert.equal(rows[0].pricing_adjustment_inr, -73);
  assert.equal(rows[1].net_price_inr, 6);
});

test('delivered revenue incorporates debits and excludes cancelled orders', async () => {
  assert.equal(await getDeliveredPricingCorrectionTotal(database()), -69);
});
