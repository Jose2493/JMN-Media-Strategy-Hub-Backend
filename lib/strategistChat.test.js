import {test} from 'node:test';
import assert from 'node:assert/strict';
// Import legacy repositories with inert test configuration; all IO is injected.
process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='unit-test-only';
const {createChatHandler}=await import('../api/chat.js');
const company='11111111-1111-4111-8111-111111111111',contact='22222222-2222-4222-8222-222222222222',conversation='44444444-4444-4444-8444-444444444444';
function setup(overrides={}){
 const calls=[];let request;
 const query={select(){return this;},eq(...args){calls.push(['eq',...args]);return this;},order(...args){calls.push(['order',...args]);return this;},async limit(n){calls.push(['limit',n]);return {data:[{role:'assistant',content:'Latest reply'},{role:'user',content:'Latest question'}],error:null};}};
 const handler=createChatHandler({verify:()=>({companyId:company,contactId:contact}),rateLimit:async()=>true,
 findConversation:async(c,id)=>{calls.push(['conversation',c,id]);return {channel:'portal_ai_strategist'};},
 getMetadata:async()=>({title:'Post review',campaign:{name:'September',objective:'Bookings'},social_context:{capturedAt:'2026-09-16',post:{id:'123',likes:7}}}),
 getMemory:async()=>({}),formatMemory:()=>'',saveMessage:async(...args)=>calls.push(['save',...args]),updateMemory:async()=>calls.push(['global-memory']),
 db:{from(){return query;}},providerFetch:async(_url,options)=>{request=JSON.parse(options.body);calls.push(['provider']);return {ok:true,json:async()=>({content:[{type:'text',text:'Try a follow-up.'}]})};},...overrides});
 const invoke=async(body={message:'What next?',conversationId:conversation})=>{const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler({method:'POST',headers:{authorization:'session'},body},res);return res;};
 return {invoke,calls,request:()=>request};
}
test('chat grounds model in selected campaign and newest scoped messages, saves in same thread',async()=>{
 const s=setup();const r=await s.invoke();assert.equal(r.code,200);
 assert.deepEqual(s.calls[0],['conversation',company,conversation]);
 assert.ok(s.calls.some(c=>c[0]==='eq'&&c[1]==='company_id'&&c[2]===company));
 assert.ok(s.calls.some(c=>c[0]==='order'&&c[1]==='created_at'&&c[2].ascending===false));
 assert.deepEqual(s.request().messages.map(m=>m.content),['Latest question','Latest reply','What next?']);
 assert.match(s.request().system,/September/);assert.match(s.request().system,/"likes":7/);
 const saves=s.calls.filter(c=>c[0]==='save');assert.equal(saves.length,2);assert.ok(saves.every(c=>c[1]===company&&c[3]===conversation));assert.equal(s.calls.some(c=>c[0]==='global-memory'),false);
});
test('foreign conversation never reaches model or writes messages',async()=>{
 const s=setup({findConversation:async()=>{throw Error('foreign');}});assert.equal((await s.invoke()).code,500);assert.equal(s.calls.length,0);
});
test('non-strategist conversation cannot be used for chat',async()=>{
 const s=setup({findConversation:async()=>({channel:'other'})});assert.equal((await s.invoke()).code,404);assert.equal(s.calls.length,0);
});
test('invalid messages and unauthenticated requests never call model',async()=>{
 const s=setup();assert.equal((await s.invoke({message:{text:'bad'}})).code,400);assert.equal((await s.invoke({message:'x'.repeat(6001)})).code,400);assert.equal(s.calls.length,0);
 const noSession=setup({verify:()=>{throw Error();}});assert.equal((await noSession.invoke()).code,401);assert.equal(noSession.calls.length,0);
});
test('rate limit prevents model calls and persistence',async()=>{
 const s=setup({rateLimit:async()=>false});assert.equal((await s.invoke()).code,429);assert.equal(s.calls.length,0);
});
test('provider failure does not save a fabricated reply or leak provider text',async()=>{
 const s=setup({providerFetch:async()=>({ok:false,status:500,json:async()=>({error:{message:'secret'}})})});const r=await s.invoke();assert.equal(r.code,500);assert.equal(JSON.stringify(r.data).includes('secret'),false);assert.equal(s.calls.some(c=>c[0]==='save'),false);
});
