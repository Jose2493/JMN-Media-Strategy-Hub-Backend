(() => {
 'use strict';
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const labels={inquiries:'More inquiries',bookings:'More bookings',awareness:'Brand awareness',custom:'My own goal'};
 const button=(text,fn,primary=false)=>{const b=el('button',text,'btn '+(primary?'btn-primary':'btn-secondary'));b.type='button';b.onclick=fn;return b;};
 const date=value=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});

 // All state belongs to a verified server session and one account. No tokens or
 // client business data are placed in URLs, browser storage, or global caches.
 window.JmnActionPlan={mount(root,{request,openChat,getMetrics}) {
  let plan=null,busy=false,dialog=null;
  const feedback=el('p','','plan-feedback');feedback.setAttribute('role','status');
  const view=el('div');root.className='action-workspace';root.append(view,feedback);
  function message(text){feedback.textContent=text;}
  function setBusy(value){busy=value;root.setAttribute('aria-busy',String(value));for(const n of root.querySelectorAll('button'))n.disabled=value; if(dialog)for(const n of dialog.querySelectorAll('button,input,select,textarea'))n.disabled=value;}
  async function load(){
   setBusy(true);message('Loading your saved direction…');
   try{plan=await request();if(!root.isConnected)return;draw();message('');}
   catch(error){view.replaceChildren(el('h3','Your saved plan is not available yet.'),button('Try again',load));message(error.message);}
   finally{setBusy(false);}
  }
  async function save(command,fields={}) {
   if(busy)return null;setBusy(true);message('Saving…');
   try{plan=await request({command,version:plan.version,...fields});draw();message('Saved to this account.');return plan;}
   catch(error){message(error.message);if(dialog){dialog.querySelector('.form-error').textContent=error.message;}if(error.status===409){try{plan=await request();draw();}catch{message('Unable to reload your plan. Refresh the page before trying again.');}}return null;}
   finally{setBusy(false);}
  }
  function form(title,description,trigger) {
   dialog?.close();const d=el('dialog','','plan-dialog');dialog=d;
   const f=el('form');const heading=el('h2',title);heading.id='plan-dialog-title';d.setAttribute('aria-labelledby',heading.id);
   f.append(heading,el('p',description,'form-description'));const fields=el('div','','plan-fields');f.append(fields);
   const error=el('p','','form-error');error.setAttribute('role','alert');f.append(error);
   const actions=el('div','','plan-actions');const cancel=button('Cancel',()=>d.close());actions.append(cancel);f.append(actions);
   d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',()=>{d.remove();if(dialog===d)dialog=null;(trigger?.isConnected?trigger:root.querySelector('button'))?.focus();},{once:true});
   d.append(f);document.body.append(d);d.showModal();
   return {d,f,fields,actions};
  }
  function field(parent,label,tag='textarea',value='',max=1000) {
   const wrap=el('label',label,'plan-label');const input=el(tag);input.value=value;input.maxLength=max;input.required=true;wrap.append(input);parent.append(wrap);return input;
  }
  function submit(actions,text) {const b=el('button',text,'btn btn-primary');b.type='submit';actions.append(b);return b;}
  function editGoal(trigger) {
   const g=plan.state?.goal;const ui=form(g?'Update your direction':'What are we working toward?',g?'This starts a fresh action. Your previous action and conversation stay in your history.':'Choose the outcome that matters to your business. We will use it to shape one practical experiment.',trigger);
   const kind=field(ui.fields,'Your priority','select');
   for(const [value,label] of Object.entries(labels)){const option=el('option',label);option.value=value;kind.append(option);}kind.value=g?.kind||'inquiries';
   const objective=field(ui.fields,'What would success look like?','textarea',g?.objective||'');objective.placeholder='For example: more inquiries from local businesses about our branding service.';
   const audience=field(ui.fields,'Who is this for? (optional)','input',g?.audience||'',500);audience.required=false;audience.placeholder='Audience, service or offer';
   submit(ui.actions,'Confirm my goal');ui.f.onsubmit=async e=>{e.preventDefault();if(await save('goal',{kind:kind.value,objective:objective.value,audience:audience.value}))ui.d.close();};
  }
  function alternative(trigger) {
   const ui=form('Give this a different angle','Tell Strategist what does not fit. We will offer another starting point and carry your feedback into preparation.',trigger);
   const reason=field(ui.fields,'What should change?','textarea','',500);reason.placeholder='For example: we cannot film a video this week.';
   submit(ui.actions,'Explore another idea');ui.f.onsubmit=async e=>{e.preventDefault();if(await save('alternative',{reason:reason.value}))ui.d.close();};
  }
  async function prepare(trigger,help=false) {
   const result=await save('prepare');if(!result)return;
   openChat({conversationId:result.state.move.conversationId,draftOnlyIfEmpty:!help,draft:help?'Help me prepare a production brief to share with the JMN team for this action. Include my goal, audience, deliverables, missing information and the measurement plan. This is a draft request, not a message sent to the team.':'Help me prepare this action. Confirm any missing business details, then develop a focused creative brief, a caption draft and a measurement checklist.'},trigger);
  }
  function published(trigger) {
   const metrics=getMetrics();const posts=metrics?.recentMedia||[];
   const ui=form('Connect the post you published','Choose the matching publication from this Instagram account. This records your selection; it does not publish anything.',trigger);
   if(!posts.length){ui.fields.append(el('p','No posts are available to select. Close this window and use Update overview, then try again.'));return;}
   const select=field(ui.fields,'Published post','select');select.append(el('option','Choose a post…'));select.firstChild.value='';
   for(const p of posts){const o=el('option',`${p.timestamp?date(p.timestamp):'Date unavailable'} · ${(p.caption||'Untitled post').slice(0,90)}`);o.value=p.id;select.append(o);}
   ui.fields.append(el('p',`Showing ${posts.length} posts returned by Instagram. If your post is missing, update the overview after Instagram makes it available.`,'metrics-note'));
   submit(ui.actions,'Link this publication');ui.f.onsubmit=async e=>{e.preventDefault();if(await save('published',{mediaId:select.value}))ui.d.close();};
  }
  function review(trigger) {
   const ui=form('What did this action teach you?','Record what you observed, including results you verified outside Instagram. You can record that there is not enough evidence yet.',trigger);
   ui.fields.append(el('p',plan.state.move.measure,'review-measure'));
   const note=field(ui.fields,'Your observations','textarea','',2000);note.placeholder='What happened? What did customers say? What would you change? Identify any manually counted inquiries or bookings.';
   submit(ui.actions,'Save my learning');ui.f.onsubmit=async e=>{e.preventDefault();if(await save('review',{note:note.value}))ui.d.close();};
  }
  function draw() {
   view.replaceChildren();const s=plan.state;
   if(!s?.goal){
    const welcome=el('section','','move-card setup-card');welcome.append(el('div','YOUR DIRECTION','section-kicker'),el('h2','A clear goal.\nA useful next move.'),el('p','Let’s give your content something to work toward. Choose your priority, then prepare one focused action with JMN Strategist.','move-intro'));
    const b=button('Set my direction →',()=>editGoal(b),true);welcome.append(b,el('p','Your goal and progress stay saved to this account.','move-footnote'));view.append(welcome);return;
   }
   const m=s.move;
   const goal=el('section','','goal-strip');const copy=el('div');copy.append(el('span','WORKING TOWARD · '+labels[s.goal.kind],'section-kicker'),el('p',s.goal.objective));const change=button('Change goal',()=>editGoal(change));goal.append(copy,change);view.append(goal);
   const card=el('section','','move-card');
   const top=el('div','','move-top');top.append(el('span','YOUR NEXT MOVE','section-kicker'),el('span',({proposed:'Ready to shape',in_progress:'In preparation',published:'Published · observing',reviewed:'Learning saved'})[m.status],'move-status'));card.append(top);
   const steps=el('ol','','move-steps');const stage=['proposed','in_progress','published','reviewed'].indexOf(m.status);['Direction','Prepare','Publish','Learn'].forEach((t,i)=>{const li=el('li',t,i<=stage?'active':'');if(i===stage)li.setAttribute('aria-current','step');steps.append(li);});card.append(steps);
   card.append(el('h2',m.title),el('p',m.task,'move-intro'));
   const details=el('div','','move-detail-grid');for(const [title,text] of [['Why try this',m.why],['What to watch',m.measure]]){const box=el('div');box.append(el('h3',title),el('p',text));details.append(box);}card.append(details);
   card.append(el('p','A goal-based experiment, not a performance prediction. Confirm the details with Strategist before publishing.','move-footnote'));
   if(m.adjustment)card.append(el('p','Your feedback: '+m.adjustment,'saved-note'));
   const actions=el('div','','plan-actions');
   if(['proposed','in_progress'].includes(m.status)){
    const prep=button(m.status==='proposed'?'Prepare with Strategist ↗':'Continue preparation ↗',()=>prepare(prep),true);actions.append(prep);
    if(m.status==='proposed'){const alt=button('Find another idea',()=>alternative(alt));actions.append(alt);}
    else {const pub=button('I published it',()=>published(pub));actions.append(pub);}
   }else if(m.status==='published'){
    const p=m.post.post;const linked=el('div','','linked-post');linked.append(el('span','LINKED PUBLICATION','section-kicker'),el('p',p.caption?.slice(0,180)||'Untitled post'),el('small',`Linked ${date(m.linkedAt)} · Give your experiment time before drawing conclusions.`));
    const latestData=getMetrics(),latest=latestData?.recentMedia?.find(post=>post.id===p.id);
    const counts=el('div','','result-counts');const n=value=>Number.isSafeInteger(value)&&value>=0?value.toLocaleString():'—';
    counts.append(el('span',`When linked · ${n(p.likes)} likes / ${n(p.comments)} comments`));
    counts.append(el('span',latest?`Latest · ${n(latest.likes)} likes / ${n(latest.comments)} comments · ${date(latestData.fetchedAt)}`:'Latest counts unavailable. Use Update overview to check again.'));
    linked.append(counts,el('small','Cumulative interactions, not verified inquiries or sales.'));
    if(p.permalink){const a=el('a','View on Instagram ↗','post-link');a.href=p.permalink;a.target='_blank';a.rel='noopener noreferrer';linked.append(a);}card.append(linked);
    const r=button('Record what I learned',()=>review(r),true);actions.append(r);
    const chat=button('Discuss the results ↗',()=>openChat({conversationId:m.conversationId,draft:`Help me review this action. My goal: ${s.goal.objective}. Selected post: ${p.caption||p.id}. At ${m.post.capturedAt}, the saved counts were ${p.likes??'unknown'} likes and ${p.comments??'unknown'} comments. ${latest?`At ${latestData.fetchedAt}, the latest counts were ${latest.likes??'unknown'} likes and ${latest.comments??'unknown'} comments.`:'Latest counts are unavailable.'} These are cumulative counts, not sales or post reach. Ask me for the observed business outcome before drawing conclusions.`},chat));actions.append(chat);
   }else{
    card.append(el('div','YOUR LEARNING','section-kicker'),el('p',m.review.note,'saved-note'),el('p',`Recorded by your team · ${date(m.review.recordedAt)}. Business outcomes are self-reported.`,'move-footnote'));
    actions.append(button('Start the next experiment →',()=>save('next'),true));
   }
   card.append(actions);
   if(m.status==='in_progress'){
    const help=button('Prepare a request for JMN',()=>prepare(help,true));help.className='text-button';card.append(help,el('p','Create a brief in Strategist, then share it with your JMN contact. Nothing is sent automatically.','move-footnote'));
   }
   view.append(card);
   if(s.history.length){const history=el('details','','plan-history');history.append(el('summary',`Your previous actions · ${s.history.length}`));for(const item of [...s.history].reverse()){const row=el('article');row.append(el('h3',item.title),el('p',item.review?.note||item.archiveReason),el('small',date(item.archivedAt)));if(item.conversationId){const b=button('Open preparation ↗',()=>openChat({conversationId:item.conversationId},b));row.append(b);}history.append(row);}view.append(history);}
  }
  load();
  return {close:()=>dialog?.close(),refresh:()=>{if(plan&&!busy)draw();}};
 }};
})();
