import {cockpitModel,routes} from './client-cockpit-model.js';
const paths={...routes,design:'https://portal.jmnmedia.com/portal/dashboard/view/174758',media:'https://portal.jmnmedia.com/files/home'};
const labels={strategy:'Strategy Session',social:'Social Center',design:'Design Studio',media:'Media & Deliverables'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,cls='fp-button')=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
export function foundingMoves(data) {
 const a=data.activity, moves=[];
 if(a.review>0)moves.push({title:'Give your content the green light',detail:`${a.review} item${a.review===1?'':'s'} ready for your feedback.`,area:'social'});
 else if(a.drafts>0)moves.push({title:'Move one draft forward',detail:'Review the message and choose the next step.',area:'social'});
 if(!data.instagram?.connected)moves.push({title:'Check your Instagram connection',detail:'Bring your account into Social Center.',area:'social'});
 moves.push({title:data.workspace.focus?'Build on your strategy focus':'Choose one clear goal',detail:data.workspace.focus||'Give your next piece of content a purpose.',area:'strategy'});
 if(moves.length<3&&data.areas.design)moves.push({title:'Make your template your own',detail:'Open the design available to your workspace.',area:'design'});
 if(moves.length<2)moves.push({title:'Explore your content workflow',detail:'See what is ready, in review or coming next.',area:'social'});
 return moves.slice(0,3);
}
export function renderFounding(root,data,{save,onHome,qa=false}={}) {
 let step=0,busy=false,disposed=false,kind='feedback';
 const names=['Welcome','Your workspace','Your first move','Shape what’s next'];
 const shell=el('section',null,'fp');root.replaceChildren(shell);root.setAttribute('aria-busy','false');
 const live=()=>!disposed&&root.contains(shell);
 const link=(text,area,cls='fp-link')=>{const a=el('a',text,cls);a.href=paths[area];a.target='_top';if(qa)a.onclick=e=>{e.preventDefault();notice.textContent='Preview only — no navigation or production changes.';};return a;};
 let notice;
 function draw(focus=false){
  shell.replaceChildren();
  const top=el('header',null,'fp-top');top.append(el('span','JMN / MEDIA PARTNER','fp-wordmark'),el('span','Founding Partner','fp-badge'));shell.append(top);
  const progress=el('nav',null,'fp-progress');progress.setAttribute('aria-label','Onboarding progress');
  names.forEach((name,i)=>{const b=button(`${String(i+1).padStart(2,'0')}  ${name}`,()=>{step=i;draw(true);},'fp-step');if(i===step)b.setAttribute('aria-current','step');b.disabled=busy;progress.append(b);});shell.append(progress);
  const content=el('div',null,'fp-content');shell.append(content);
  const eyebrow=el('p',`${data.workspace.kind==='project'?'PROJECT':'COMPANY'} WORKSPACE · PRIVATE BETA`,'fp-eyebrow');content.append(eyebrow);
  const title=el('h1',step===0?'Welcome to JMN Media Partner':names[step]);title.tabIndex=-1;content.append(title);
  if(step===0){
   content.append(el('p','Your workspace is ready.','fp-lead'));
   const identity=el('div',null,'fp-identity');const initial=data.workspace.name.split(/\s+/).map(s=>Array.from(s)[0]).slice(0,2).join('');identity.append(el('div',initial,'fp-avatar'),el('h2',data.workspace.name));content.append(identity);
   const offer=el('div',null,'fp-offer');offer.append(el('strong','2 months','fp-big'),el('span','complimentary access'),el('span','Then $20/month · your founding arrangement','fp-muted'));content.append(offer);
   content.append(el('p','A small circle. A shared opportunity to make JMN better. Your special access depends on reasonable beta participation and feedback.','fp-description'));
  }
  if(step===1){
   const identity=el('div',null,'fp-identity');identity.append(el('div',data.workspace.kind==='project'?'↗':'◈','fp-avatar'),el('h2',data.workspace.name));content.append(identity);
   const facts=el('dl',null,'fp-facts');
   const fact=(k,v)=>{const row=el('div');row.append(el('dt',k),el('dd',v));facts.append(row);};
   fact(data.workspace.kind==='project'?'Project type':'Industry',data.workspace.category||'To confirm with JMN');
   fact('Instagram',data.instagram===null?'Status temporarily unavailable':data.instagram.connected?data.instagram.handles.map(h=>'@'+h.replace(/^@/,'')).join(' · '):data.instagram.attention?'Connection needs attention':'Not connected yet');content.append(facts);
   content.append(el('h2','What JMN knows'));
   const summary=el('div',null,'fp-summary');
   summary.append(el('p',data.workspace.kind==='project'?`You’re building ${data.workspace.name}.`:`Your business is ${data.workspace.name}.`));
   if(data.workspace.focus)summary.append(el('p',data.workspace.focus));else summary.append(el('p','Your strategy focus is ready to define together.'));
   const counts=el('div',null,'fp-counts');[['In review',data.activity.review],['Approved',data.activity.approved],['Scheduled',data.activity.scheduled]].forEach(([k,v])=>{const item=el('div');item.append(el('strong',v==null?'—':String(v)),el('span',k));counts.append(item);});summary.append(counts);content.append(summary);
   if(data.workspace.kind==='project')content.append(el('p','Instagram and content activity reflect your connected company workspace. Project-specific activity will be labeled when available.','fp-muted'));
   content.append(el('h2','Your available areas'));const areas=el('div',null,'fp-areas');Object.entries(data.areas).filter(([,v])=>v===true).forEach(([area])=>areas.append(link(labels[area]+' ↗',area)));content.append(areas);
  }
  if(step===2){
   const pulse=cockpitModel({...data.activity,instagram:data.instagram?{...data.instagram,total:data.instagram.connected+data.instagram.attention}:null}).pulse;
   const p=el('div',null,'fp-pulse');p.append(el('span','DAILY PULSE · BY JMN','fp-eyebrow'),el('h2',pulse));content.append(p);
   const moves=foundingMoves(data),list=el('ol',null,'fp-moves');moves.forEach(m=>{const li=el('li');li.append(link(m.title+' ↗',m.area),el('p',m.detail));list.append(li);});content.append(list);content.append(link(moves[0].area==='strategy'?'Start with Strategy Session ↗':`Open ${labels[moves[0].area]} ↗`,moves[0].area,'fp-button fp-primary'));
  }
  if(step===3){
   content.append(el('p','Help shape what JMN becomes.','fp-lead'));
   const list=el('ul',null,'fp-expectations');['Use your portal regularly.','Share occasional, honest feedback.','Tell us about bugs or friction.','Try major new features when reasonably requested.'].forEach(t=>list.append(el('li',t)));content.append(list);
   content.append(el('p','Two complimentary months, then $20/month. This is a private founding arrangement, not public pricing. JMN will confirm your start date and payment details separately.','fp-muted'));
   const form=el('form',null,'fp-feedback');form.append(el('h2','How does your workspace feel?'));
   const rating=el('fieldset');rating.append(el('legend','Quick rating (optional)'));const choices=el('div',null,'fp-ratings');
   for(let i=1;i<=5;i++){const l=el('label'),input=el('input');input.type='radio';input.name='rating';input.value=String(i);l.append(input,el('span',String(i)));choices.append(l);}rating.append(choices);form.append(rating,el('p','1 · Needs work     5 · Feels great','fp-muted'));
   const noteLabel=el('label','A short note (optional)'),note=el('textarea');note.id='fp-note';note.maxLength=500;note.rows=3;noteLabel.htmlFor=note.id;form.append(noteLabel,note);
   const issue=button(kind==='issue'?'Reporting an issue ✓':'Report a bug or friction',()=>{kind=kind==='issue'?'feedback':'issue';issue.textContent=kind==='issue'?'Reporting an issue ✓':'Report a bug or friction';issue.setAttribute('aria-pressed',String(kind==='issue'));note.focus();},'fp-link');issue.setAttribute('aria-pressed',String(kind==='issue'));form.append(issue);
   const submit=el('button','Send feedback','fp-button');submit.type='submit';form.append(submit);
   form.onsubmit=async e=>{e.preventDefault();if(busy)return;const selected=form.querySelector('input:checked');if(!selected&&!note.value.trim()){notice.textContent='Choose a rating or add a short note.';return;}busy=true;submit.disabled=true;notice.textContent='Sending…';try{await save({action:'feedback',kind,rating:selected?Number(selected.value):null,note:note.value.trim()});if(live()){notice.textContent=qa?'Preview feedback received — nothing saved.':'Thank you. Your feedback has been saved for JMN.';form.reset();}}catch{if(live())notice.textContent='Could not save your feedback. Please try again.';}finally{busy=false;if(live())submit.disabled=false;}};content.append(form);
  }
  notice=el('p',null,'fp-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');shell.append(notice);
  const footer=el('footer',null,'fp-footer');footer.append(button(step?'Back':'Explore Home for now',()=>{if(step){step--;draw(true);}else{disposed=true;onHome();}},'fp-link'));
  const next=button(step===3?'Finish & open Home':'Continue →',async()=>{
   if(busy)return;if(step<3){step++;draw(true);return;}
   busy=true;next.disabled=true;notice.textContent='Saving…';try{await save({action:'complete'});if(live()){disposed=true;onHome(true);}}catch{if(live())notice.textContent='Could not finish onboarding. Please retry, or use Home for now.';}finally{busy=false;if(live())next.disabled=false;}
  },'fp-button fp-primary');footer.append(el('span',`${step+1} / 4`,'fp-muted'),next);shell.append(footer);
  if(step>0)shell.append(button('Use Home for now',()=>{disposed=true;onHome();},'fp-skip'));
  if(focus)title.focus();
 }
 draw();return ()=>{disposed=true;};
}
