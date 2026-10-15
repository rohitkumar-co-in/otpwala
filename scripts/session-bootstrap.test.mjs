import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from '../apps/api/node_modules/typescript/lib/typescript.js';
function setup(auth, fetch = async () => Response.json({success:true})) {
 const values = new Map();
 const exports = {};
 const source = fs.readFileSync('apps/web/src/lib/sessionManager.ts','utf8')
  .replace(/import \{ supabase, authStorageKey \} from '.\/supabase';/, "const {supabase, authStorageKey} = dependencies;")
  .replaceAll('import.meta.env.PUBLIC_API_URL', "''");
 const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js, {exports,dependencies:{supabase:{auth},authStorageKey:'sb-test-auth-token'},window:{location:{hostname:'otpwala.me'}},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},fetch,console,crypto,Date,setInterval,clearInterval});
 return {api:exports,values};
}
const session = (expires_at = Date.now()/1000+3600) => ({user:{id:'user'},access_token:'fresh',expires_at});
test('parallel startup requests refresh once and wait for acknowledged device registration',async()=>{
 let refreshes=0, registrations=0, release;
 const gate = new Promise(r=>release=r);
 const {api,values}=setup({getSession:async()=>({data:{session:session(1)}}),refreshSession:async()=>{refreshes++;return {data:{session:session()}}}},async()=>{registrations++;await gate;return Response.json({success:true});});
 let completed=0;
 const requests=Array.from({length:8},()=>api.getReadySession().then(s=>{completed++;return s;}));
 await new Promise(r=>setTimeout(r,20));
 assert.equal(refreshes,1);assert.equal(registrations,1);assert.equal(completed,0);assert.equal(values.get('otpwala_session_id'),undefined);
 release();assert.equal((await Promise.all(requests)).length,8);assert.equal(completed,8);assert.ok(values.get('otpwala_session_id'));
});
test('failed device registration is never published or treated as ready',async()=>{
 const {api,values}=setup({getSession:async()=>({data:{session:session()}})},async()=>Response.json({success:false,error:'account_banned'},{status:403}));
 await assert.rejects(api.getReadySession(),/Unable to prepare/);assert.equal(values.size,0);
});
test('existing devices are preserved and SDK refresh failures propagate',async()=>{
 let registrations=0;
 const {api,values}=setup({getSession:async()=>({data:{session:session()}})},async()=>{registrations++;throw Error('unexpected');});
 values.set('otpwala_session_id','existing-device');assert.equal((await api.getReadySession()).access_token,'fresh');assert.equal(registrations,0);
 const failed=setup({getSession:async()=>({data:{session:session(1)}}),refreshSession:async()=>({error:Error('offline')})});
 await assert.rejects(failed.api.getReadySession(),/offline/);
});
