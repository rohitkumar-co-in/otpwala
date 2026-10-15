import assert from 'node:assert/strict';
import test from 'node:test';
import { TigerSmsClient } from '../functions/lib/tiger.ts';

const env = {
  TIGER_SMS_API_KEY: 'test-key',
  TIGER_SMS_BASE_URL: 'https://provider.example',
  SUPABASE_URL: 'https://database.example',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

test('every provider purchase carries the same cost used for the wallet quote', async (t) => {
  let called = 0;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('action'), 'getNumber');
    assert.equal(url.searchParams.get('maxPrice'), '0.025');
    called++;
    return new Response('ACCESS_NUMBER:12345:1234567890');
  });
  const result = await new TigerSmsClient(env).getNumber('fb', 187, 0.025);
  assert.equal(result.activationId, '12345');
  assert.equal(called, 1);
});

test('a stale price rejection never retries with an unrestricted purchase', async (t) => {
  let called = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    called++;
    return new Response('WRONG_MAX_PRICE');
  });
  await assert.rejects(new TigerSmsClient(env).getNumber('fb', 187, 0.025), /WRONG_MAX_PRICE/);
  assert.equal(called, 1);
});

test('invalid cost cannot reach the provider', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Provider must not be called'); });
  for (const cost of [NaN, Infinity, 0, -1]) {
    await assert.rejects(new TigerSmsClient(env).getNumber('fb', 187, cost), /Invalid provider price limit/);
  }
});

test('live quote ignores unavailable cheap buckets and does not reuse previous prices', async (t) => {
  let cost = '0.448';
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    assert.equal(new URL(input).searchParams.get('action'),'getFreePrices');
    return Response.json({'187':{fb:{prices:{'0.025':0,[cost]:20}}}});
  });
  const tiger = new TigerSmsClient(env);
  assert.equal((await tiger.getLivePrices('fb',187))['187'].fb.cost,0.448);
  cost='0.507';
  assert.equal((await tiger.getLivePrices('fb',187))['187'].fb.cost,0.507);
});

test('V2 purchase sends the cap and returns the actual receipt cost', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get('action'),'getNumberV2');
    assert.equal(url.searchParams.get('maxPrice'),'0.448');
    return Response.json({activationId:'9999990009786705671',phoneNumber:'1234567890',activationCost:0.4,currency:840});
  });
  const result=await new TigerSmsClient(env).getNumberV2('fb',187,0.448);
  assert.equal(result.activationId,'9999990009786705671');
  assert.equal(result.activationCost,0.4);
});

test('V2 rejection never falls back to an unrestricted purchase', async (t) => {
  let calls=0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({title:'WRONG_MAX_PRICE',details:'Quote unavailable'}); });
  await assert.rejects(new TigerSmsClient(env).getNumberV2('fb',187,0.025), (e: any)=>e.code==='WRONG_MAX_PRICE');
  assert.equal(calls,1);
});
