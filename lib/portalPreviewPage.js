import {readFileSync} from 'node:fs';
// Literal file paths let Vercel trace the static page sources into this QA function.
const pages={
 home:readFileSync(new URL('../public/client-home.html',import.meta.url),'utf8'),
 social:readFileSync(new URL('../public/social-command-center.html',import.meta.url),'utf8'),
 strategy:readFileSync(new URL('../public/strategist.html',import.meta.url),'utf8'),
 design:readFileSync(new URL('../public/design-studio.html',import.meta.url),'utf8')
};
export function portalPreviewPage(page,nonce){
 if(!Object.hasOwn(pages,page))return null;
 let html=pages[page].replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/gi,'');
 if(page==='design')html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const fixture=`(() => {
 const page=${JSON.stringify(page)};
 document.documentElement.classList.add('portal-embedded');
 document.documentElement.style.setProperty('--portal-viewport-height',Math.max(420,window.innerHeight-40)+'px');
 window.addEventListener('resize',()=>document.documentElement.style.setProperty('--portal-viewport-height',Math.max(420,window.innerHeight-40)+'px'));
 const session='e30.'+btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600}))+'.fictional';
 if(page==='social'||page==='strategy')history.replaceState(null,'',location.pathname+location.search+'#token=FICTIONAL_QA_ONLY');
 const account={id:'22222222-2222-4222-8222-222222222222',username:'qa_studio',displayName:'Fictional QA Studio',accountType:'BUSINESS',status:'active',tokenExpiresAt:'2099-01-01T00:00:00Z',scopes:[]};
 const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900"><rect width="720" height="900" fill="#39304f"/><text x="55" y="450" fill="#d3baff" font-size="38">FICTIONAL REVIEW PREVIEW</text></svg>');
 // All requests are intercepted in this preview document; no DB, OAuth or mutations.
 window.fetch=async (input,options={})=>{
  const url=new URL(String(input),location.origin);let data;
  if(url.pathname==='/api/session-exchange')data={sessionToken:session,expiresInSeconds:3600};
  else if(url.pathname==='/api/social/approved-content'&&options.method==='POST'&&['review','preview'].includes(JSON.parse(options.body||'{}').command))data={id:'33333333-3333-4333-8333-333333333333',title:'Fictional campaign preview',kind:'IMAGE',status:'IN_REVIEW',previewUrl:image,posterUrl:image};
  else if(url.pathname==='/api/social/publishing'&&options.method==='POST'&&JSON.parse(options.body||'{}').command==='preview')data={url:image};
  else if(options.method&&options.method!=='GET')return new Response(JSON.stringify({error:'Preview only. Changes are disabled.'}),{status:403,headers:{'Content-Type':'application/json'}});
  else if(url.pathname==='/api/social/instagram-status')data={accounts:[account]};
  else if(url.pathname==='/api/social/approved-content')data={assets:[{id:'33333333-3333-4333-8333-333333333333',title:'Fictional campaign preview',kind:'IMAGE',caption:'A fictional campaign caption.',status:'IN_REVIEW',previewUrl:image,posterUrl:image,createdAt:'2026-10-01T12:00:00Z'}]};
  else if(url.pathname==='/api/social/publishing')data={jobs:[{id:'44444444-4444-4444-8444-444444444444',kind:'IMAGE',caption:'Fictional draft: welcome to the studio.',status:'draft',created_at:'2026-10-01T12:00:00Z'}],ready:false};
  else if(url.pathname==='/api/social/instagram-metrics')data={accountId:account.id,profile:{followers:240,following:120},dailyReach:[{endTime:'2026-10-01T00:00:00Z',value:80},{endTime:'2026-10-02T00:00:00Z',value:120}],recentMedia:[],fetchedAt:'2026-10-02T00:00:00Z'};
  else if(url.pathname==='/api/strategist'&&url.searchParams.get('action')==='plan')data={version:0,state:{}};
  else if(url.pathname==='/api/strategist')data={campaigns:[],threads:[]};
  else return new Response(JSON.stringify({error:'Unavailable in fictional preview'}),{status:403});
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 window.addEventListener('DOMContentLoaded',()=>{
  const banner=document.createElement('aside');banner.className='portal-qa-note';banner.textContent='Preview QA · fictional data · no saves, connections or publishing';document.body.prepend(banner);
  if(page==='home'){
   window.JmnHomeDisplay({contactName:'Alex',designStudioVisible:false});
   for(const link of document.querySelectorAll('a')){
    const dest=link.href.includes('/173775')?'strategy':link.href.includes('/174976')?'social':null;
    if(dest){link.href='/api/qa/portal?page='+dest;link.target='_self';}
   }
  }
  if(page==='design'){
   document.getElementById('access-gate').hidden=true;document.getElementById('main').hidden=false;
   const wrap=document.getElementById('canvas-wrap');wrap.replaceChildren();const sample=document.createElement('img');sample.src=image;sample.alt='Fictional design layout preview; artwork engine is not loaded';sample.style.cssText='width:80%;max-height:80%;object-fit:contain';wrap.append(sample);
   document.getElementById('status').textContent='Layout preview only. Template access and artwork export are not connected.';
   const select=document.getElementById('country-select');select.replaceChildren();const option=document.createElement('option');option.textContent='United States (fictional preview)';select.append(option);
  }
 });
})();`;
 html=html.replace('</head>',`<style>.portal-qa-note{padding:10px 12px;background:#30283f;color:#d8c4ff;font:12px/1.5 system-ui;border-bottom:1px solid #504362}.portal-embedded .gate{min-height:320px}</style></head>`);
 // A script before every module script installs the inert fetch adapter first.
 html=html.replace('<head>',`<head><script nonce="${nonce}">${fixture}</script>`);
 return html.replace(/<script\b(?![^>]*\bnonce=)/gi,`<script nonce="${nonce}"`);
}
