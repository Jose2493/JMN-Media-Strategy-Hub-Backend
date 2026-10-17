const root=document.getElementById('studio'),status=document.getElementById('studio-status');
let session=null,expiresAt=0,timer,active=true;
const unavailable=()=>{
  session=null;clearTimeout(timer);delete window.__jmnDesignEditorContext;
  root.replaceChildren();status.hidden=false;status.textContent='Design Studio is not available for this workspace';
  document.querySelectorAll('[data-design-private]').forEach(node=>node.remove());
};
const script=src=>new Promise((resolve,reject)=>{const node=document.createElement('script');node.src=src;node.onload=resolve;node.onerror=reject;document.head.append(node);});
window.addEventListener('pagehide',()=>{active=false;unavailable();});
async function start(){
  const fragment=location.hash;if(fragment)history.replaceState(null,'',location.pathname+location.search);
  let bootstrap;try{if(fragment.startsWith('#token=')&&!fragment.includes('&'))bootstrap=decodeURIComponent(fragment.slice(7));}catch{}
  if(!bootstrap||bootstrap.length>4096)return unavailable();
  try{
    const exchange=await fetch('/api/session-exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bootstrapToken:bootstrap}),cache:'no-store'});bootstrap=null;
    if(!exchange.ok)return unavailable();const auth=await exchange.json();
    if(!active||typeof auth.sessionToken!=='string'||!auth.sessionToken||!Number.isSafeInteger(auth.expiresInSeconds)||auth.expiresInSeconds<1||auth.expiresInSeconds>3600)return unavailable();
    session=auth.sessionToken;expiresAt=Date.now()+auth.expiresInSeconds*1000;timer=setTimeout(unavailable,auth.expiresInSeconds*1000);
    const current=session,response=await fetch('/api/design-template',{headers:{Authorization:'Bearer '+current},cache:'no-store'});
    if(!response.ok)return unavailable();const {template}=await response.json();
    if(!active||session!==current||Date.now()>=expiresAt)return unavailable();
    if(!template?.editor||typeof template.editor.html!=='string'||typeof template.editor.script!=='string'||typeof template.editor.css!=='string'||typeof template.name!=='string'||typeof template.slug!=='string')return unavailable();
    // Load dependencies and editor only after server-side template approval.
    await script('https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js');
    if(!active||session!==current||Date.now()>=expiresAt)return unavailable();
    const style=document.createElement('style');style.dataset.designPrivate='';style.textContent=template.editor.css;document.head.append(style);
    const font=document.createElement('link');font.rel='stylesheet';font.href='https://fonts.googleapis.com/css2?family=Quantico:ital,wght@1,700&display=swap';font.dataset.designPrivate='';document.head.append(font);
    root.innerHTML=template.editor.html;
    window.__jmnDesignEditorContext={assets:template.assets,slug:template.slug,name:template.name,sessionToken:current,expiresAt,onUnavailable:unavailable};
    const objectUrl=URL.createObjectURL(new Blob(['('+template.editor.script+')(window.__jmnDesignEditorContext);delete window.__jmnDesignEditorContext;'],{type:'text/javascript'}));
    try{await script(objectUrl);}finally{URL.revokeObjectURL(objectUrl);delete window.__jmnDesignEditorContext;}
    if(!active||session!==current||Date.now()>=expiresAt)return unavailable();status.hidden=true;
  }catch{unavailable();}
}
start();
