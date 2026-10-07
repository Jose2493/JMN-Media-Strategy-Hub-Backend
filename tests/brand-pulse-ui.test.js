import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fallbackPulse} from '../lib/brandPulse.js';

const source=readFileSync(new URL('../public/brand-pulse.js',import.meta.url),'utf8');
function fixture({failure=false,hash=''}={}){
  const nodes=new Map(),listeners={},requests=[],timers=[];let saved=null;
  function element(){return {textContent:'',hidden:false,disabled:false,children:[],attributes:{},firstChild:{textContent:''},setAttribute(k,v){this.attributes[k]=v;},replaceChildren(){this.children=[];},append(node){this.children.push(node);},querySelectorAll(){return this.children;}};}
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const section=element(),parent={},window={parent,addEventListener:(event,fn)=>listeners[event]=fn};
  const token='e30.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+1800})).toString('base64url')+'.fictional';
  const row=()=>({pulse_date:'2026-10-07',payload:fallbackPulse(),created_at:'2026-10-07T12:00:00Z',answer_id:saved,answered_at:saved?'2026-10-07T12:01:00Z':null});
  const context={window,document:{getElementById:get,querySelector:()=>section,createElement:element},location:{hash,pathname:'/client-home.html',search:''},history:{replaceState(...args){requests.push(['history',args[2]]);}},atob:s=>Buffer.from(s,'base64').toString(),setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},fetch:async(url,options)=>{
    requests.push([url,options]);
    if(url==='/api/session-exchange')return {ok:true,json:async()=>({sessionToken:token,expiresInSeconds:1800})};
    if(failure)return {ok:false,status:503,json:async()=>({error:'Brand Pulse is temporarily unavailable'})};
    if(options.method==='POST')saved ||= JSON.parse(options.body).answerId;
    return {ok:true,status:200,json:async()=>({pulse:row()})};
  }};
  vm.runInNewContext(source,context);
  const flush=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
  const init=(origin='https://portal.jmnmedia.com',source=parent)=>listeners.message({origin,source,data:{type:'jmn:portal-init',version:1,sessionToken:token}});
  return {get,section,requests,timers,init,flush};
}
test('Home only initializes from trusted portal origin and parent',async()=>{
  const f=fixture();f.init('https://attacker.example');f.init('https://portal.jmnmedia.com',{});await f.flush();assert.equal(f.requests.length,0);
  f.init();await f.flush();assert.equal(f.requests.length,1);assert.equal(f.get('pulse-options').children.length,4);assert.equal(f.get('pulse-question').textContent,fallbackPulse().question);
});
test('answer UI saves only date/option, shows selected feedback, locks answer and retains existing CTA',async()=>{
  const f=fixture();f.init();await f.flush();await f.get('pulse-options').children[1].onclick();await f.flush();
  const body=JSON.parse(f.requests.at(-1)[1].body);assert.deepEqual(body,{pulseDate:'2026-10-07',answerId:'retention'});
  assert.equal(f.get('pulse-feedback').textContent,'Good signal. Customer retention should shape what we create next.');
  assert.equal(f.get('pulse-options').children.filter(b=>!b.hidden).length,1);assert.ok(f.get('pulse-options').children.every(b=>b.disabled));
  assert.equal(f.get('pulse-cta').firstChild.textContent,'Continue with Andrés ');
  assert.equal(f.get('pulse-status').textContent,'');
});
test('storage failure shows an honest retry state without invented options',async()=>{
  const f=fixture({failure:true});f.init();await f.flush();assert.equal(f.get('pulse-options').children.length,0);assert.match(f.get('pulse-status').textContent,/temporarily unavailable/);assert.equal(f.get('pulse-retry').hidden,false);
});
test('bootstrap uses existing session exchange and immediately removes hash',async()=>{
  const f=fixture({hash:'#token=FICTIONAL'});await f.flush();assert.equal(f.requests[0][0],'history');assert.equal(f.requests[0][1],'/client-home.html');assert.equal(f.requests[1][0],'/api/session-exchange');assert.equal(f.requests[2][0],'/api/brand-pulse');
});
test('session expiry clears company pulse from the page',async()=>{
  const f=fixture();f.init();await f.flush();f.timers[0]();assert.equal(f.get('pulse-content').hidden,true);assert.match(f.get('pulse-status').textContent,/Reopen Home/);assert.equal(f.get('pulse-date').textContent,'');
});
test('Home order, disclosure, CTA and stylesheet support an open editorial pulse without scroll containers',()=>{
  const html=readFileSync(new URL('../public/client-home.html',import.meta.url),'utf8'),css=readFileSync(new URL('../public/client-home.css',import.meta.url),'utf8');
  assert.ok(html.indexOf('home-welcome')<html.indexOf('class="brand-pulse"'));assert.ok(html.indexOf('class="brand-pulse"')<html.indexOf('class="next-move"'));
  assert.match(html,/Your JMN AI Strategic Partner/);assert.match(html,/not a human/);assert.match(html,/id="pulse-cta"[^>]*href="https:\/\/portal.jmnmedia.com\/portal\/dashboard\/view\/173775"[^>]*target="_top"/);
  assert.match(css,/pulse-options\{display:flex;flex-wrap:wrap/);assert.doesNotMatch(css,/overflow\s*:\s*(auto|scroll)/);
  assert.doesNotMatch(source,/localStorage|sessionStorage|api\.anthropic|api\.openai|innerHTML/);
});
