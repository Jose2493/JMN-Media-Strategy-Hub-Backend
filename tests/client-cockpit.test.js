import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {createCockpitService} from '../lib/clientCockpit.js';
import {createHandler} from '../api/client-cockpit.js';
import qa from '../api/qa/client-cockpit.js';
import {cockpitModel} from '../public/client-cockpit-model.js';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(d){this.data=d;return this;},send(d){this.data=d;return this;}});
function database({fail=null,grant=true}={}){
 const rows={companies:[{id:A,business_name:'Alpha'},{id:B,business_name:'Beta'}],social_approved_assets:[{id:1,company_id:A,status:'IN_REVIEW'},{id:2,company_id:B,status:'APPROVED'}],social_publish_jobs:[{id:3,company_id:A,status:'draft'},{id:4,company_id:B,status:'scheduled'}],design_templates:[{id:'template',slug:'semper-athlete-shirt-01',is_active:true}],design_template_access:grant?[{id:5,company_id:A,design_template_id:'template'}]:[]};
 return {from(table){let selected=rows[table],single=false,options;const query={select(fields,opts){options=opts;return query;},eq(k,v){selected=selected.filter(r=>r[k]===v);return query;},maybeSingle(){single=true;return query;},then(resolve,reject){return Promise.resolve(table===fail?{error:{message:'private SQL error'}}:{data:single?selected[0]||null:selected,count:options?.count?selected.length:null}).then(resolve,reject);}};return query;}};
}
test('summary scopes every company record and count; design access cannot cross tenants',async()=>{
 const seen=[];const load=createCockpitService({getDb:()=>database(),accounts:async company=>{seen.push(company);return [];}});
 const a=await load({companyId:A}),b=await load({companyId:B});
 assert.equal(a.company.business_name,'Alpha');assert.equal(a.review,1);assert.equal(a.approved,0);assert.equal(a.drafts,1);assert.equal(a.scheduled,0);assert.equal(a.design,true);
 assert.equal(b.company.business_name,'Beta');assert.equal(b.review,0);assert.equal(b.approved,1);assert.equal(b.drafts,0);assert.equal(b.scheduled,1);assert.equal(b.design,false);assert.deepEqual(seen,[A,B]);
});
test('failed sources remain unknown, never zero; design failure fails closed',async()=>{
 const result=await createCockpitService({getDb:()=>database({fail:'design_template_access'}),accounts:async()=>{throw Error('secret');}})({companyId:A});
 assert.equal(result.design,null);assert.equal(result.instagram,null);assert.equal(result.review,1);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('expired and revoked accounts require attention',async()=>{
 const load=createCockpitService({getDb:()=>database(),now:()=>1000,accounts:async()=>[{status:'active',tokenExpiresAt:new Date(2000).toISOString()},{status:'active',tokenExpiresAt:new Date(500).toISOString()},{status:'revoked',tokenExpiresAt:new Date(2000).toISOString()}]});
 assert.deepEqual((await load({companyId:A})).instagram,{connected:1,attention:2,total:3});
});
test('real verifier rejects absent/expired sessions before any read',async()=>{
 let calls=0;const handler=createHandler({load:async()=>{calls++;}});const old=process.env.SESSION_JWT_SECRET;process.env.SESSION_JWT_SECRET='test-only-secret-over-16-characters';
 try{for(const token of ['',jwt.sign({companyId:A,contactId:B},process.env.SESSION_JWT_SECRET,{expiresIn:-1})]){const res=response();await handler({method:'GET',headers:{authorization:token?'Bearer '+token:''},query:{}},res);assert.equal(res.statusCode,401);}assert.equal(calls,0);}finally{if(old===undefined)delete process.env.SESSION_JWT_SECRET;else process.env.SESSION_JWT_SECRET=old;}
});
test('handler forbids writes and client company overrides, forwards only verified identity',async()=>{
 let seen;const handler=createHandler({verify:()=>({companyId:A,contactId:B}),load:async session=>{seen=session;return {review:1};}});
 for(const req of [{method:'POST',headers:{},query:{}},{method:'GET',headers:{},query:{companyId:B}}]){const res=response();await handler(req,res);assert.ok([400,405].includes(res.statusCode));assert.equal(seen,undefined);}
 const res=response();await handler({method:'GET',headers:{},query:{}},res);assert.equal(res.statusCode,200);assert.equal(seen.companyId,A);assert.equal(res.headers['Cache-Control'],'private, no-store');
});
const empty={company:{business_name:'Alpha'},review:0,approved:0,drafts:0,scheduled:0,published:0,instagram:{connected:1,total:1,attention:0},design:false};
test('empty cockpit has no invented attention; pulse chooses highest priority',()=>{
 assert.deepEqual(cockpitModel(empty).attention,[]);assert.equal(cockpitModel(empty).action,'strategy');
 const model=cockpitModel({...empty,review:2,drafts:1});assert.equal(model.attention.length,2);assert.match(model.pulse,/review/);assert.equal(model.action,'social');
 assert.match(cockpitModel({...empty,review:null}).status,/unavailable/);
});
test('QA is inaccessible in production and refuses credentials or query flags',()=>{
 const env=process.env.VERCEL_ENV,target=process.env.VERCEL_TARGET_ENV;
 try{for(const [value,t,expected] of [['production','production',404],['preview','production',404],['preview','preview',200]]){process.env.VERCEL_ENV=value;process.env.VERCEL_TARGET_ENV=t;const res=response();qa({method:'GET',headers:{},url:'/api/qa/client-cockpit'},res);assert.equal(res.statusCode,expected);}
 for(const req of [{method:'GET',headers:{authorization:'Bearer example'},url:'/api/qa/client-cockpit'},{method:'GET',headers:{},url:'/api/qa/client-cockpit?qa=true'}]){const res=response();qa(req,res);assert.equal(res.statusCode,400);}
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;if(target===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=target;}
});

import {renderCockpit,workspaceInitials} from '../public/client-cockpit-view.js';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;}
}
const flatten=n=>[n,...n.children.flatMap(flatten)];
test('view hides unauthorized design, renders untrusted names as text, and QA links cannot navigate',()=>{
 const previous=globalThis.document;globalThis.document={createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
 try{
  const root=new Element('main');renderCockpit(root,{...empty,company:{business_name:'<img src=x onerror=alert(1)>'}},{qa:true});
  assert.equal(flatten(root).some(n=>n.tag==='img'),false);assert.ok(flatten(root).some(n=>n.textContent.startsWith('<img')));
  assert.equal(flatten(root).some(n=>n.textContent==='Design Studio ↗'),false);assert.equal(flatten(root).some(n=>n.textContent==='Needs Your Attention'),false);
  let prevented=0;const action=flatten(root).find(n=>n.textContent==='Strategy Session ↗');action.listeners.click({preventDefault(){prevented++;}});assert.equal(prevented,1);
  renderCockpit(root,{...empty,design:true},{qa:true});assert.ok(flatten(root).some(n=>n.textContent==='Design Studio ↗'));assert.equal(root.attrs['aria-busy'],'false');
 }finally{globalThis.document=previous;}
});

import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const authSource=readFileSync(new URL('../public/client-cockpit.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function authHarness(fetch){
 const root=new Element('main'),events={},renders=[],history=[];
 const context={document:{getElementById:()=>root,createElement:t=>new Element(t)},location:{hash:'#token=QA%2Bonly%3D',pathname:'/client-cockpit.html',search:'',origin:'https://preview.example'},history:{replaceState(...v){history.push(v);}},window:{addEventListener(k,fn){events[k]=fn;}},ResizeObserver:class{observe(){}},renderCockpit:(...args)=>renders.push(args),fetch,Date,URL,setTimeout:fn=>{events.expire=fn;return 1;},clearTimeout(){}};
 context.observeCockpitHeight=()=>{};context.window.parent=context.window;vm.runInNewContext(authSource,context);return {root,events,renders,history};
}
test('bootstrap preserves Base64 plus and clears fragment; expiry clears private UI',async()=>{
 const calls=[];const h=authHarness(async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>url.includes('exchange')?{sessionToken:'fictional-session',expiresInSeconds:1800}:empty};});
 await tick();assert.equal(JSON.parse(calls[0].options.body).bootstrapToken,'QA+only=');assert.equal(h.history[0][2],'/client-cockpit.html');assert.equal(calls[1].options.headers.Authorization,'Bearer fictional-session');assert.equal(h.renders.length,1);
 h.events.expire();assert.match(h.root.children[0].textContent,/Reopen Home/);
});
test('late exchange cannot restore a session after leaving the page',async()=>{
 let finish;const h=authHarness(()=>new Promise(resolve=>{finish=resolve;}));h.events.pagehide();finish({ok:true,json:async()=>({sessionToken:'fictional-session',expiresInSeconds:1800})});await tick();assert.equal(h.renders.length,0);assert.match(h.root.children[0].textContent,/Reopen Home/);
});
test('late summary cannot restore private content after expiry',async()=>{
 let finish;const h=authHarness(async url=>url.includes('exchange')?{ok:true,json:async()=>({sessionToken:'fictional-session',expiresInSeconds:1800})}:new Promise(resolve=>{finish=resolve;}));await tick();h.events.expire();finish({ok:true,status:200,json:async()=>empty});await tick();assert.equal(h.renders.length,0);assert.match(h.root.children[0].textContent,/Reopen Home/);
});

import frameQa from '../api/qa/client-cockpit-frame.js';
test('iframe QA remains preview-only',()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';try{const res=response();frameQa({method:'GET',headers:{},url:'/api/qa/client-cockpit-frame'},res);assert.equal(res.statusCode,404);}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
test('parent sizing accepts only its own iframe origin/source and valid heights, including shrink',()=>{
 let receive;const requests=[],events={};const frame={src:'https://preview.example/api/qa/client-cockpit',contentWindow:{postMessage:(...args)=>requests.push(args)},style:{},setAttribute(){},addEventListener:(type,fn)=>events[type]=fn};
 vm.runInNewContext(readFileSync(new URL('../public/client-cockpit-embed.js',import.meta.url),'utf8'),{URL,document:{getElementById:()=>frame},window:{addEventListener:(type,fn)=>{if(type==='message')receive=fn;else events[type]=fn;}}});
 const send=(height,origin='https://preview.example',source=frame.contentWindow)=>receive({origin,source,data:{type:'jmn:cockpit-height',height}});
 send(700,'https://evil.example');send(700,'https://preview.example',{});send(-1);send('700');send(10001);assert.equal(frame.style.height,undefined);
 send(1200);assert.equal(frame.style.height,'1200px');send(350);assert.equal(frame.style.height,'350px');
 assert.equal(requests.length,1);events.load();events.resize();assert.equal(requests.length,3);assert.equal(requests[0][1],'https://preview.example');
});

test('SuiteDash native wrapper follows reported height instead of clipping an absolute iframe',()=>{
 for(const native of [true,false]){
  let receive;
  const wrapper={classList:{contains:name=>native&&name==='cbe-block-iframe-wrapper'},style:{padding:'56.25% 0 0',height:'450px',overflow:'hidden'}};
  const frame={src:'https://preview.example/client-cockpit.html',parentElement:wrapper,contentWindow:{postMessage(){}},style:{position:'absolute'},setAttribute(){},addEventListener(){}};
  vm.runInNewContext(readFileSync(new URL('../public/client-cockpit-embed.js',import.meta.url),'utf8'),{URL,document:{getElementById:()=>frame},window:{addEventListener:(type,fn)=>{if(type==='message')receive=fn;}}});
  if(native){assert.equal(wrapper.style.padding,'0');assert.equal(wrapper.style.height,'auto');assert.equal(wrapper.style.overflow,'visible');assert.equal(frame.style.position,'static');}
  else{assert.equal(wrapper.style.height,'450px');assert.equal(wrapper.style.padding,'56.25% 0 0');assert.equal(frame.style.position,'absolute');}
  for(const height of [1500,400]){receive({origin:'https://preview.example',source:frame.contentWindow,data:{type:'jmn:cockpit-height',height}});assert.equal(frame.style.height,height+'px');}
 }
});

test('height reporting includes document content and remeasures after reflow, late parent setup and shrink',()=>{
 let height=1250,queued;const events={},sent=[],observed=[];
 const root={getBoundingClientRect:()=>({top:0,bottom:height}),get scrollHeight(){return height;}};
 const parent={postMessage:(...args)=>sent.push(args)};
 const window={parent,scrollY:0,requestAnimationFrame:fn=>{queued=fn;},addEventListener:(k,fn)=>events[k]=fn,visualViewport:{addEventListener:(k,fn)=>events['visual:'+k]=fn}};
 const body={getBoundingClientRect:()=>({bottom:height})};
 const context={window,document:{body},ResizeObserver:class{constructor(fn){events.observer=fn;}observe(node){observed.push(node);}}};
 vm.runInNewContext(readFileSync(new URL('../public/client-cockpit-height.js',import.meta.url),'utf8').replace('export function','function')+'\nobserveCockpitHeight(root,["https://portal.jmnmedia.com"]);',{...context,root});
 queued();assert.equal(sent.at(-1)[0].height,1250);assert.deepEqual(observed,[root,body]);
 height=1600;events.resize();queued();assert.equal(sent.at(-1)[0].height,1600);
 height=700;events.observer();queued();assert.equal(sent.at(-1)[0].height,700);
 events['visual:resize']();queued();assert.equal(sent.at(-1)[0].height,700);
 queued=null;events.message({source:{},origin:'https://portal.jmnmedia.com',data:{type:'jmn:cockpit-measure'}});assert.equal(queued,null);
 events.message({source:parent,origin:'https://evil.example',data:{type:'jmn:cockpit-measure'}});assert.equal(queued,null);
 events.message({source:parent,origin:'https://portal.jmnmedia.com',data:{type:'jmn:cockpit-measure'}});assert.equal(typeof queued,'function');queued();assert.equal(sent.at(-1)[1],'https://portal.jmnmedia.com');
});
test('attention links retain navigation and Daily Pulse is the sole primary action',()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Element(t),createElementNS:(_,tag)=>new Element(tag)};
 try{const root=new Element('main');renderCockpit(root,{...empty,review:2,drafts:1,design:true});const nodes=flatten(root);assert.equal(nodes.filter(n=>n.className==='action primary').length,1);assert.equal(nodes.find(n=>n.className==='action primary').textContent,'Open Social Center →');
 const rows=nodes.filter(n=>n.tag==='li');assert.equal(rows.length,2);for(const row of rows){assert.equal(row.children.length,1);assert.equal(row.children[0].tag,'a');assert.match(row.children[0].href,/174976$/);}
 assert.ok(nodes.some(n=>n.textContent==='Today’s priority · Daily Pulse by JMN'));assert.ok(nodes.some(n=>n.textContent==='Review your next piece of content'));
 }finally{globalThis.document=previous;}
});

test('workspace initials handle missing, Unicode and long company names without interpreting markup',()=>{
 assert.equal(workspaceInitials(null),'JM');assert.equal(workspaceInitials('   '),'JM');
 assert.equal(workspaceInitials('Northline Studio'),'NS');assert.equal(workspaceInitials('café'),'CA');
 assert.equal(workspaceInitials('東京珈琲'),'東京');assert.equal(workspaceInitials('Élan & Co'),'ÉC');
 assert.equal(workspaceInitials('☕'),'JM');
});
test('visual states distinguish unavailable from zero, preserve exact counts, and add no media sources',()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t)};
 try{
  const data={...empty,review:null,approved:0,scheduled:7,published:12345,instagram:null,company:{business_name:'Northline Studio',logo_url:'https://untrusted.example/image'}};
  const root=new Element('main');renderCockpit(root,data);const nodes=flatten(root),stages=nodes.filter(n=>n.className==='stage');
  assert.deepEqual(stages.map(n=>n.attrs['data-state']),['unknown','empty','active','active']);
  assert.deepEqual(nodes.filter(n=>n.className==='stage-count').map(n=>n.textContent),['—','0','7','12345']);
  assert.match(stages[0].attrs['aria-label'],/unavailable/);assert.match(stages[1].attrs['aria-label'],/Approved: 0/);
  assert.ok(nodes.some(n=>n.className==='summary-item channel-status unknown'));
  assert.ok(nodes.some(n=>n.textContent===cockpitModel(data).pulse));
  assert.equal(nodes.some(n=>['img','image'].includes(n.tag)),false);
  assert.ok(nodes.filter(n=>n.tag==='svg').every(n=>n.attrs['aria-hidden']==='true'&&n.attrs.focusable==='false'));
 }finally{globalThis.document=previous;}
});
test('channel cues never imply a healthy connection for disconnected, failed or unavailable accounts',()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t)};
 try{
  for(const [instagram,state,label] of [[null,'unknown','Instagram status unavailable'],[{connected:0,total:0,attention:0},'offline','Instagram not connected'],[{connected:1,total:2,attention:1},'attention','Instagram needs attention'],[{connected:1,total:1,attention:0},'connected','Instagram connected']]){
   const root=new Element('main');renderCockpit(root,{...empty,instagram});const nodes=flatten(root);
   const cue=nodes.find(n=>n.className===`summary-item channel-status ${state}`);assert.ok(cue);assert.ok(flatten(cue).some(n=>n.textContent===label));
  }
 }finally{globalThis.document=previous;}
});
test('visual enrichment preserves authorized Design navigation and existing pipeline destinations',()=>{
 const previous=globalThis.document;globalThis.document={createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t)};
 try{
  let navigated=0;const root=new Element('main');renderCockpit(root,{...empty,design:true},{navigateDesign:()=>navigated++});
  const nodes=flatten(root);nodes.find(n=>n.textContent==='Design Studio ↗').listeners.click();assert.equal(navigated,1);
  const stages=nodes.filter(n=>n.className==='stage');assert.equal(stages.length,4);assert.ok(stages.every(n=>n.href==='https://portal.jmnmedia.com/portal/dashboard/view/174976'&&n.target==='_top'));
 }finally{globalThis.document=previous;}
});
