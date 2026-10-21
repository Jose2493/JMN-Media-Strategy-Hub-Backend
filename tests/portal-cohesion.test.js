import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import qa from '../api/qa/portal-cohesion.js';
import {cockpitModel} from '../public/client-cockpit-model.js';
const source=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');

test('page-scoped parent rejects wrong origins, source windows, channels and invalid heights; grows and shrinks',()=>{
 const listeners={},sent=[],wrapper={style:{},classList:{contains:c=>c==='cbe-block-iframe-wrapper'}};
 const frame=kind=>({dataset:{jmnWorkspace:kind},src:'https://preview.example/'+kind,style:{},parentElement:wrapper,contentWindow:{postMessage:(data,origin)=>sent.push({data,origin})},setAttribute(){},addEventListener(type,fn){this[type]=fn;}});
 const strategy=frame('strategy'),social=frame('social'),unknown=frame('__proto__');
 vm.runInNewContext(source('portal-embed.js'),{URL,location:{href:'https://portal.jmnmedia.com/'},document:{querySelectorAll:selector=>{assert.equal(selector,'iframe[data-jmn-workspace]');return [strategy,social,unknown];}},window:{addEventListener:(type,fn)=>{(listeners[type]??=[]).push(fn);},visualViewport:{addEventListener(){}}}});
 const send=(height,{origin='https://preview.example',from=strategy.contentWindow,channel='strategy'}={})=>listeners.message.forEach(fn=>fn({source:from,origin,data:{type:`jmn:${channel}-height`,height}}));
 send(900,{origin:'https://wrong.example'});send(900,{from:{}});send(900,{channel:'social'});for(const h of [0,-1,1.2,'900',1000001,NaN,Infinity])send(h);
 assert.equal(strategy.style.height,undefined);assert.equal(social.style.height,undefined);assert.equal(unknown.style.width,undefined);
 send(25000);assert.equal(strategy.style.height,'25000px');send(520);assert.equal(strategy.style.height,'520px');assert.equal(social.style.height,undefined);
 assert.equal(wrapper.style.height,'auto');assert.equal(wrapper.style.overflow,'visible');assert.equal(strategy.style.position,'static');
 strategy.load();listeners.resize.forEach(fn=>fn());assert.ok(sent.some(x=>x.data.type==='jmn:strategy-measure'&&x.origin==='https://preview.example'));
});

test('child publishes only natural height and respects the workspace measurement channel',()=>{
 const events={},sent=[];let queued,height=1400;
 const root={getBoundingClientRect:()=>({top:0,bottom:height}),get scrollHeight(){return height;}},body={getBoundingClientRect:()=>({bottom:height})},parent={postMessage:(data,origin)=>sent.push({data,origin})};
 const window={parent,scrollY:0,requestAnimationFrame:fn=>{queued=fn;},addEventListener:(type,fn)=>events[type]=fn,visualViewport:{addEventListener:(type,fn)=>events['visual:'+type]=fn}};
 const context={window,document:{body},ResizeObserver:class{constructor(fn){events.resizeObserver=fn;}observe(){}},Math};
 vm.runInNewContext(source('client-cockpit-height.js').replace('export function','function')+'\nobserveCockpitHeight(root, ["https://portal.jmnmedia.com"], "jmn:strategy");',{...context,root});
 queued();assert.equal(sent[0].data.type,'jmn:strategy-height');assert.deepEqual(Object.keys(sent[0].data).sort(),['height','type']);
 height=520;events.resizeObserver();queued();assert.equal(sent.at(-1).data.height,520);
 queued=null;events.message({source:parent,origin:'https://portal.jmnmedia.com',data:{type:'jmn:social-measure'}});assert.equal(queued,null);
 events.message({source:parent,origin:'https://portal.jmnmedia.com',data:{type:'jmn:strategy-measure'}});assert.equal(typeof queued,'function');
});

test('normal workspace document mode leaves the existing Social strategist modal bounded',()=>{
 const code=source('portal-surface.js').replace(/^import[^\n]+\n/gm,'');
 for(const [kind,search,expected] of [['strategy','',true],['strategy','?embedded=1',false],['social','',true],['design','',true]]){
  const classes=[],calls=[],root={};vm.runInNewContext(code,{URLSearchParams,location:{search,origin:'https://preview.example'},document:{body:{dataset:{jmnWorkspace:kind}},documentElement:{classList:{add:c=>classes.push(c)}},querySelector:()=>root},observeCockpitHeight:(...args)=>calls.push(args)});
  assert.equal(classes.includes('portal-document'),expected);assert.equal(calls.length,Number(expected));if(expected)assert.equal(calls[0][2],`jmn:${kind}`);
 }
});

test('Home priority titles use existing state and unknown counts remain unknown',()=>{
 const base={review:0,drafts:0,approved:0,scheduled:0,published:null,instagram:null,company:null};
 assert.match(cockpitModel({...base,review:2}).priorityTitle,/Review/);assert.match(cockpitModel({...base,drafts:1}).priorityTitle,/draft/);assert.match(cockpitModel({...base,approved:4}).priorityTitle,/approved/);
 assert.equal(cockpitModel(base).pipeline.at(-1)[1],null);assert.equal(cockpitModel(base).action,'strategy');
});

test('fictional cohesion route rejects production, credentials, writes and unknown views',()=>{
 const env=process.env.VERCEL_ENV,target=process.env.VERCEL_TARGET_ENV;
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},send(body){this.body=body;return this;}});
 try{
  for(const value of ['production','development']){process.env.VERCEL_ENV=value;const r=response();qa({method:'GET',headers:{},query:{}},r);assert.equal(r.code,404);}
  process.env.VERCEL_ENV='preview';process.env.VERCEL_TARGET_ENV='production';let r=response();qa({method:'GET',headers:{},query:{}},r);assert.equal(r.code,404);delete process.env.VERCEL_TARGET_ENV;
  for(const req of [{method:'POST',headers:{},query:{}},{method:'GET',headers:{authorization:'Bearer fictional'},query:{}},{method:'GET',headers:{},query:{view:'unknown'}},{method:'GET',headers:{},query:{companyId:'foreign'}}]){r=response();qa(req,r);assert.equal(r.code,400);}
  for(const view of ['strategy','social','design','home','onboarding']){r=response();qa({method:'GET',headers:{},query:{view}},r);assert.equal(r.code,200);assert.match(r.headers['Content-Security-Policy'],/connect-src 'none'/);assert.ok(!r.body.includes('src="/strategist.js"'));assert.ok(!r.body.includes('src="/social-command-center.js"'));assert.ok(!r.body.includes('src="/client-cockpit.js"'));assert.ok(!r.body.includes('src="/design-studio.js"'));}
 }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;if(target===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=target;}
});
