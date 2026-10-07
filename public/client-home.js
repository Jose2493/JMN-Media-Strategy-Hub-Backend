(() => {
 'use strict';
 // SuiteDash owns identity, permissions and native destinations. Presentation only.
 const slots=new Map([...document.querySelectorAll('[data-destination]')].map(node=>[node.dataset.destination,node]));
 const safeLink=value=>{
  if(typeof value!=='string')return null;
  try{const url=new URL(value);return url.origin==='https://portal.jmnmedia.com'&&url.pathname.startsWith('/portal/')&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:null;}catch{return null;}
 };
 window.JmnHomeDisplay=display=>{
  if(!display||typeof display!=='object')return;
  const name=typeof display.contactName==='string'?display.contactName.trim().slice(0,80).split(/\s+/)[0]:'';
  document.getElementById('welcome-title').textContent=name?'Welcome back, '+name+'.':'Welcome back.';
  for(const [key,node] of slots){
   const link=safeLink(display.links?.[key]);
   if(key==='design'&&(display.designStudioVisible!==true||!link)){node.hidden=true;node.querySelector('.configured-link')?.remove();continue;}
   node.hidden=false;node.querySelector('.configured-link')?.remove();
   const hint=node.querySelector('.menu-hint');if(hint)hint.hidden=!!link;
   if(!link)continue;
   const anchor=document.createElement('a');anchor.className='configured-link home-button';anchor.href=link;anchor.target='_top';anchor.textContent='Open '+node.querySelector('h3').textContent;
   node.querySelector('div').append(anchor);
  }
 };
})();
