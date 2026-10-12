import {renderCockpit} from './client-cockpit-view.js';
const root=document.getElementById('cockpit');
let session=null,bootstrap=null,expires=0,timer,active=true;
function gate(message='Reopen Home from your client portal to continue.') {
  session=null;bootstrap=null;clearTimeout(timer);root.replaceChildren();root.setAttribute('aria-busy','false');const p=document.createElement('p');p.setAttribute('role','status');p.textContent=message;root.append(p);
}
async function load(){
  if(!session||Date.now()>=expires)return gate();
  const current=session;
  root.setAttribute('aria-busy','true');
  try{
    const response=await fetch('/api/client-cockpit',{headers:{Authorization:`Bearer ${session}`},cache:'no-store'});
    if(response.status===401)return gate();
    if(!response.ok)throw Error();
    const data=await response.json();
    if(session!==current||Date.now()>=expires)return;
    renderCockpit(root,data,{navigateDesign:()=>{
      if(!bootstrap||Date.now()>=expires)return gate();
      // Same-origin existing bootstrap flow; editor independently rechecks template access.
      const url=new URL('/design-studio.html',location.origin);url.hash='token='+encodeURIComponent(bootstrap);location.assign(url.href);
    }});
  }catch{
    if(session!==current)return;
    root.replaceChildren();root.setAttribute('aria-busy','false');const p=document.createElement('p');p.setAttribute('role','alert');p.textContent='Your workspace could not load. Please retry.';const b=document.createElement('button');b.textContent='Retry';b.className='action';b.onclick=load;root.append(p,b);
  }
}
root.addEventListener('cockpit:retry',load);
window.addEventListener('pagehide',()=>{active=false;gate();});
async function start(){
  const hash=location.hash;
  if(hash)history.replaceState(null,'',location.pathname+location.search);
  try{if(hash.startsWith('#token=')&&!hash.includes('&'))bootstrap=decodeURIComponent(hash.slice(7));}catch{}
  if(!bootstrap||bootstrap.length>4096)return gate();
  try{
    const response=await fetch('/api/session-exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bootstrapToken:bootstrap}),cache:'no-store'});
    if(!response.ok)return gate();
    const data=await response.json();
    if(!active)return;
    if(typeof data.sessionToken!=='string'||!data.sessionToken||!Number.isSafeInteger(data.expiresInSeconds)||data.expiresInSeconds<1||data.expiresInSeconds>3600)return gate();
    session=data.sessionToken;expires=Date.now()+data.expiresInSeconds*1000;timer=setTimeout(gate,data.expiresInSeconds*1000);await load();
  }catch{gate();}
}
start();
// Only layout metadata is sent to the known SuiteDash hosts; no identity or tokens.
const publishHeight=()=>{
  if(window.parent===window)return;
  const height=Math.ceil(root.getBoundingClientRect().height);
  for(const origin of ['https://portal.jmnmedia.com','https://app.suitedash.com'])window.parent.postMessage({type:'jmn:cockpit-height',height},origin);
};
new ResizeObserver(publishHeight).observe(root);
