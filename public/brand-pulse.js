(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const parentOrigin = 'https://portal.jmnmedia.com';
  let token=null,bootstrap=null,expiry=null,renew=null,pulse=null,busy=false,initialized=false;
  const section=document.querySelector('.brand-pulse');
  function state(message){$('pulse-status').textContent=message;}
  function setBusy(value){busy=value;section.setAttribute('aria-busy',String(value));for(const b of $('pulse-options').querySelectorAll('button'))b.disabled=value||!!pulse?.answer_id||!token;$('pulse-retry').disabled=value;}
  function lock(){token=null;clearTimeout(expiry);clearTimeout(renew);pulse=null;$('pulse-content').hidden=true;$('pulse-date').textContent='';$('pulse-title').textContent='One small question. A clearer next move.';$('pulse-insight').textContent='A daily moment to focus on what matters for your business.';state('Your session is unavailable. Reopen Home from your client portal.');setBusy(false);}
  function installToken(value){
    try{
      if(typeof value!=='string'||value.length>4096)throw Error();
      const payload=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      const remaining=payload.exp*1000-Date.now();
      if(!Number.isFinite(remaining)||remaining<=0||remaining>3600000)throw Error();
      token=value;clearTimeout(expiry);expiry=setTimeout(lock,remaining);return true;
    }catch{lock();return false;}
  }
  async function request(body){
    const currentToken=token;
    if(!currentToken)throw Error('Reopen Home from your client portal.');
    const response=await fetch('/api/brand-pulse',{method:body?'POST':'GET',headers:{Authorization:'Bearer '+currentToken,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json();
    if(response.status===401){lock();throw Error('Reopen Home from your client portal.');}
    if(token!==currentToken)throw Error('Your session changed. Try again.');
    if(!response.ok)throw Error(data.error||'Brand Pulse is temporarily unavailable.');
    const row=data.pulse,p=row?.payload;
    if(!p||typeof p.headline!=='string'||typeof p.insight!=='string'||typeof p.question!=='string'||!Array.isArray(p.options)||p.options.length<3||p.options.length>4)throw Error('Unable to load your pulse. Try again.');
    return row;
  }
  function render(row){
    pulse=row;const p=row.payload;
    $('pulse-title').textContent=p.headline;$('pulse-insight').textContent=p.insight;$('pulse-question').textContent=p.question;
    $('pulse-options').replaceChildren();
    for(const option of p.options){
      const button=document.createElement('button');button.type='button';button.textContent=option.label;button.className='pulse-option';button.setAttribute('aria-pressed',String(row.answer_id===option.id));
      button.disabled=!!row.answer_id;button.hidden=!!row.answer_id&&row.answer_id!==option.id;button.onclick=()=>answer(option.id);$('pulse-options').append(button);
    }
    const selected=p.options.find(o=>o.id===row.answer_id);
    $('pulse-feedback').hidden=!selected;$('pulse-feedback').textContent=selected?`Good signal. ${selected.label} should shape what we create next.`:'';
    $('pulse-cta').firstChild.textContent=selected?'Continue with Andrés ':'Build this with Andrés ';
    $('pulse-date').textContent=row.pulse_date+' · New York';$('pulse-content').hidden=false;
    state('');$('pulse-retry').hidden=true;
  }
  async function load(){
    if(busy||!token)return;
    setBusy(true);state('Finding your next useful question…');$('pulse-retry').hidden=true;
    try{render(await request());}catch(error){state(error.message);$('pulse-retry').hidden=!token;}finally{setBusy(false);}
  }
  async function answer(id){
    if(busy||pulse?.answer_id||!token)return;
    setBusy(true);state('Saving your answer…');
    try{render(await request({pulseDate:pulse.pulse_date,answerId:id}));}catch(error){state(error.message);$('pulse-retry').hidden=!token;}finally{setBusy(false);}
  }
  async function exchange(){
    try{
      const response=await fetch('/api/session-exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bootstrapToken:bootstrap}),cache:'no-store'});
      if(!response.ok)throw Error();const data=await response.json();if(!installToken(data.sessionToken))return;
      if(!initialized){initialized=true;await load();}
      clearTimeout(renew);renew=setTimeout(exchange,Math.max(1000,(data.expiresInSeconds-60)*1000));
    }catch{lock();}
  }
  $('pulse-retry').onclick=load;
  window.addEventListener('message',event=>{
    if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.type!=='jmn:portal-init'||event.data.version!==1||initialized||!event.data.sessionToken)return;
    if(installToken(event.data.sessionToken)){initialized=true;load();}
  });
  // Same bootstrap exchange used by the existing Strategist. Tokens stay in memory.
  try{const hash=location.hash.slice(1);if(hash.startsWith('token=')&&!hash.includes('&')){history.replaceState(null,'',location.pathname+location.search);bootstrap=decodeURIComponent(hash.slice(6));}}catch{}
  if(bootstrap&&bootstrap.length<=4096)exchange();
})();
