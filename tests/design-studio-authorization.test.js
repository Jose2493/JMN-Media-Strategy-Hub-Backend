import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDesignService} from '../lib/designTemplates.js';
import {createDesignHandler} from '../lib/designStudioHandlers.js';
import {DESIGN_TEMPLATE_SLUG} from '../lib/designStudioEditor.js';

const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const CA='33333333-3333-4333-8333-333333333333',CB='44444444-4444-4444-8444-444444444444';
const T='55555555-5555-4555-8555-555555555555',secret='local-design-test-secret-at-least-32-chars';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvXsAAAAASUVORK5CYII=','base64');
function fixture(){
  const rows={contacts:[{id:CA,company_id:A},{id:CB,company_id:B}],design_templates:[{id:T,name:'Semper Athlete Shirt 01',slug:DESIGN_TEMPLATE_SLUG,is_active:true,template_config:{assetPath:'private/qa',assets:{shirtMockup:'shirt.png',semperMark:'mark.png',semperCrossfitUsa:'art.png',neckLabel:'label.png'}}}],design_template_access:[{id:'grant',company_id:A,design_template_id:T}]};
  let reads=0;const state={rows,fail:null,public:false};
  const db={from(table){let data=rows[table];const query={select(){return query;},eq(key,value){data=data.filter(row=>row[key]===value);return query;},async maybeSingle(){return state.fail===table?{error:{message:'PRIVATE DB DETAIL'}}:{data:data[0]||null};}};return query;},storage:{getBucket:async()=>({data:{public:state.public}}),from:()=>({download:async()=>{reads++;return {data:new Blob([png],{type:'image/png'})};}})}};
  return {...state,state,service:createDesignService(()=>db),assetReads:()=>reads};
}
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;},send(v){this.body=v;return this;}};}
const token=(companyId,contactId,options={})=>jwt.sign({companyId,contactId},secret,{expiresIn:300,...options});
async function request(f,kind,company=A,contact=CA,extra={}){
  const res=response();const handler=createDesignHandler(kind,{service:f.service,verify:header=>{
    const match=/^Bearer (.+)$/.exec(header);if(!match)throw Error();
    return jwt.verify(match[1],secret,{algorithms:['HS256']});
  }});
  await handler({method:kind==='export'?'POST':'GET',headers:{authorization:'Bearer '+token(company,contact)},query:kind==='asset'?{slug:DESIGN_TEMPLATE_SLUG,asset:'shirtMockup'}:{slug:DESIGN_TEMPLATE_SLUG},body:kind==='export'?{slug:DESIGN_TEMPLATE_SLUG,mode:'mockup',png:'data:image/png;base64,'+png.toString('base64')}:{},...extra},res);return res;
}
test('authorized company receives its private editor, asset bytes and exact PNG export',async()=>{
  const f=fixture(),metadata=await request(f,'template');assert.equal(metadata.statusCode,200);assert.equal(metadata.body.template.id,T);
  assert.ok(metadata.body.template.editor.script.includes('mountDesignStudio'));
  assert.ok(Object.values(metadata.body.template.assets).every(path=>path.startsWith('/api/design-asset?')));
  assert.ok(!JSON.stringify(metadata.body).includes('private/qa'));assert.equal(f.assetReads(),0);
  const asset=await request(f,'asset');assert.equal(asset.statusCode,200);assert.deepEqual(asset.body,png);
  const exported=await request(f,'export',A,CA,{query:{}});assert.equal(exported.statusCode,200);assert.deepEqual(exported.body,png);assert.match(exported.headers['Content-Disposition'],/attachment/);
});
test('TEST/Company B cannot read metadata/assets or download/export via direct endpoints',async()=>{
  const f=fixture();for(const kind of ['template','asset','export']){
    const denied=await request(f,kind,B,CB,{...(kind==='export'?{query:{}}:{})});assert.equal(denied.statusCode,404);
    assert.deepEqual(denied.body,{error:'Design Studio is not available for this workspace'});
    assert.ok(!JSON.stringify(denied).includes('Semper'));assert.match(denied.headers['Cache-Control'],/no-store/);
  }assert.equal(f.assetReads(),0);
});
test('company ownership overrides cannot replace the verified session company',async()=>{
  const f=fixture();for(const companyKey of ['company_id','companyId']){
    for(const kind of ['template','asset','export']){
      const extra=kind==='export'?{query:{},body:{slug:DESIGN_TEMPLATE_SLUG,mode:'mockup',png:'data:image/png;base64,'+png.toString('base64'),[companyKey]:A}}:{query:{slug:DESIGN_TEMPLATE_SLUG,[companyKey]:A}};
      assert.equal((await request(f,kind,B,CB,extra)).statusCode,400);
    }
  }assert.equal(f.assetReads(),0);
});
test('inactive, absent, ungranted, lookup failure and contact/company mismatch fail closed',async()=>{
  for(const reason of ['inactive','absent','ungranted','error','contact']){
    const f=fixture();if(reason==='inactive')f.rows.design_templates[0].is_active=false;
    if(reason==='absent')f.rows.design_templates.length=0;if(reason==='ungranted')f.rows.design_template_access.length=0;
    if(reason==='error')f.state.fail='design_template_access';
    for(const kind of ['template','asset','export']){
      const res=await request(f,kind,A,reason==='contact'?CB:CA,{...(kind==='export'?{query:{}}:{})});assert.equal(res.statusCode,404);assert.ok(!JSON.stringify(res).includes('PRIVATE'));
    }assert.equal(f.assetReads(),0);
  }
});
test('revocation is checked independently on asset and export after initial approval',async()=>{
  const f=fixture();assert.equal((await request(f,'template')).statusCode,200);f.rows.design_template_access.length=0;
  assert.equal((await request(f,'asset')).statusCode,404);assert.equal((await request(f,'export',A,CA,{query:{}})).statusCode,404);assert.equal(f.assetReads(),0);
});
test('asset paths cannot escape template storage and public buckets are refused',async()=>{
  for(const invalid of ['../foreign.png','/foreign.png','https://foreign.example/x']){const f=fixture();f.rows.design_templates[0].template_config.assets.shirtMockup=invalid;assert.equal((await request(f,'asset')).statusCode,503);assert.equal(f.assetReads(),0);}
  const f=fixture();f.state.public=true;assert.equal((await request(f,'asset')).statusCode,503);assert.equal(f.assetReads(),0);
});
test('real session verifier denies missing, expired and malformed identity on every route',async()=>{
  const previous=process.env.SESSION_JWT_SECRET;process.env.SESSION_JWT_SECRET=secret;
  try{for(const kind of ['template','asset','export'])for(const header of ['', 'Bearer '+token(A,CA,{expiresIn:-1}),'Bearer '+jwt.sign({companyId:A},secret)]){
    let calls=0;const handler=createDesignHandler(kind,{service:{authorize(){calls++;}}}),res=response();
    await handler({method:kind==='export'?'POST':'GET',headers:{authorization:header},query:{},body:{}},res);assert.equal(res.statusCode,401);assert.equal(calls,0);
  }}finally{if(previous===undefined)delete process.env.SESSION_JWT_SECRET;else process.env.SESSION_JWT_SECRET=previous;}
});
test('public direct URL has no protected template metadata, variables, assets or controls',()=>{
  for(const file of ['design-studio.html','design-studio.js','design-studio.css']){
    const source=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/Semper|TORRES|semper-|shirt-mockup\.png|athlete-name-input|download-btn/);
  }
});
const shellSource=readFileSync(new URL('../public/design-studio.js',import.meta.url),'utf8');
function shell(fetch){const nodes={studio:{innerHTML:'',replaceChildren(){this.innerHTML='';}},'studio-status':{textContent:'Checking',hidden:false}},events={},appended=[],history=[];
 const window={addEventListener:(key,fn)=>events[key]=fn};
 vm.runInNewContext(shellSource,{window,document:{getElementById:key=>nodes[key],querySelectorAll:()=>[],createElement:tag=>({tag,dataset:{}}),head:{append:node=>appended.push(node)}},fetch,location:{hash:'#token=QA%2Bonly%3D',pathname:'/design-studio.html',search:''},history:{replaceState:(...args)=>history.push(args)},Date,URL,Blob,setTimeout:fn=>{events.expire=fn;},clearTimeout(){}});return {nodes,events,appended,history};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('denied client never mounts template content or loads editor dependencies',async()=>{
 const calls=[],s=shell(async(url,options)=>{calls.push({url,options});return url.includes('exchange')?{ok:true,json:async()=>({sessionToken:'fictional',expiresInSeconds:1800})}:{ok:false,status:404};});await tick();
 assert.equal(s.nodes.studio.innerHTML,'');assert.equal(s.appended.length,0);assert.match(s.nodes['studio-status'].textContent,/not available for this workspace/);assert.equal(s.history[0][2],'/design-studio.html');assert.equal(JSON.parse(calls[0].options.body).bootstrapToken,'QA+only=');
});
test('late authorization cannot render after expiry or page exit',async()=>{
 for(const event of ['expire','pagehide']){let finish;const s=shell(async url=>url.includes('exchange')?{ok:true,json:async()=>({sessionToken:'fictional',expiresInSeconds:1800})}:new Promise(resolve=>finish=resolve));await tick();s.events[event]();finish({ok:true,json:async()=>({template:{name:'PRIVATE',slug:'private',editor:{html:'PRIVATE',css:'',script:'function(){}'}}})});await tick();assert.equal(s.nodes.studio.innerHTML,'');assert.equal(s.appended.length,0);}
});
