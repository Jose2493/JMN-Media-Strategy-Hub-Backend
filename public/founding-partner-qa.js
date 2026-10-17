import {renderFounding} from './founding-partner-view.js';
import {observeCockpitHeight} from './client-cockpit-height.js';
const root=document.getElementById('cockpit');
function render(){
 const scenario=document.getElementById('scenario').value;
 if(scenario==='Unauthorized'){root.textContent='Your regular Home remains available. Founding Partner onboarding is not enabled for this workspace.';return;}
 const project=scenario==='Riany / Project';
 const data={eligible:true,completed:false,workspace:{kind:project?'project':'company',name:project?'Riany Mena':'Semper CrossFit',category:project?'Chef brand & content':'Fitness & community',focus:project?'Introduce the story behind your next signature menu.':'Show the community behind every training session.'},instagram:{connected:1,handles:[project?'example_chef':'example_fitness'],attention:0},activity:{review:2,approved:3,drafts:1,scheduled:0,published:6},areas:{strategy:true,social:true,design:!project,media:true}};
 if(scenario==='Missing context'){data.workspace.focus='';data.workspace.category='';data.instagram=null;data.activity={review:null,approved:null,drafts:null,scheduled:null,published:null};data.areas.design=false;data.areas.media=false;}
 renderFounding(root,data,{qa:true,save:async()=>{if(scenario==='Save error')throw Error();},onHome:()=>{root.textContent='Preview complete — Home is the next destination. No data saved.';}});
}
document.getElementById('scenario').onchange=render;render();
observeCockpitHeight(root,[location.origin]);
