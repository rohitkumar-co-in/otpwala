import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateUser } from '../apps/web/functions/lib/supabase.ts';
import { checkSession, registerSession } from '../apps/web/functions/lib/session.ts';
const env={TIGER_SMS_API_KEY:'test',TIGER_SMS_BASE_URL:'https://provider.example',SUPABASE_URL:'https://auth-test.example',SUPABASE_SERVICE_ROLE_KEY:'test'};
const id='11111111-1111-4111-8111-111111111111';
const sessionId='22222222-2222-4222-8222-222222222222';
const request=()=>new Request('https://site.example/api/wallet',{headers:{Authorization:'Bearer test-token','x-session-id':sessionId}});
function mockAuth(t:any, banned:boolean, profileFailure=false, nativeBan=false) {
  let updates=0;
  t.mock.method(globalThis,'fetch',async(input:any,init:any={})=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith('/profiles'))return profileFailure?Response.json({message:'unavailable'},{status:400}):Response.json([{id,email:'test@example.invalid',role:'user',is_banned:banned}]);
    if(url.pathname.startsWith('/auth/v1/')){
      if(init.method==='PUT')updates++;
      return Response.json({id,email:'test@example.invalid',user_metadata:{current_session_id:sessionId},...(nativeBan?{banned_until:'2099-01-01T00:00:00Z'}:{})});
    }
    throw Error('Unexpected request '+url.pathname);
  });
  return ()=>updates;
}
test('banned users cannot authenticate, bypass session registration, or pass the sign-in gate',async(t)=>{
  const updates=mockAuth(t,true);
  await assert.rejects(authenticateUser(request(),env,{allowSessionReplacement:true}),(e:any)=>e.code==='account_banned');
  assert.equal((await checkSession('test-token',undefined,env,true)).reason,'account_banned');
  await assert.rejects(registerSession(id,sessionId,'test',env),/account_banned/);
  assert.equal(updates(),0);
});
test('unavailable profiles fail closed and cannot be recreated as unbanned',async(t)=>{
  const updates=mockAuth(t,false,true);
  assert.equal(await authenticateUser(request(),env),null);
  assert.equal((await checkSession('test-token',undefined,env,true)).valid,false);
  await assert.rejects(registerSession(id,sessionId,'test',env),/account_unavailable/);
  assert.equal(updates(),0);
});
test('active accounts pass the sign-in gate while old device sessions remain rejected',async(t)=>{
  mockAuth(t,false);
  assert.equal((await authenticateUser(request(),env))?.userId,id);
  assert.equal((await checkSession('test-token',undefined,env,true)).valid,true);
  assert.equal((await checkSession('test-token','another-session',env)).valid,false);
});
test('native Auth bans are enforced even if the profile flag has not caught up',async(t)=>{
  mockAuth(t,false,false,true);
  await assert.rejects(authenticateUser(request(),env),(e:any)=>e.code==='account_banned');
  assert.equal((await checkSession('test-token',undefined,env,true)).reason,'account_banned');
});

test('expired tokens do not label a live account as deleted', async(t)=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({code:'bad_jwt',message:'JWT expired'},{status:401}));
  assert.equal((await checkSession('expired-token',sessionId,env)).reason,'session_expired');
});
