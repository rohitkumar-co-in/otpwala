import assert from 'node:assert/strict';
import test from 'node:test';
// Exercise the exact synchronized Functions source bundled for production.
import { buyNumber } from '../apps/web/functions/lib/order.ts';
import { calculateSellPrice } from '../apps/web/functions/lib/pricing.ts';

const env={TIGER_SMS_API_KEY:'test',TIGER_SMS_BASE_URL:'https://provider.example',SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'test'};
const user='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
function mockCheckout(t: any, providerCost=0.4) {
  const debits: any[]=[];
  const purchases: URL[]=[];
  const saved: any[]=[];
  t.mock.method(globalThis,'fetch',async (input: any, init: any={})=>{
    const url=new URL(String(input));
    if(url.hostname==='provider.example') {
      const action=url.searchParams.get('action');
      if(action==='getFreePrices')return Response.json({'187':{fb:{prices:{'0.025':0,'0.448':20}}}});
      if(action==='getBalance')return Response.json({balance:'10',currency:840});
      if(action==='getServicesList')return Response.json({services:[{code:'fb',name:'facebook'}]});
      if(action==='getCountries')return Response.json([{id:187,eng:'United States'}]);
      if(action==='getNumberV2'){purchases.push(url);return Response.json({activationId:'9999990009786705671',phoneNumber:'1234567890',activationCost:providerCost,currency:840});}
      if(action==='setStatus')return new Response('ACCESS_CANCEL');
    }
    if(url.pathname.endsWith('/settings')&&url.searchParams.get('key')==='eq.zero_markup_user_ids')return Response.json([{value:'[]'}]);
    if(url.pathname.endsWith('/settings'))return Response.json([
      {key:'dollar_rate_mode',value:'custom'},{key:'custom_dollar_rate',value:'115'},
      {key:'default_markup_percentage',value:'50'},{key:'zero_markup_user_ids',value:'[]'},
    ]);
    if(url.pathname.endsWith('/pricing_rules'))return Response.json([]);
    if(url.pathname.endsWith('/orders')&&init.method==='HEAD')return new Response(null,{headers:{'content-range':'0-0/0'}});
    if(url.pathname.endsWith('/post_wallet_transaction')){const body=JSON.parse(init.body);debits.push(body);return Response.json([{balance_after:100}]);}
    if(url.pathname.endsWith('/orders')&&init.method==='POST'){const body=JSON.parse(init.body);saved.push(body);return Response.json(body);}
    if(url.pathname.endsWith('/profiles')&&init.method==='PATCH')return new Response(null,{status:204});
    if(url.pathname.endsWith('/profiles'))return Response.json({total_orders:0,total_spent:0});
    throw Error(`Unexpected mock request: ${init.method||'GET'} ${url.pathname}`);
  });
  return {debits,purchases,saved};
}

test('changed displayed price stops before any wallet debit or provider purchase',async(t)=>{
  const calls=mockCheckout(t);
  await assert.rejects(buyNumber(user,'fb',187,env,orderId,4.5),(e:any)=>e.code==='PRICE_CHANGED'&&e.currentPriceInr===77.5);
  assert.equal(calls.debits.length,0);
  assert.equal(calls.purchases.length,0);
});

test('accepted live quote charges exactly that price and records the receipt separately',async(t)=>{
  const calls=mockCheckout(t);
  const order=await buyNumber(user,'fb',187,env,orderId,77.5);
  assert.equal(order.priceInr,77.5);
  assert.equal(calls.debits[0].p_amount,-77.5);
  assert.equal(calls.purchases[0].searchParams.get('maxPrice'),'0.448');
  assert.equal(calls.saved[0].cost_price_usd,0.4);
  assert.equal(calls.saved[0].cost_price_inr,46);
  assert.equal(calls.saved[0].quoted_provider_cost_usd,0.448);
  assert.equal(calls.saved[0].provider_cost_source,'provider_receipt');
});

test('provider exceeding the cap cancels and refunds rather than billing the customer extra',async(t)=>{
  const calls=mockCheckout(t,0.507);
  await assert.rejects(buyNumber(user,'fb',187,env,orderId,77.5),(e:any)=>e.code==='INVALID_PROVIDER_RECEIPT');
  assert.equal(calls.saved.length,0);
  assert.deepEqual(calls.debits.map(d=>d.p_amount),[-77.5,77.5]);
});

test('a changed markup is read fresh on the next quote',async(t)=>{
  let markup='50';
  t.mock.method(globalThis,'fetch',async(input:any)=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith('/pricing_rules'))return Response.json([]);
    if(url.searchParams.get('key')==='eq.zero_markup_user_ids')return Response.json([{value:'[]'}]);
    return Response.json([{key:'dollar_rate_mode',value:'custom'},{key:'custom_dollar_rate',value:'115'},{key:'default_markup_percentage',value:markup}]);
  });
  assert.equal(await calculateSellPrice(0.448,'fb',187,user,env),77.5);
  markup='0';
  assert.equal(await calculateSellPrice(0.448,'fb',187,user,env),52);
});
