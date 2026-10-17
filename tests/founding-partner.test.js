import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoundingService,validateFoundingBody} from '../lib/foundingPartners.js';
import {createHandler} from '../api/founding-partner.js';
import qaHandler from '../api/qa/founding-partner.js';
import {foundingMoves} from '../public/founding-partner-view.js';
const C='11111111-1111-4111-8111-111111111111',D='22222222-2222-4222-8222-222222222222',U='33333333-3333-4333-8333-333333333333',V='44444444-4444-4444-8444-444444444444',P='55555555-5555-4555-8555-555555555555';
const session={companyId:C,contactId:U};
function fixture(kind='company'){
 const row={contact_id:U,company_id:C,partner_key:kind==='project'?'riany':'semper',workspace_kind:kind,project_id:kind==='project'?P:null,display_name:kind==='project'?'Riany Mena':'Semper CrossFit',category:'Example category',strategy_focus:'A clear goal',media_available:true,active:true,completed_at:null};
 const tables={companies:[{id:C,business_name:'Semper CrossFit',industry:'Fitness'}],contacts:[{id:U,company_id:C},{id:V,company_id:D}],projects:[{id:P,company_id:C}],founding_partner_workspaces:[row],founding_partner_feedback:[]};let calls=0,fail=false;
 const db={from(table){let filters=[],payload,mode;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},maybeSingle(){return Promise.resolve(run(true));},update(p){payload=p;mode='update';return q;},upsert(p){payload=p;mode='upsert';return q;},then(ok,no){return Promise.resolve(run()).then(ok,no);}};
 function run(single=false){if(fail)return {error:{message:'PRIVATE SQL'}};const rows=tables[table].filter(r=>filters.every(f=>f(r)));if(mode==='update')rows.forEach(r=>Object.assign(r,payload));if(mode==='upsert'){const existing=tables[table].find(r=>r.contact_id===payload.contact_id);if(existing)Object.assign(existing,payload);else tables[table].push(payload);}return {data:single?rows[0]||null:rows};}return q;}};
 const service=createFoundingService({getDb:()=>db,now:()=>Date.parse('2026-10-17T00:00:00Z'),cockpit:async s=>{assert.deepEqual(s,session);calls++;return {review:2,approved:1,drafts:0,scheduled:0,published:4,design:kind==='company'};},accounts:async company=>{assert.equal(company,C);return [{username:'example',status:'active',tokenExpiresAt:'2027-01-01'}];}});
 return {service,tables,row,calls:()=>calls,fail:()=>fail=true};
}
for(const kind of ['company','project'])test(`${kind} enrollment resolves scoped identity, curated context and entitlement`,async()=>{
 const f=fixture(kind),r=await f.service.load(session);assert.equal(r.eligible,true);assert.equal(r.workspace.kind,kind);assert.equal(r.areas.design,kind==='company');assert.deepEqual(r.terms,{complimentaryMonths:2,monthlyUsdAfter:20,privateBeta:true});assert.equal(r.activityScope,'company');assert.equal(r.instagram.handles[0],'example');assert.equal(JSON.stringify(r).includes(U),false);assert.equal(JSON.stringify(r).includes('project_id'),false);
});
test('unenrolled TEST cannot read partner context or save feedback/completion',async()=>{
 const f=fixture(),other={companyId:D,contactId:V};assert.deepEqual(await f.service.load(other),{eligible:false});assert.equal(f.calls(),0);for(const action of ['feedback','complete'])await assert.rejects(f.service.save(other,{action}),e=>e.status===403);assert.equal(f.tables.founding_partner_feedback.length,0);
});
test('stale contact membership, disabled enrollment and foreign project fail closed',async()=>{
 let f=fixture();await assert.rejects(f.service.load({companyId:D,contactId:U}),e=>e.status===403);
 f=fixture();f.row.active=false;assert.deepEqual(await f.service.load(session),{eligible:false});
 f=fixture('project');f.tables.projects[0].company_id=D;assert.deepEqual(await f.service.load(session),{eligible:false});assert.equal(f.calls(),0);
});
test('completion is idempotent and feedback stores only current tenant ownership',async()=>{
 const f=fixture();await f.service.save(session,{action:'complete'});const time=f.row.completed_at;await f.service.save(session,{action:'complete'});assert.equal(f.row.completed_at,time);assert.equal((await f.service.load(session)).completed,true);
 await f.service.save(session,validateFoundingBody({action:'feedback',kind:'issue',rating:2,note:'Needs help'}));await f.service.save(session,validateFoundingBody({action:'feedback',kind:'feedback',rating:5,note:''}));assert.equal(f.tables.founding_partner_feedback.length,1);assert.equal(f.tables.founding_partner_feedback[0].company_id,C);assert.equal(f.tables.founding_partner_feedback[0].rating,5);
});
test('validation rejects ownership overrides, oversized notes and malformed feedback',()=>{
 for(const body of [null,[],{action:'complete',companyId:D},{action:'feedback',kind:'feedback',rating:6},{action:'feedback',kind:'issue',rating:'5'},{action:'feedback',kind:'issue',note:'x'.repeat(501)},{action:'feedback',kind:'issue',note:' '},{action:'feedback',kind:'unknown',rating:1}])assert.throws(()=>validateFoundingBody(body));
 assert.equal(validateFoundingBody({action:'feedback',kind:'issue',note:' hello '}).note,'hello');
});
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}});
test('API guards authentication, methods, ownership and private caching',async()=>{
 let calls=0;const h=createHandler({verify:auth=>{if(auth!=='valid')throw Error();return session;},service:{load:async()=>{calls++;return {eligible:false};},save:async()=>{calls++;return {saved:true};}}});
 for(const [req,code] of [[{method:'GET',headers:{}},401],[{method:'DELETE',headers:{authorization:'valid'}},405],[{method:'GET',headers:{authorization:'valid'},query:{company_id:D}},400],[{method:'POST',headers:{authorization:'valid'},body:{action:'complete',company_id:D}},400]]){const res=response();await h(req,res);assert.equal(res.code,code);assert.match(res.headers['Cache-Control'],/no-store/);}assert.equal(calls,0);
 const r=response();await h({method:'GET',headers:{authorization:'valid'}},r);assert.equal(r.code,200);assert.equal(calls,1);
});
test('provider error is neutral and cannot leak database details',async()=>{const f=fixture();f.fail();const h=createHandler({verify:()=>session,service:f.service}),r=response();await h({method:'GET',headers:{}},r);assert.equal(r.code,503);assert.ok(!JSON.stringify(r).includes('PRIVATE'));});
test('recommendations stay bounded and never recommend unentitled design',()=>{const data={workspace:{focus:''},activity:{review:0,drafts:0},instagram:null,areas:{design:false}};const moves=foundingMoves(data);assert.ok(moves.length>=2&&moves.length<=3);assert.ok(moves.every(m=>m.area!=='design'));});
test('fictional preview route cannot run in production',()=>{const a=process.env.VERCEL_ENV,b=process.env.VERCEL_TARGET_ENV;try{process.env.VERCEL_ENV='production';const r=response();qaHandler({method:'GET',headers:{},url:'/api/qa/founding-partner'},r);assert.equal(r.code,404);process.env.VERCEL_ENV='preview';process.env.VERCEL_TARGET_ENV='production';const s=response();qaHandler({method:'GET',headers:{},url:'/api/qa/founding-partner'},s);assert.equal(s.code,404);}finally{if(a===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=a;if(b===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=b;}});
