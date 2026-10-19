const routes={social:'https://portal.jmnmedia.com/portal/dashboard/view/174976',strategy:'https://portal.jmnmedia.com/portal/dashboard/view/173775',design:'https://portal.jmnmedia.com/portal/dashboard/view/174758',onboarding:'https://portal.jmnmedia.com/portal/dashboard/view/172579'};
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
export function recommendProduction({location='',goal='',timeline=''}){
 const place=location.trim();
 const remote=/\b(remote|virtual|online|remoto|remota)\b/i.test(place+' '+goal);
 // Bounded location hints, not geocoding or a promise of service coverage.
 // A state alone, an event, budget or missing shoot details cannot establish logistics.
 const local=/\b(boston|cambridge|somerville)\b/i.test(place)&&! /\b(uk|england|united kingdom|ohio|indiana|maryland|wisconsin|new zealand)\b/i.test(place);
 const distant=/\b(los angeles|san francisco|california|seattle|international|overseas)\b|requires? (?:a )?flight|long.distance travel/i.test(place);
 const mode=remote||distant?'remote':local?'on_location':null;
 const reason=remote?'Remote direction fits a virtual or client-led shoot.':distant?'Remote direction may reduce significant travel for this location.':local?'On-location production may fit this local production market.':'JMN will confirm the best production approach after reviewing the exact location and scope. Select your preferred approach below.';
 const urgent=/today|tomorrow|this week|urgent|hoy|mañana|esta semana/i.test(timeline);
 return {mode,reason:reason+(urgent?' Your short timeline needs availability confirmation.':'')+' JMN will confirm feasibility, scope and pricing before any commitment.'};
}
export function installStrategistActions({api,container,getConversation,onRequestOpen=()=>{}}){
 let generation=0,form=null;
 const clear=()=>{generation++;container.querySelectorAll('.strategist-actions,.production-request').forEach(e=>e.remove());form=null;};
 function request(){
  if(form?.isConnected){form.scrollIntoView({block:'start'});return;}
  const context=getConversation(),key=crypto.randomUUID();onRequestOpen();
  form=el('form',null,'production-request');const thisForm=form;
  form.append(el('p','PRODUCTION · REQUEST FOR REVIEW','eyebrow'),el('h2','Let’s shape the shoot.'),el('p','Tell JMN what you need. Review the details before submitting. No booking, contract or payment is created.'));
  const fields={};const edit=el('div');
  for(const [name,label,max] of [['goal','Campaign or project goal',600],['location','Location / city or remote',200],['deliverables','Desired deliverables',600],['timeline','Timeline',200],['budget','Approximate budget (include currency, or “Not sure”)',160]]){
   const wrap=el('label',label),input=el(name==='goal'||name==='deliverables'?'textarea':'input');input.name=name;input.required=true;input.maxLength=max;if(input.tagName==='TEXTAREA')input.rows=2;fields[name]=input;wrap.append(input);edit.append(wrap);
  }
  const modeLabel=el('label','Preferred production approach'),mode=el('select');mode.name='mode';for(const [v,t] of [['','Select a production approach'],['on_location','On-Location Production'],['remote','Remote Production Direction']]){const o=el('option',t);o.value=v;o.disabled=!v;mode.append(o);}modeLabel.append(mode);
  const suggestion=el('p',null,'production-suggestion'),review=el('section'),notice=el('p');notice.setAttribute('role','status');review.hidden=true;
  const next=el('button','Review request','primary');next.type='submit';const back=el('button','Edit details');back.type='button';const submit=el('button','Submit for JMN review','primary');submit.type='button';const cancel=el('button','Cancel');cancel.type='button';
  let reviewed=null,sending=false,preferredMode=null;
  mode.onchange=()=>{preferredMode=mode.value;submit.disabled=!mode.value;};
  const values=()=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value.trim()]));
  form.append(edit,review,notice,next,cancel);container.append(form);
  cancel.onclick=()=>{if(!sending){form.remove();form=null;}};
  back.onclick=()=>{if(sending)return;review.hidden=true;edit.hidden=false;next.hidden=false;reviewed=null;fields.goal.focus();};
  form.onsubmit=e=>{e.preventDefault();if(sending||!form.reportValidity())return;reviewed=values();const recommended=recommendProduction(reviewed);mode.value=preferredMode||recommended.mode||'';submit.disabled=!mode.value;suggestion.textContent=recommended.reason;
   review.replaceChildren(el('h3','Review your request'));
   const details=el('dl');for(const [key,value] of Object.entries(reviewed)){details.append(el('dt',key.charAt(0).toUpperCase()+key.slice(1)),el('dd',value));}
   review.append(details,suggestion,modeLabel,back,submit);edit.hidden=true;next.hidden=true;review.hidden=false;mode.focus();};
  submit.onclick=async()=>{if(sending||!reviewed||!['on_location','remote'].includes(mode.value))return;sending=true;submit.disabled=true;back.disabled=true;cancel.disabled=true;mode.disabled=true;notice.textContent='Submitting…';
   try{const result=await api('/api/strategist-actions',{...reviewed,mode:mode.value,requestKey:key,...(context?{conversationId:context}:{})});if(!thisForm.isConnected)return;if(!result.received)throw Error();thisForm.replaceChildren(el('h2','Request received'),el('p','Saved in JMN’s review queue. JMN will review your scope and follow up. This does not confirm availability, pricing or a booking.'));}
   catch{if(thisForm.isConnected)notice.textContent='Could not confirm receipt. Retry to check the same request; it will not be duplicated.';}
   finally{sending=false;submit.disabled=false;back.disabled=false;cancel.disabled=false;mode.disabled=false;}
  };
  fields.goal.focus();form.scrollIntoView({block:'start'});
 }
 async function refresh(){
  const run=++generation,id=getConversation();container.querySelectorAll('.strategist-actions').forEach(e=>e.remove());
  try{const data=await api('/api/strategist-actions'+(id?'?conversation='+encodeURIComponent(id):''));if(run!==generation||id!==getConversation())return;
   if(!data.actions?.length)return;const section=el('section',null,'strategist-actions');section.setAttribute('aria-label','Suggested next actions');
   for(const action of data.actions){if(!routes[action.type]&&action.type!=='production')continue;const row=el('div',null,'strategist-action');row.append(el('strong',action.title),el('p',action.reason));let cta;
    if(action.type==='production'){cta=el('button',action.label);cta.type='button';cta.onclick=request;}
    else{cta=el('a',action.label+' ↗');cta.href=routes[action.type];cta.target='_top';}row.append(cta);section.append(row);
   }container.append(section);
  }catch{/* Optional suggestions never replace the saved conversation or grant access. */}
 }
 return {refresh,clear,request};
}
