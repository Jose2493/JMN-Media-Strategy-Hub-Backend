import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import handler from '../api/qa/portal.js';
const source=readFileSync(new URL('../public/portal-embed.js',import.meta.url),'utf8');
function fixture({standalone=false,search=''}={}){
 const messages=[],listeners={},frames=[],classes=[],styles={};let height=480;
 const parent={postMessage:(data,origin)=>messages.push({data,origin})};
 const window={parent,addEventListener:(name,fn)=>listeners[name]=fn};if(standalone)window.parent=window;
 let observer;const context={window,location:{search},URLSearchParams,document:{documentElement:{classList:{add:c=>classes.push(c)},style:{setProperty:(k,v)=>styles[k]=v}},body:{getBoundingClientRect:()=>({height}),get scrollHeight(){return height;}}},requestAnimationFrame:f=>frames.push(f),ResizeObserver:class{constructor(f){observer=f;}observe(){}}};
 vm.runInNewContext(source,context);
 return {messages,classes,styles,parent,window,init:data=>listeners.message?.(data),flush:()=>{while(frames.length)frames.shift()();},resize:value=>{height=value;observer?.();}};
}
test('embed handshake rejects foreign origins/sources and resizes both growth and shrinkage',()=>{
 const f=fixture();assert.equal(f.classes[0],'portal-embedded');assert.equal(f.messages[0].origin,'https://portal.jmnmedia.com');
 for(const event of [{origin:'https://attacker.example',source:f.parent},{origin:'https://portal.jmnmedia.com',source:{}}]){f.init({...event,data:{type:'jmn:portal-init',version:1,viewportHeight:800}});f.flush();assert.equal(f.messages.length,1);}
 f.init({origin:'https://portal.jmnmedia.com',source:f.parent,data:{type:'jmn:portal-init',version:1,viewportHeight:800}});f.flush();assert.equal(f.styles['--portal-viewport-height'],'800px');assert.equal(f.messages.at(-1).data.height,480);
 f.resize(1400);f.flush();assert.equal(f.messages.at(-1).data.height,1400);f.resize(380);f.flush();assert.equal(f.messages.at(-1).data.height,380);assert.ok(f.messages.every(m=>m.origin!=='*'&&!('sessionToken' in m.data)));
});
test('standalone and same-origin Strategist dialog do not use SuiteDash resize handshake',()=>{
 for(const options of [{standalone:true},{search:'?embedded=1'}]){const f=fixture(options);assert.equal(f.messages.length,0);assert.equal(f.classes.length,0);}
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},send(body){this.body=body;return this;}});
test('portal visual fixtures fail closed in production and reject credentials/unknown selectors',()=>{
 const old=process.env.VERCEL_ENV,target=process.env.VERCEL_TARGET_ENV;
 try{
  for(const env of ['production','development',undefined]){process.env.VERCEL_ENV=env;const r=response();handler({method:'GET',url:'/api/qa/portal?page=home',headers:{}},r);assert.equal(r.code,404);}
  process.env.VERCEL_ENV='preview';delete process.env.VERCEL_TARGET_ENV;
  for(const req of [{method:'POST',url:'?page=home',headers:{}},{method:'GET',url:'?page=home',headers:{authorization:'Bearer fictional'}},{method:'GET',url:'?page=home&token=fictional',headers:{}},{method:'GET',url:'?page=home&page=social',headers:{}}]){const r=response();handler(req,r);assert.equal(r.code,400);}
  for(const page of ['home','social','strategy','design']){const r=response();handler({method:'GET',url:'?page='+page,headers:{}},r);assert.equal(r.code,200);assert.match(r.headers['Content-Security-Policy'],/connect-src 'none'/);assert.match(r.body,/Preview QA · fictional data/);assert.match(r.body,/portal-shell.css/);}
  process.env.VERCEL_TARGET_ENV='production';const r=response();handler({method:'GET',url:'?page=home',headers:{}},r);assert.equal(r.code,404);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;if(target===undefined)delete process.env.VERCEL_TARGET_ENV;else process.env.VERCEL_TARGET_ENV=target;}
});
test('Home preserves known top-level portal links, honest defaults and conditional Design Studio',()=>{
 const home=readFileSync(new URL('../public/client-home.html',import.meta.url),'utf8');
 assert.match(home,/Welcome back\./);assert.match(home,/173775/);assert.match(home,/174976/);assert.match(home,/data-destination="design" hidden/);assert.doesNotMatch(home,/localStorage|sessionStorage|iframe|fetch\(/);
 const names=['Strategy Session','Social Center','Projects','Media &amp; Deliverables','Design Studio'];let previous=-1;
 for(const name of names){const index=home.indexOf('<h3>'+name);assert.ok(index>previous);previous=index;}
});
test('Home display configuration rejects off-origin links and never interprets contact names as HTML',()=>{
 const heading={textContent:''},nodes=new Map();
 function slot(key){const children=[],hint={hidden:false},div={append:a=>children.push(a)};const node={dataset:{destination:key},hidden:key==='design',querySelector:s=>s==='.configured-link'?children.at(-1):s==='.menu-hint'?hint:s==='h3'?{textContent:key}:div,children};nodes.set(key,node);return node;}
 const slots=['projects','media','design'].map(slot);
 const document={querySelectorAll:()=>slots,getElementById:()=>heading,createElement:()=>({remove(){}})};
 const context={document,window:{},URL};vm.runInNewContext(readFileSync(new URL('../public/client-home.js',import.meta.url),'utf8'),context);
 context.window.JmnHomeDisplay({contactName:'<script>fictional</script>',designStudioVisible:'true',links:{projects:'https://attacker.example/portal/projects',media:'javascript:alert(1)',design:'https://portal.jmnmedia.com/portal/dashboard/view/1'}});
 assert.equal(heading.textContent,'Welcome back, <script>fictional</script>.');assert.equal(nodes.get('projects').children.length,0);assert.equal(nodes.get('media').children.length,0);assert.equal(nodes.get('design').hidden,true);
 context.window.JmnHomeDisplay({designStudioVisible:true,links:{design:'https://portal.jmnmedia.com/portal/dashboard/view/1'}});assert.equal(nodes.get('design').hidden,false);assert.equal(nodes.get('design').children[0].target,'_top');
});
