import {observeCockpitHeight} from './client-cockpit-height.js';

// Presentation only. The existing same-origin Social dialog keeps its bounded chat.
const workspace=document.body.dataset.jmnWorkspace;
const modal=workspace==='strategy'&&new URLSearchParams(location.search).get('embedded')==='1';
if(workspace&&!modal){
 document.documentElement.classList.add('portal-document');
 const root=document.querySelector('[data-jmn-surface]');
 if(root)observeCockpitHeight(root,['https://portal.jmnmedia.com','https://app.suitedash.com',location.origin],`jmn:${workspace}`);
}
