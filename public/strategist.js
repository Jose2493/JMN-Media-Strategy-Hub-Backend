(() => {
'use strict';
const $=id=>document.getElementById(id);
const embedded=new URLSearchParams(location.search).get('embedded')==='1';
let token=null,bootstrap=null,expiryTimer=null,renewTimer=null,busy=false,initialized=false;
let campaignId=null,conversationId=null,workspace={campaigns:[],threads:[]},pendingPost=null,nextCursor=null;
const node=(tag,text,cls)=>{const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
const status=text=>{$('status').textContent=text;$('status').hidden=!text;};
function setBusy(value){busy=value;document.querySelectorAll('button,input,textarea,select').forEach(el=>el.disabled=value || !token);}
function lock(message){token=null;clearTimeout(expiryTimer);clearTimeout(renewTimer);$('workspace').hidden=true;$('gate').hidden=false;$('gate-text').textContent=message;document.querySelectorAll('dialog[open]').forEach(el=>el.close());setBusy(false);}
function installToken(value){
 try{const payload=JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));const remaining=payload.exp*1000-Date.now();if(!Number.isFinite(remaining)||remaining<=0||remaining>3600000)throw Error();token=value;clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>lock('Your session expired. Reopen this page from your client portal.'),remaining);return true;}catch{lock('Please reopen Strategist from your client portal.');return false;}
}
async function api(path,body){
 const res=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await res.json();if(res.status===401){lock('Your session expired. Reopen this page from your client portal.');throw Error('Session expired');}
 if(!res.ok)throw Error(data.error || (res.status===429?'Please wait before sending another message.':'Unable to complete this request. Try again.'));return data;
}
function renderSidebar(){
 $('campaigns').replaceChildren();
 for(const c of [{id:null,name:'General'},...workspace.campaigns]){
  const b=node('button',c.name,c.id===campaignId?'selected':'');b.type='button';b.title=c.name;b.setAttribute('aria-pressed',String(c.id===campaignId));b.onclick=()=>{if(busy)return;campaignId=c.id;conversationId=null;showWelcome();renderSidebar();};$('campaigns').append(b);
 }
 $('threads').replaceChildren();
 const threads=workspace.threads.filter(t=>t.campaignId===campaignId).sort((a,b)=>Date.parse(b.last_message_at||b.created_at)-Date.parse(a.last_message_at||a.created_at));
 for(const t of threads){const b=node('button',t.title,t.id===conversationId?'selected':'');b.title=t.title;b.type='button';b.setAttribute('aria-pressed',String(t.id===conversationId));b.onclick=()=>openThread(t.id);$('threads').append(b);}
 if(!threads.length)$('threads').append(node('p','No conversations here yet.','sidebar-note'));
 $('list-note').textContent=workspace.limited?'Showing the 200 most recently created conversations and up to 100 campaigns.':'';
 const selected=$('post-campaign').value;$('post-campaign').replaceChildren();
 for(const c of [{id:'',name:'General'},...workspace.campaigns]){const o=node('option',c.name);o.value=c.id;$('post-campaign').append(o);}if([...$('post-campaign').options].some(o=>o.value===selected))$('post-campaign').value=selected;
}
function heading(metadata){
 const campaign=metadata?.campaign || workspace.campaigns.find(c=>c.id===campaignId);
 $('campaign-name').textContent=campaign?.name || 'GENERAL';$('thread-title').textContent=metadata?.title || "Let's find your next move.";
 $('objective').textContent=campaign?.objective || '';$('objective').hidden=!campaign?.objective;
 $('context').replaceChildren();const snap=metadata?.social_context;$('context').hidden=!snap;
 if(snap){$('context').append(node('strong','Discussing an Instagram post'),node('span',(snap.post.caption || 'Untitled post').slice(0,220)),document.createElement('br'),node('span','Snapshot: '+new Date(snap.capturedAt).toLocaleString()+' · Caption and metrics only; media has not been analyzed.'));
  if(snap.post.permalink){const u=new URL(snap.post.permalink);if(u.protocol==='https:'&&['www.instagram.com','instagram.com'].includes(u.hostname)){const a=node('a','View post ↗');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';$('context').append(a);}}
 }
}
function showWelcome(){nextCursor=null;$('messages').replaceChildren();$('welcome').hidden=false;$('input-box').value='';heading(null);status('');}
function addMessage(role,text){const el=node('div',text,'msg '+(role==='user'?'user':'assistant'));$('messages').append(el);return el;}
async function refreshList(){workspace=await api('/api/strategist');renderSidebar();}
function olderButton(){
 $('messages').querySelector('.older')?.remove();if(!nextCursor)return;
 const b=node('button','Load earlier messages','older');b.type='button';b.onclick=async()=>{
  if(busy)return;setBusy(true);status('');
  try{const data=await api('/api/strategist?conversation='+encodeURIComponent(conversationId)+'&before='+encodeURIComponent(nextCursor));b.remove();const fragment=document.createDocumentFragment();for(const m of data.messages)fragment.append(node('div',m.content,'msg '+(m.role==='user'?'user':'assistant')));$('messages').prepend(fragment);nextCursor=data.nextCursor;olderButton();}catch(e){status(e.message);}finally{setBusy(false);}
 };$('messages').prepend(b);
}
async function readThread(id){
 const data=await api('/api/strategist?conversation='+encodeURIComponent(id));conversationId=id;campaignId=data.metadata?.campaign_id || null;heading(data.metadata);$('messages').replaceChildren();
 for(const m of data.messages)addMessage(m.role,m.content);$('welcome').hidden=data.messages.length>0;nextCursor=data.nextCursor;olderButton();renderSidebar();$('messages').scrollTop=$('messages').scrollHeight;
}
async function openThread(id){if(busy)return;setBusy(true);status('');try{await readThread(id);$('input-box').value='';}catch(e){status(e.message);}finally{setBusy(false);}}
async function send(event){event?.preventDefault();const text=$('input-box').value.trim();if(!text||busy||!token)return;
 setBusy(true);status('');let user,typing;
 try{
  if(!conversationId){const created=await api('/api/strategist',{action:'thread',title:text.slice(0,100),campaignId});await readThread(created.conversationId);}
  $('welcome').hidden=true;user=addMessage('user',text);user.classList.add('pending');typing=node('div','Considering your context…','typing');$('messages').append(typing);$('messages').scrollTop=$('messages').scrollHeight;
  const data=await api('/api/chat',{message:text,conversationId});
  if(data.conversationId!==conversationId)throw Error('Conversation changed. Reopen it to see the saved reply.');
  user.classList.remove('pending');typing.remove();addMessage('assistant',data.reply);$('input-box').value='';$('messages').scrollTop=$('messages').scrollHeight;
  try{await refreshList();}catch{status('Reply saved. The sidebar could not refresh; reopen the workspace to update it.');}
 }catch(e){user?.remove();typing?.remove();status(e.message);$('input-box').value=text;}finally{setBusy(false);if(token)$('input-box').focus();}
}
$('composer').onsubmit=send;$('input-box').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
$('new-chat').onclick=()=>{if(busy)return;conversationId=null;showWelcome();renderSidebar();$('input-box').focus();};
document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('input-box').value=b.dataset.prompt;$('input-box').focus();});
$('new-campaign').onclick=()=>{$('campaign-error').textContent='';$('campaign-dialog').showModal();};
$('cancel-campaign').onclick=()=>{$('campaign-dialog').close();if(pendingPost)$('post-dialog').showModal();};
$('campaign-dialog').addEventListener('cancel',e=>{if(busy){e.preventDefault();return;}if(pendingPost)setTimeout(()=>$('post-dialog').showModal(),0);});
$('campaign-form').onsubmit=async e=>{
 e.preventDefault();if(busy)return;setBusy(true);$('campaign-error').textContent='';
 try{const data=await api('/api/strategist',{action:'campaign',name:$('campaign-input').value,objective:$('campaign-objective').value});campaignId=data.campaign.id;workspace.campaigns.unshift(data.campaign);conversationId=null;showWelcome();renderSidebar();$('campaign-dialog').close();$('campaign-form').reset();if(pendingPost){$('post-campaign').value=campaignId;$('post-dialog').showModal();}}
 catch(err){$('campaign-error').textContent=err.message;}finally{setBusy(false);}
};
$('post-new-campaign').onclick=()=>{$('post-dialog').close();$('campaign-dialog').showModal();};
$('cancel-post').onclick=()=>{pendingPost=null;$('post-dialog').close();};
$('post-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else pendingPost=null;});
$('post-form').onsubmit=async e=>{
 e.preventDefault();if(busy||!pendingPost)return;setBusy(true);$('post-error').textContent='';
 try{const data=await api('/api/strategist',{action:'thread',title:$('post-title').value,campaignId:$('post-campaign').value || null,post:pendingPost});pendingPost=null;$('post-dialog').close();await refreshList();await readThread(data.conversationId);$('input-box').value='Review this post in the context of this campaign. What can we learn from the available data, and what should we try next?';status('Post context saved. Send the draft question below, or write your own.');}
 catch(err){if($('post-dialog').open)$('post-error').textContent=err.message;else status(err.message);}finally{setBusy(false);}
};
async function start(){
 $('gate').hidden=true;$('workspace').hidden=false;setBusy(true);
 try{await refreshList();showWelcome();if(pendingPost){$('post-campaign').value=campaignId || '';$('post-dialog').showModal();}}
 catch(e){status(e.message);}finally{setBusy(false);}
}
async function exchange(){
 try{const res=await fetch('/api/session-exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bootstrapToken:bootstrap}),cache:'no-store'});if(!res.ok)throw Error();const data=await res.json();if(!installToken(data.sessionToken))return;if(!initialized){initialized=true;await start();}clearTimeout(renewTimer);renewTimer=setTimeout(exchange,Math.max(1000,(data.expiresInSeconds-60)*1000));}
 catch{lock('Unable to start your session. Reopen Strategist from your client portal.');}
}
setBusy(true);
if(embedded && window.parent!==window){
 window.addEventListener('message',event=>{
  if(initialized||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='jmn:strategist-init')return;
  if(!installToken(event.data.sessionToken))return;initialized=true;
  const post=event.data.post;if(post && typeof post.accountId==='string' && typeof post.mediaId==='string')pendingPost={accountId:post.accountId,mediaId:post.mediaId};start();
 });
 window.parent.postMessage({type:'jmn:strategist-ready'},location.origin);
}else{
 try{const hash=location.hash.slice(1);history.replaceState(null,'',location.pathname+location.search);if(hash.startsWith('token=')&&!hash.includes('&'))bootstrap=decodeURIComponent(hash.slice(6));}catch{}
 if(bootstrap&&bootstrap.length<=4096)exchange();else lock('Open this area through your JMN Client Portal.');
}
})();
