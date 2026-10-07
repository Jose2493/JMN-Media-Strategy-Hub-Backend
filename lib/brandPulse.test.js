import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPulseRepository,createPulseService,fallbackPulse,validatePulse,pulseDate,generatePulse,businessContext,formatPulseContext} from './brandPulse.js';
import {createBrandPulseHandler} from '../api/brand-pulse.js';
import {readFileSync} from 'node:fs';

const companyA='11111111-1111-4111-8111-111111111111', companyB='22222222-2222-4222-8222-222222222222', contact='33333333-3333-4333-8333-333333333333';
const at='2026-10-07T12:00:00.000Z',date='2026-10-07',session={companyId:companyA,contactId:contact};
// An in-memory query adapter exercises the actual repository filters and conflict flags.
function database(){
  const rows=new Map(),calls=[];let failure=false;
  return {rows,calls,setFailure(value){failure=value;},from(table){
    const filters=[];let operation='read',input,config={},maximum=Infinity;
    const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);calls.push(['eq',k,v]);return q;},is(k,v){filters.push(r=>r[k]===v);return q;},not(k,_op,v){filters.push(r=>r[k]!==v);return q;},order(){return q;},limit(n){maximum=n;return q;},maybeSingle(){config.single=true;return q;},upsert(value,options){operation='insert';input=value;config={...options};calls.push(['upsert',options]);return q;},update(value){operation='update';input=value;calls.push(['update',value]);return q;},then(resolve,reject){return Promise.resolve().then(()=>{
      if(failure)return {error:{code:'TEST'},data:null};
      if(table==='company_memory')return {data:null,error:null};
      if(table!=='company_brand_pulses')throw Error('Unexpected table');
      if(operation==='insert'){
        const key=input.company_id+':'+input.pulse_date;
        if(!rows.has(key)||!config.ignoreDuplicates)rows.set(key,{...structuredClone(input),created_at:at,answer_id:null,answered_at:null,answered_by:null});
      }
      let selected=[...rows.values()].filter(r=>filters.every(f=>f(r))).sort((a,b)=>b.pulse_date.localeCompare(a.pulse_date)).slice(0,maximum);
      if(operation==='update')for(const row of selected)Object.assign(row,input);
      // Match the repository's projection: never expose internal company/contact fields.
      const projected=selected.map(({company_id,answered_by,...row})=>structuredClone(row));
      return {data:config.single?(projected[0]||null):projected,error:null};
    }).then(resolve,reject);}};return q;
  }};
}
function setup(overrides={}){
  const db=database(),repository=createPulseRepository(()=>db);let generations=0;
  const generate=async()=>{generations++;return fallbackPulse();};
  const service=createPulseService({repository,generate,now:()=>new Date(at),...overrides});
  return {db,repository,service,count:()=>generations};
}
test('New York date is stable across UTC midnight and DST',()=>{
  assert.equal(pulseDate(new Date('2026-10-07T02:00:00Z')),'2026-10-06');
  assert.equal(pulseDate(new Date('2026-10-07T04:00:00Z')),'2026-10-07');
  assert.equal(pulseDate(new Date('2026-11-01T05:30:00Z')),'2026-11-01');
  assert.equal(pulseDate(new Date('2026-11-01T06:30:00Z')),'2026-11-01');
});
test('first load persists unanswered pulse; reload and concurrent loads reuse it',async()=>{
  const s=setup();const rows=await Promise.all(Array.from({length:12},()=>s.service({session})));
  assert.equal(s.count(),1);assert.equal(s.db.rows.size,1);assert.ok(rows.every(r=>r.answer_id===null));
  assert.deepEqual(await s.service({session}),rows[0]);assert.equal(s.count(),1);
  assert.deepEqual(s.db.calls.find(c=>c[0]==='upsert')[1],{onConflict:'company_id,pulse_date',ignoreDuplicates:true});
});
test('independent server instances keep first persisted payload on conflict',async()=>{
  const s=setup();const other=createPulseService({repository:s.repository,generate:async()=>({...fallbackPulse(),headline:'Another proposal.'}),now:()=>new Date(at)});
  const [a,b]=await Promise.all([s.service({session}),other({session})]);
  assert.deepEqual(a,b);assert.equal(s.db.rows.size,1);
});
test('first valid answer wins, stores authenticated actor/time, survives reload and retries',async()=>{
  const s=setup();await s.service({session});
  const [a,b]=await Promise.all(['bookings','retention'].map(answerId=>s.service({session,body:{pulseDate:date,answerId}})));
  assert.equal(a.answer_id,b.answer_id);assert.equal(a.answer_id,'bookings');assert.equal(a.answered_at,at);
  assert.equal(s.db.rows.get(companyA+':'+date).answered_by,contact);
  assert.deepEqual(await s.service({session}),a);
  assert.deepEqual(await s.service({session,body:{pulseDate:date,answerId:'authority'}}),a);
});
test('company B cannot read or answer company A pulse',async()=>{
  const s=setup();await s.service({session});
  await assert.rejects(s.service({session:{companyId:companyB,contactId:contact},body:{pulseDate:date,answerId:'bookings'}}),{status:404});
  assert.equal(s.db.rows.get(companyA+':'+date).answer_id,null);
  const b=await s.service({session:{companyId:companyB,contactId:contact}});assert.equal(b.answer_id,null);assert.equal(s.db.rows.size,2);
  assert.equal((await s.repository.recent(companyB)).length,0);
});
test('invalid answer and browser-supplied scope are rejected without writes',async()=>{
  const s=setup();await s.service({session});
  for(const body of [{pulseDate:date,answerId:'unknown'},{pulseDate:'2026-02-30',answerId:'bookings'},{pulseDate:'2026-99-99',answerId:'bookings'},{pulseDate:date,answerId:'bookings',company_id:companyB},{pulseDate:date,answerId:'bookings',contact_id:contact},{}])await assert.rejects(s.service({session,body}),{status:400});
  assert.equal(s.db.rows.get(companyA+':'+date).answer_id,null);
});
test('answer does not generate missing pulse; old unanswered pulse is not answered',async()=>{
  const s=setup();await assert.rejects(s.service({session,body:{pulseDate:date,answerId:'bookings'}}),{status:404});assert.equal(s.count(),0);
  await s.repository.insert(companyA,'2026-10-06',fallbackPulse());
  await assert.rejects(s.service({session,body:{pulseDate:'2026-10-06',answerId:'bookings'}}),{status:409});
});
test('clock skew never writes answered_at before created_at',async()=>{
  const s=setup({now:()=>new Date('2026-10-07T11:59:59Z')});await s.service({session});
  assert.equal((await s.service({session,body:{pulseDate:date,answerId:'bookings'}})).answered_at,at);
});
test('sparse context uses onboarding fallback without a provider call',async()=>{
  const p=await generatePulse({memory:null,recent:[]},()=>{throw Error('must not call');});assert.deepEqual(p,fallbackPulse());
});
test('provider failure/invalid payload fallback is persisted, never repeatedly regenerated',async()=>{
  for(const generate of [async()=>{throw Error('provider');},async()=>({headline:'bad'})]){
    const s=setup({generate});const p=await s.service({session});assert.deepEqual(p.payload,fallbackPulse());assert.deepEqual(await s.service({session}),p);
  }
});
test('storage failure fails closed before model generation',async()=>{
  const s=setup();s.db.setFailure(true);await assert.rejects(s.service({session}),{status:503});assert.equal(s.count(),0);
});
test('strict validation rejects extra fields, duplicate IDs, long text and oversized UTF8',()=>{
  assert.deepEqual(validatePulse(fallbackPulse()),fallbackPulse());
  const duplicate=fallbackPulse();duplicate.options[1].id=duplicate.options[0].id;
  for(const p of [{...fallbackPulse(),secret:'x'},duplicate,{...fallbackPulse(),insight:'x'.repeat(161)},{...fallbackPulse(),question:'x\ny'},{...fallbackPulse(),options:[]},{...fallbackPulse(),headline:'é'.repeat(8192)}])assert.throws(()=>validatePulse(p));
});
test('generation uses bounded business fields and previous dated answers, returns validated JSON',async()=>{
  let request;
  const row={pulse_date:date,payload:fallbackPulse(),answer_id:'retention'};
  const p=await generatePulse({memory:{goals:'Retention',private_email:'SECRET'},recent:[row]},async(_url,options)=>{request=JSON.parse(options.body);return {ok:true,json:async()=>({content:[{type:'text',text:JSON.stringify(fallbackPulse())}]})};});
  assert.deepEqual(p,fallbackPulse());assert.equal(JSON.stringify(request).includes('SECRET'),false);assert.match(request.messages[0].content,/retention/);assert.match(request.messages[0].content,/2026-10-07/);assert.equal(request.max_tokens,600);
  assert.equal(businessContext({goals:'x'.repeat(1000)}).goals.length,300);
});
test('Strategist receives dated selected context without option feedback or actor identifiers',()=>{
  const text=formatPulseContext({pulse_date:date,payload:fallbackPulse(),answer_id:'retention'});
  assert.match(text,/2026-10-07/);assert.match(text,/Customer retention/);assert.match(text,/not a permanent fact/);assert.equal(text.includes('Let’s'),false);
  assert.equal(formatPulseContext({pulse_date:date,payload:fallbackPulse(),answer_id:null}),'');
});
test('endpoint authenticates, rejects scope/query injection and unsupported methods',async()=>{
  let received;
  const handler=createBrandPulseHandler({verify:()=>session,service:async input=>{received=input;return {payload:fallbackPulse()};}});
  const invoke=async(req)=>{const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};await handler({headers:{},...req},res);return res;};
  assert.equal((await invoke({method:'GET',query:{company_id:companyB}})).code,400);
  assert.equal((await invoke({method:'DELETE'})).code,405);
  assert.equal((await invoke({method:'GET'})).code,200);assert.deepEqual(received.session,session);
  const denied=createBrandPulseHandler({verify:()=>{throw Error();},service:()=>{throw Error('must not call');}});
  const r={setHeader(){},status(n){this.code=n;return this;},json(){return this;}};await denied({method:'GET',headers:{}},r);assert.equal(r.code,401);
});
test('migration is limited to daily-state table with RLS, atomic key and complete answer checks',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261007010000_company_brand_pulses.sql',import.meta.url),'utf8');
  assert.match(sql,/primary key \(company_id, pulse_date\)/);assert.match(sql,/enable row level security/);assert.match(sql,/revoke all.*anon, authenticated/);assert.match(sql,/answered_at >= created_at/);assert.match(sql,/answer_id is null and answered_at is null and answered_by is null/);
  assert.equal((sql.match(/create table /g)||[]).length,1);assert.equal(sql.includes('create or replace function'),false);
});
