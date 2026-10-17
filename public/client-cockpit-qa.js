import {renderCockpit} from './client-cockpit-view.js';
import {observeCockpitHeight} from './client-cockpit-height.js';
const root=document.getElementById('cockpit');
function render(){
 const scenario=document.getElementById('scenario').value;
 const data={company:{business_name:'Northline Studio'},review:2,approved:4,drafts:1,scheduled:1,published:12,instagram:{connected:1,attention:0,total:1},design:true};
 if(scenario==='Empty')Object.assign(data,{review:0,approved:0,drafts:0,scheduled:0,published:0});
 if(scenario==='Partial error')Object.assign(data,{review:null,instagram:null,design:null});
 if(scenario==='No design access')data.design=false;
 if(scenario==='Disconnected')data.instagram={connected:0,attention:0,total:0};
 if(scenario==='Missing company')data.company=null;
 if(scenario==='Long name and counts')Object.assign(data,{company:{business_name:'Northline Coffee & Community — Independent Roasters'},review:1234,approved:5678,scheduled:9012,published:34567});
 if(scenario==='Instagram issue')data.instagram={connected:0,attention:1,total:1};
 if(['Loading','Expired session'].includes(scenario)){root.replaceChildren();const p=document.createElement('p');p.setAttribute('role','status');p.textContent=scenario==='Loading'?'Loading your workspace…':'Reopen Home from your client portal to continue.';root.append(p);root.setAttribute('aria-busy',String(scenario==='Loading'));return;}
 renderCockpit(root,data,{qa:true});
}
document.getElementById('scenario').onchange=render;document.getElementById('width').onchange=e=>root.style.width=e.target.value;root.addEventListener('cockpit:retry',render);render();

// Fictional iframe QA only; same sizing message consumed by the real parent helper.
observeCockpitHeight(root, [location.origin]);
