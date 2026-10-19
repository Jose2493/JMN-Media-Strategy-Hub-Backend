import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionService,routeRecommendations,validateProduction} from '../lib/strategistActions.js';
import {createHandler} from '../api/strategist-actions.js';
import {recommendProduction,installStrategistActions} from '../public/strategist-actions-view.js';
const C='11111111-1111-4111-8111-111111111111',D='22222222-2222-4222-8222-222222222222',U='33333333-3333-4333-8333-333333333333',V='44444444-4444-4444-8444-444444444444',T='55555555-5555-4555-8555-555555555555',P='66666666-6666-4666-8666-666666666666';
const session={companyId:C,contactId:U};
const body={requestKey:P,mode:'remote',goal:'Membership campaign',location:'Boston',deliverables:'Three videos',timeline:'Next month',budget:'USD 1000',conversationId:T};
function fixture(){
 const tables={contacts:[{id:U,company_id:C},{id:V,company_id:D}],conversations:[{id:T,company_id:C,channel:'portal_ai_strategist'}],messages:[{company_id:C,conversation_id:T,role:'assistant',content:'Review drafts and plan a campaign. Design a shirt and film a video.'}],founding_partner_workspaces:[],projects:[],production_requests:[]};let design=false,fail=false;
 const db={from(table){const filters=[];let payload,opts;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},order(){return q;},limit(){return q;},maybeSingle(){return Promise.resolve(run(true));},upsert(p,o){payload=p;opts=o;return q;},then(ok,no){return Promise.resolve(run()).then(ok,no);}};
 function run(single=false){if(fail)return {error:{message:'SECRET SQL'}};if(payload){assert.equal(opts.ignoreDuplicates,true);if(!tables[table].some(r=>r.contact_id===payload.contact_id&&r.request_key===payload.request_key))tables[table].push({...payload,status:'pending_review'});}const rows=tables[table].filter(r=>filters.every(f=>f(r)));return {data:single?rows[0]||null:rows};}return q;}};
 return {tables,design:()=>{design=true;},fail:()=>{fail=true;},service:createActionService({getDb:()=>db,cockpit:async()=>({design})})};
}
test('safe routes classify recommendation without accepting arbitrary destinations',()=>{
 const types=routeRecommendations('Review drafts, campaign planning, design shirt, video production https://evil.test',{design:false}).map(a=>a.type);
 assert.deepEqual(types,['social','strategy','production']);assert.ok(routeRecommendations('template',{design:true}).some(a=>a.type==='design'));
 assert.deepEqual(routeRecommendations('Unrelated'),[]);assert.ok(routeRecommendations('',{onboarding:true}).some(a=>a.type==='onboarding'));
});
test('server resolves recommendations from scoped saved conversation and fresh entitlement',async()=>{
 const f=fixture();assert.ok(!(await f.service.load(session,T)).actions.some(a=>a.type==='design'));f.design();assert.ok((await f.service.load(session,T)).actions.some(a=>a.type==='design'));
 await assert.rejects(f.service.load({companyId:D,contactId:V},T),e=>e.status===404);await assert.rejects(f.service.load({companyId:D,contactId:U},T),e=>e.status===403);
});
test('onboarding requires active incomplete enrollment and current project ownership',async()=>{
 const f=fixture(),r={contact_id:U,company_id:C,active:true,completed_at:null,workspace_kind:'project',partner_key:'riany',project_id:P};f.tables.founding_partner_workspaces.push(r);f.tables.projects.push({id:P,company_id:D});
 assert.equal((await f.service.load(session)).actions.length,0);f.tables.projects[0].company_id=C;assert.equal((await f.service.load(session)).actions[0].type,'onboarding');r.completed_at='2026-10-19';assert.equal((await f.service.load(session)).actions.length,0);r.completed_at=null;r.active=false;assert.equal((await f.service.load(session)).actions.length,0);
});
test('production creates only session-owned pending request, duplicate retry cannot overwrite',async()=>{
 const f=fixture();assert.deepEqual(await f.service.submit(session,body),{received:true,status:'pending_review'});await f.service.submit(session,{...body,goal:'Changed'});assert.equal(f.tables.production_requests.length,1);assert.equal(f.tables.production_requests[0].goal,body.goal);assert.equal(f.tables.production_requests[0].company_id,C);assert.equal(f.tables.production_requests[0].contact_id,U);
 await assert.rejects(f.service.submit({companyId:D,contactId:V},body),e=>e.status===404);assert.equal(f.tables.production_requests.length,1);
});
test('ownership overrides, status, arbitrary destinations and malformed input rejected',()=>{
 for(const extra of [{companyId:D},{contact_id:V},{status:'approved'},{destination:'https://evil.test'},{mode:'publish'},{goal:' '},{budget:'x'.repeat(161)},{requestKey:'bad'}])assert.throws(()=>validateProduction({...body,...extra}),e=>e.status===400);
});
test('same retry key in another tenant never reads or replaces first tenant request',async()=>{const f=fixture();await f.service.submit(session,body);await f.service.submit({companyId:D,contactId:V},{...body,conversationId:null});assert.equal(f.tables.production_requests.length,2);assert.deepEqual(f.tables.production_requests.map(r=>r.company_id),[C,D]);});
const response=()=>({code:200,setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('API requires verified session, forbids override queries and hides provider failures',async()=>{
 const f=fixture(),h=createHandler({verify:a=>{if(a!=='valid')throw Error();return session;},service:f.service});
 for(const [req,status] of [[{method:'GET',headers:{}},401],[{method:'DELETE',headers:{}},405],[{method:'GET',headers:{authorization:'valid'},query:{companyId:D}},400],[{method:'POST',headers:{authorization:'valid'},query:{conversation:T},body},400]]){const r=response();await h(req,r);assert.equal(r.code,status);}
 f.fail();const r=response();await h({method:'GET',headers:{authorization:'valid'}},r);assert.equal(r.code,503);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('production recommendation explains location, goal and timeline without promising availability',()=>{
 assert.equal(recommendProduction({location:'Boston gym',goal:'Film our event',timeline:'Tomorrow'}).mode,'on_location');assert.match(recommendProduction({location:'Boston gym',goal:'Film our event',timeline:'Tomorrow'}).reason,/availability/);
 assert.equal(recommendProduction({location:'Remote',goal:'Shoot a virtual tutorial',timeline:'Next month'}).mode,'remote');
});

test('local market favors on-location without requiring detailed shoot keywords',()=>{
 const result=recommendProduction({location:'Boston, Massachusetts',goal:'Membership campaign',timeline:'December'});
 assert.equal(result.mode,'on_location');assert.match(result.reason,/may fit/);assert.match(result.reason,/before any commitment/);
});

test('clearly distant locations can suggest remote direction without promising feasibility',()=>{
 for(const location of ['Los Angeles, California','Seattle, WA','Overseas shoot requiring a flight']){
  const result=recommendProduction({location,goal:'Film our gym event on location',timeline:'Next month'});
  assert.equal(result.mode,'remote');assert.match(result.reason,/travel/);assert.match(result.reason,/confirm feasibility/);
 }
});

test('broad or unknown logistics stay neutral regardless of missing details, urgency or budget',()=>{
 for(const location of ['MASSACHUSETTS','MA','New England','TBD','', 'Cambridge, UK']){
  const result=recommendProduction({location,goal:'VIDEOS',deliverables:'VIDEOS',timeline:'DECEMBER',budget:'3000'});
  assert.equal(result.mode,null);assert.match(result.reason,/exact location and scope/);
 }
 assert.equal(recommendProduction({location:'MASSACHUSETTS',goal:'Film our gym event',timeline:'Urgent'}).mode,null);
});

test('client choice is required for neutral logistics and overrides recommendations through review and submission',async()=>{
 // Exercise actual form handlers, including the payload sent after editing/reviewing again.
 const previous=globalThis.document;
 class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.value='';this.isConnected=true;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(){} focus(){} scrollIntoView(){} reportValidity(){return true;}
 }
 globalThis.document={createElement:tag=>new Element(tag)};
 try{
  for(const location of ['Boston, Massachusetts','Los Angeles, California','MASSACHUSETTS']){
   const container=new Element('div'),sent=[];
   const ui=installStrategistActions({container,getConversation:()=>null,api:async(path,payload)=>{sent.push(payload);return {received:true};}});
   ui.request();const form=container.children[0];
   const all=()=>{const result=[];const walk=e=>{result.push(e);e.children.forEach(walk);};walk(form);return result;};
   for(const e of all().filter(e=>['INPUT','TEXTAREA'].includes(e.tagName)))e.value=e.name==='location'?location:'QA scope';
   const review=()=>form.onsubmit({preventDefault(){}});
   review();const mode=all().find(e=>e.name==='mode'),submit=all().find(e=>e.textContent==='Submit for JMN review');
   assert.equal(mode.value,recommendProduction({location}).mode||'');
   if(!mode.value){assert.equal(submit.disabled,true);await submit.onclick();assert.equal(sent.length,0);}
   const chosen=mode.value==='on_location'?'remote':'on_location';mode.value=chosen;mode.onchange();assert.equal(submit.disabled,false);
   all().find(e=>e.textContent==='Edit details').onclick();review();assert.equal(mode.value,chosen);
   await submit.onclick();assert.equal(sent.length,1);assert.equal(sent[0].mode,chosen);assert.equal(sent[0].location,location);
  }
 }finally{globalThis.document=previous;}
});

test('QA route is inaccessible in production and rejects authenticated requests',async()=>{const {default:handler}=await import('../api/qa/strategist-actions.js');const env=process.env.VERCEL_ENV,target=process.env.VERCEL_TARGET_ENV;const r=()=>({...response(),send(v){this.body=v;return this;}});try{process.env.VERCEL_ENV='production';let res=r();handler({method:'GET',headers:{},query:{}},res);assert.equal(res.code,404);process.env.VERCEL_ENV='preview';delete process.env.VERCEL_TARGET_ENV;res=r();handler({method:'GET',headers:{authorization:'secret'},query:{}},res);assert.equal(res.code,400);}finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;if(target===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=target;}});
