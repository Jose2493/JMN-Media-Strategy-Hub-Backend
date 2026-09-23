import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPlanService,createPlanRepository } from './socialActionPlans.js';
import { createStrategistHandler } from '../api/strategist.js';
const company='11111111-1111-4111-8111-111111111111',account='22222222-2222-4222-8222-222222222222',contact='33333333-3333-4333-8333-333333333333';
function fixture(){
 let saved={version:0,state:null},creates=0;
 const repo={async read(c,a){assert.equal(c,company);assert.equal(a,account);return structuredClone(saved);},async save(c,a,u,v,s,conversation,context){assert.equal(c,company);assert.equal(a,account);assert.equal(u,contact);assert.equal(v,saved.version);if(conversation){creates++;assert.equal(context.kind,'social_action');assert.equal(context.goal.objective,s.goal.objective);}saved={version:v+1,state:structuredClone(s)};return structuredClone(saved);}};
 const service=createPlanService({repository:repo,now:()=> '2026-09-23T12:00:00Z'});
 const call=(command,extra={})=>service({session:{companyId:company,contactId:contact},accountId:account,body:command?{command,version:saved.version,...extra}:undefined,snapshot:async(auth,a,id)=>{assert.equal(auth,'Bearer test');assert.equal(a,account);return {capturedAt:'2026-09-23T12:00:00Z',post:{id,likes:8,comments:2}};},authorization:'Bearer test'});
 return {call,read:()=>saved,creates:()=>creates};
}
test('goal -> prepare -> return -> published -> review -> next persists context and history',async()=>{
 const f=fixture();assert.equal((await f.call()).state,null);
 const goal=await f.call('goal',{kind:'bookings',objective:'Book local consultations',audience:'Local owners'});
 assert.equal(goal.state.move.status,'proposed');
 const preparing=await f.call('prepare');const conversation=preparing.state.move.conversationId;
 assert.equal(preparing.state.move.status,'in_progress');await f.call('prepare');assert.equal(f.creates(),1);
 assert.equal((await f.call()).state.move.conversationId,conversation);
 const published=await f.call('published',{mediaId:'123',likes:9999});assert.equal(published.state.move.post.post.likes,8);
 await f.call('review',{note:'Two inquiries mentioned the post; manually recorded.'});
 const next=await f.call('next');assert.equal(next.state.move.status,'proposed');assert.equal(next.state.history[0].conversationId,conversation);assert.equal(next.state.history[0].review.source,'client-reported');assert.equal(next.state.goal.objective,'Book local consultations');
});
test('alternative is explicit, saves reason, and does not change on refresh',async()=>{
 const f=fixture();await f.call('goal',{kind:'awareness',objective:'Introduce our team'});
 const before=(await f.call()).state.move;assert.equal((await f.call()).state.move.id,before.id);
 const next=await f.call('alternative',{reason:'No filming this week'});assert.notEqual(next.state.move.id,before.id);assert.equal(next.state.move.adjustment,'No filming this week');assert.equal(next.state.history[0].archiveReason,'No filming this week');
 await f.call('prepare');await assert.rejects(f.call('alternative',{reason:'Another'}),{status:409});
});
test('rejects stale updates and invalid transitions without changing state',async()=>{
 const f=fixture();await assert.rejects(f.call('prepare'),{status:409});await assert.rejects(f.call('goal',{kind:'__proto__',objective:'x'}),{status:400});
 await f.call('goal',{kind:'inquiries',objective:'Get inquiries'});const before=structuredClone(f.read());
 await assert.rejects(f.call('goal',{kind:'inquiries',objective:'Overwrite',version:0}),{status:409});
 await assert.rejects(f.call('published',{mediaId:'123'}),{status:409});await assert.rejects(f.call('review',{note:'anything'}),{status:409});assert.deepEqual(f.read(),before);
 await f.call('prepare');await assert.rejects(f.call('published',{mediaId:'https://other.example'}),{status:400});
});
test('changing a goal preserves prior work without reusing the old preparation',async()=>{
 const f=fixture();await f.call('goal',{kind:'bookings',objective:'Appointments'});await f.call('prepare');const id=f.read().state.move.conversationId;
 const changed=await f.call('goal',{kind:'awareness',objective:'Brand recognition'});assert.equal(changed.state.history[0].conversationId,id);assert.equal(changed.state.move.conversationId,undefined);
});
test('repository checks company/account ownership before loading any plan',async()=>{
 const calls=[];const db=createClient('https://example.supabase.co','service-key',{global:{fetch:async(url)=>{calls.push(new URL(url));return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}});}}});
 const repo=createPlanRepository(()=>db);await assert.rejects(repo.read(company,account),{status:404});assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('company_id'),'eq.'+company);assert.equal(calls[0].searchParams.get('id'),'eq.'+account);assert.equal(calls[0].searchParams.get('platform'),'eq.instagram');
});
test('atomic save supplies only verified company/contact scope and expected version',async()=>{
 let request;const db=createClient('https://example.supabase.co','service-key',{global:{fetch:async(url,options)=>{request={url:new URL(url),body:JSON.parse(options.body)};return new Response(JSON.stringify({version:2,state:{}}),{status:200,headers:{'Content-Type':'application/json'}});}}});
 await createPlanRepository(()=>db).save(company,account,contact,1,{goal:{objective:'x'}});
 assert.match(request.url.pathname,/rpc\/save_social_action_plan$/);assert.equal(request.body.p_company,company);assert.equal(request.body.p_contact,contact);assert.equal(request.body.p_version,1);
});
test('API requires session before plan access and ignores posted company identity',async()=>{
 let called=0;const plans=async args=>{called++;assert.equal(args.session.companyId,company);return {version:0,state:null};};
 const response=()=>({statusCode:200,setHeader(){},status(v){this.statusCode=v;return this;},json(v){this.data=v;return this;}});
 const unauthorized=createStrategistHandler({verify(){throw Error();},plans});let res=response();await unauthorized({headers:{},method:'GET',query:{action:'plan',account}},res);assert.equal(res.statusCode,401);assert.equal(called,0);
 const handler=createStrategistHandler({verify:()=>({companyId:company,contactId:contact}),plans});res=response();await handler({headers:{authorization:'Bearer test'},method:'POST',body:{action:'plan',accountId:account,companyId:'foreign'}},res);assert.equal(res.statusCode,200);assert.equal(called,1);
});
