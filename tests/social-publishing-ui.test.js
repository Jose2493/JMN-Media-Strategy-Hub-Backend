import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// A small DOM adapter keeps interaction/contract checks dependency-free.
// Layout and native dialog focus behavior still need a browser review.
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.listeners={};this.textContent='';this.value='';this.files=[];this.classList={add(){},remove(){}};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);if(this.tag==='select'&&this.children.length===1)this.value=n.value;}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){(this.listeners[k]||=[]).push(fn);}
 dispatchEvent(e){this['on'+e.type]?.(e);for(const fn of this.listeners[e.type]||[])fn(e);}
 showModal(){this.open=true;}
 close(){this.open=false;this.dispatchEvent({type:'close'});}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 focus(){this.focused=true;}
 get isConnected(){return !!this.parent;}
}
const source=readFileSync(new URL('../public/social-publishing.js',import.meta.url),'utf8');
const all=n=>[n,...n.children.flatMap(all)];
const find=(n,p)=>all(n).find(p);
const click=(root,text)=>{const n=find(root,n=>n.tag==='button'&&n.textContent===text);assert.ok(n,`Button ${text} exists`);return n.onclick();};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({jobs=[],ready=true,scopes=['instagram_business_content_publish']}={}){
 const body=new Element('body'),root=new Element('main');body.append(root);
 const calls=[],uploads=[];let connections=0;
 const context={document:{body,hidden:false,createElement:t=>new Element(t)},window:{confirm:()=>true},crypto:{randomUUID:()=> 'new-id'},Intl,Date,Event,Image:class {width=100;height=100;async decode(){}},URL:class extends URL {static createObjectURL(){return 'blob:preview';}static revokeObjectURL(){}},setInterval:()=>1,clearInterval(){},fetch:async(url,options)=>{uploads.push({url:String(url),options});return {ok:true};}};
 vm.runInNewContext(source,context);
 const instance=context.window.JmnPublishing.mount(root,{account:{username:'jmnmedia',scopes},connect:()=>connections++,request:async payload=>{calls.push(payload);if(!payload)return {jobs,ready};if(payload.command==='preview')return {url:'https://example.supabase.co/preview'};if(payload.command==='upload')return {uploadUrl:'https://example.supabase.co/upload'};return {};}});
 await tick();return {root,body,calls,uploads,context,instance,connections:()=>connections};
}
test('filters retain all job states and existing draft/cancel actions',async()=>{
 const f=await setup({jobs:['draft','scheduled','published','failed','uncertain','processing','cancelled'].map(status=>({id:status,status,caption:status}))});
 const rows=()=>all(f.root).filter(n=>n.tag==='article');assert.equal(rows().length,7);
 click(f.root,'Drafts');assert.equal(rows().length,1);assert.ok(find(f.root,n=>n.textContent==='Continue draft'));
 click(f.root,'Scheduled');assert.equal(rows().length,1);await click(f.root,'Cancel');assert.deepEqual({...f.calls.find(c=>c?.command==='cancel')},{command:'cancel',id:'scheduled'});
 click(f.root,'Published');assert.equal(rows().length,1);click(f.root,'Posts');assert.equal(rows().length,7);f.instance.close();
});
test('empty states and readiness do not invent active publishing',async()=>{
 for(const options of [{ready:false},{scopes:[]}]){
  const f=await setup(options);assert.ok(!find(f.root,n=>n.textContent==='Auto-publishing active'));
  click(f.root,'Scheduled');assert.ok(find(f.root,n=>n.textContent==='Nothing scheduled yet'));
  if(options.scopes){click(f.root,'Enable publishing');assert.equal(f.connections(),1);}f.instance.close();
 }
});
test('composer keeps schedule default, switches controls, and updates live caption',async()=>{
 const f=await setup();click(f.root,'+ Create post');const d=find(f.body,n=>n.tag==='dialog');
 const date=find(d,n=>n.type==='datetime-local');assert.ok(!date.parent.hidden);
 assert.ok(find(d,n=>n.textContent==='Schedule post'));
 const radio=find(d,n=>n.type==='radio'&&n.value==='now');radio.onchange();assert.equal(date.parent.hidden,true);assert.ok(find(d,n=>n.textContent==='Post now'));
 const caption=find(d,n=>n.tag==='textarea');assert.equal(caption.maxLength,2200);caption.value='Test';caption.oninput();assert.ok(find(d,n=>n.textContent==='4 / 2,200'));assert.equal(find(d,n=>n.className==='publisher-preview-caption').textContent,'Test');
 const actions=find(d,n=>n.className==='publisher-actions');assert.equal(actions.parent,d);click(d,'Cancel');assert.equal(d.open,false);f.instance.close();
});
test('existing draft saves without reupload and keeps the exact save payload',async()=>{
 const f=await setup({jobs:[{id:'draft-id',status:'draft',kind:'IMAGE',caption:'Saved caption'}]});click(f.root,'Continue draft');await tick();const d=find(f.body,n=>n.tag==='dialog');await click(d,'Save draft');
 const call=f.calls.find(c=>c?.command==='save');assert.deepEqual({...call},{command:'save',id:'draft-id',caption:'Saved caption',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',now:false,scheduledAt:null});assert.equal(f.uploads.length,0);f.instance.close();
});
test('new media uses original signed upload and post-now request',async()=>{
 const f=await setup();click(f.root,'+ Create post');const d=find(f.body,n=>n.tag==='dialog'),file=find(d,n=>n.type==='file');const media={name:'photo.jpg',type:'image/jpeg',size:1024};file.files=[media];await file.onchange();
 find(d,n=>n.type==='radio'&&n.value==='now').onchange();await click(d,'Post now');
 assert.equal(f.uploads.length,1);assert.equal(f.uploads[0].options.method,'PUT');assert.equal(f.uploads[0].options.body,media);
 const call=f.calls.find(c=>c?.command==='schedule');assert.equal(call.now,true);assert.equal(call.scheduledAt,null);assert.equal(call.id,'new-id');f.instance.close();
});
test('schedule validation and activation guard prevent accidental requests',async()=>{
 for(const ready of [false,true]){const f=await setup({ready});click(f.root,'+ Create post');const d=find(f.body,n=>n.tag==='dialog');await click(d,'Schedule post');assert.equal(f.calls.filter(Boolean).length,0);assert.ok(find(d,n=>n.className==='publishing-warning').textContent);f.instance.close();}
});
