import {installStrategistActions} from './strategist-actions-view.js';
const frame=document.getElementById('qa-actions-frame');
if(frame){document.getElementById('qa-width').onchange=e=>{frame.style.width=e.target.value;};window.addEventListener('message',e=>{if(e.source===frame.contentWindow&&e.origin===location.origin&&e.data?.type==='actions-qa-height'&&Number.isFinite(e.data.height))frame.style.height=Math.max(400,Math.min(10000,e.data.height))+'px';});}
else{
 const container=document.getElementById('qa-actions'),scenario=document.getElementById('scenario');
 const ui=installStrategistActions({container,getConversation:()=>null,api:async(path,body)=>{
  if(body){if(scenario.value==='failure')throw Error('Fixture failure');return {received:true,status:'pending_review'};}
  const actions=[{type:'social',title:'Review your drafts',reason:'Your next move starts in Social Center.',label:'Open Social Center'},{type:'strategy',title:'Refine your campaign',reason:'Clarify the audience and next step.',label:'Continue Strategy Session'},{type:'production',title:'Capture your story',reason:'Prepare a request for JMN review.',label:'Request production'}];
  if(scenario.value==='authorized')actions.push({type:'design',title:'Edit your authorized design',reason:'Template entitlement confirmed in this fictional scenario.',label:'Open Design Studio'},{type:'onboarding',title:'Complete your welcome',reason:'Fictional active incomplete enrollment.',label:'Continue onboarding'});
  return {actions};
 }});
 container.addEventListener('click',e=>{if(e.target.closest('a')){e.preventDefault();document.getElementById('qa-route').textContent='Safe route selected: '+e.target.textContent;}});
 const route=document.createElement('p');route.id='qa-route';document.body.append(route);
 document.getElementById('qa-request').onclick=ui.request;scenario.onchange=()=>{ui.clear();ui.refresh();};ui.refresh();
 new ResizeObserver(()=>parent.postMessage({type:'actions-qa-height',height:document.body.scrollHeight+24},location.origin)).observe(document.body);
}
