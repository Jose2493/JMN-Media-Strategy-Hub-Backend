import {renderCockpit} from './client-cockpit-view.js';
import {installStrategistActions} from './strategist-actions-view.js';
import {installStrategyNavigation} from './strategist-navigation.js';
// Fixtures only. No fetch, session exchange, publishing or storage adapter.
const workspace=document.body.dataset.jmnWorkspace;
if(!workspace){
 const frames=[...document.querySelectorAll('[data-qa-view]')];
 const show=()=>{for(const frame of frames){frame.parentElement.hidden=frame.dataset.qaView!==document.getElementById('qa-workspace').value;frame.style.width=document.getElementById('qa-width').value;}window.dispatchEvent(new Event('resize'));};
 document.getElementById('qa-workspace').onchange=show;document.getElementById('qa-width').onchange=show;show();
}else if(workspace==='cockpit'){
 renderCockpit(document.getElementById('cockpit'),{company:{business_name:'Northline Studio'},review:2,approved:4,drafts:1,scheduled:1,published:12,instagram:{connected:1,attention:0,total:1},design:true},{qa:true});
}else if(workspace==='strategy'){
 installStrategyNavigation();
 document.getElementById('thread-title').textContent='Make the next launch count';
 const campaigns=document.getElementById('campaigns'),threads=document.getElementById('threads'),messages=document.getElementById('messages');
 for(const [parent,labels] of [[campaigns,['General','Studio launch']],[threads,['Make the next launch count','Plan the next three posts']]])for(const text of labels){const b=document.createElement('button');b.textContent=text;b.onclick=()=>render(text);parent.append(b);}
 const actions=installStrategistActions({container:messages,getConversation:()=>null,api:async(path,body)=>{if(body)throw Error('Fictional QA: no submission saved');return {actions:[{type:'social',title:'Review your next piece',reason:'Two fictional items are ready for feedback.',label:'Open Social Center'},{type:'production',title:'Bring the plan into production',reason:'Prepare a brief for review.',label:'Request production'}]};},onRequestOpen:()=>{document.getElementById('welcome').hidden=true;}});
 const render=title=>{actions.clear();messages.replaceChildren();document.getElementById('thread-title').textContent=title;document.getElementById('welcome').hidden=true;
  for(const [role,text] of [['user','Help us plan a useful story for our studio launch.'],['assistant','Start with the moment your audience needs to understand.\n\nShow the work, explain one useful detail, and give people a clear next step. Keep the first post focused on one idea.\n\nFor this fictional campaign:\n1. Review the launch photographs.\n2. Choose a concise caption.\n3. Discuss timing in Social Center.\n\nA strategy becomes useful when the next action is small enough to do today.']]){const message=document.createElement('div');message.className='msg '+role;message.textContent=text;messages.append(message);}actions.refresh();};
 render('Make the next launch count');document.getElementById('request-production').onclick=()=>actions.request();
 document.getElementById('new-chat').onclick=()=>{actions.clear();messages.replaceChildren();document.getElementById('welcome').hidden=false;};
 document.getElementById('composer').onsubmit=e=>{e.preventDefault();const input=document.getElementById('input-box');if(!input.value.trim())return;const message=document.createElement('div');message.className='msg user';message.textContent=input.value;messages.append(message);input.value='';};
 document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{document.getElementById('input-box').value=b.dataset.prompt;document.getElementById('input-box').focus();});
 messages.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();});
}else if(workspace==='design'){
 const root=document.getElementById('studio'),status=document.getElementById('studio-status');
 const render=()=>{root.replaceChildren();const allowed=document.getElementById('design-scenario').value==='Authorized';status.hidden=allowed;status.textContent='Design Studio is not available for this workspace';if(!allowed)return;
  root.append(document.getElementById('qa-design-markup').content.cloneNode(true));root.querySelector('#template-name').textContent='Northline crew · fictional approved template';const wrap=root.querySelector('#canvas-wrap');wrap.replaceChildren();const sample=document.createElement('div');sample.className='qa-design-placeholder';sample.textContent='NORTHLINE\nFictional design preview';wrap.append(sample);root.querySelectorAll('.download-btn').forEach(b=>{b.disabled=true;});root.querySelector('#status').textContent='Fictional QA · downloads disabled';};
 document.getElementById('design-scenario').onchange=render;render();
}
