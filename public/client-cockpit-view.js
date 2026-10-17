import {cockpitModel,routes} from './client-cockpit-model.js';

const node = (tag,text,className) => {
  const n=document.createElement(tag);
  if(text)n.textContent=text;
  if(className)n.className=className;
  return n;
};

// Fixed local geometry only: no remote images or user-supplied SVG.
const paths = {
  review:'M5 4h14v16H5z M8 8h8 M8 12h5 M8 16h3',
  approved:'M5 12l4 4L19 6',
  scheduled:'M5 5h14v15H5z M8 3v4 M16 3v4 M5 10h14 M9 14h2',
  published:'M12 16V3 M7 8l5-5 5 5 M5 14v6h14v-6',
  move:'M5 19L19 5 M7 5h12v12',
  attention:'M12 7v6 M12 17h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  channel:'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 7h.01'
};
function icon(name,className='icon') {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:className}))svg.setAttribute(key,value);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',paths[name]);svg.append(path);return svg;
}

export function workspaceInitials(name) {
  const words=typeof name==='string'?name.match(/[\p{L}\p{N}]+/gu):null;
  if(!words?.length)return 'JM';
  return (words.length===1?Array.from(words[0]).slice(0,2).join(''):Array.from(words[0])[0]+Array.from(words.at(-1))[0]).toUpperCase();
}

export function renderCockpit(root,data,{navigateDesign,qa=false}={}) {
  const model=cockpitModel(data);
  const link=(label,route,className='text-link')=>{
    const a=node('a',label,className);a.href=routes[route];a.target='_top';
    if(qa)a.addEventListener('click',e=>{e.preventDefault();feedback.textContent=`Preview only: opens ${route==='social'?'Social Center':'Strategy Session'}. No data changed.`;});
    return a;
  };
  root.replaceChildren();root.setAttribute('aria-busy','false');
  const header=node('header',null,'workspace-header');
  const avatar=node('span',workspaceInitials(data.company?.business_name),'workspace-avatar');avatar.setAttribute('aria-hidden','true');
  const identity=node('div',null,'workspace-identity');
  identity.append(node('p','Your workspace','eyebrow'),node('h1',model.name),node('p','Here’s where things stand.','muted'));
  header.append(avatar,identity);
  const summary=node('p',null,'summary');
  const channelState=data.instagram===null?'unknown':data.instagram.attention?'attention':data.instagram.connected?'connected':'offline';
  model.status.split(' · ').forEach((text,index)=>{
    const item=node('span',null,index===2?`summary-item channel-status ${channelState}`:'summary-item');
    item.append(icon(['review','scheduled','channel'][index]),node('span',text));summary.append(item);
  });
  header.append(summary);root.append(header);

  const quick=node('nav',null,'quick');quick.setAttribute('aria-label','Quick actions');
  quick.append(link('Strategy Session ↗','strategy','action primary'),link('Social Center ↗','social','action'));
  if(data.design===true){const b=node('button','Design Studio ↗','action');b.type='button';b.addEventListener('click',()=>qa?feedback.textContent='Preview only: opens authorized Design Studio.':navigateDesign?.());quick.append(b);}
  root.append(quick);
  const feedback=node('p',null,'notice');feedback.setAttribute('role','status');root.append(feedback);
  if(model.incomplete){
    const warning=node('div',null,'notice');warning.append(node('span','Some workspace information is unavailable. '));
    const retry=node('button','Retry','action');retry.type='button';retry.onclick=()=>root.dispatchEvent(new Event('cockpit:retry'));warning.append(retry);root.append(warning);
  }

  const pulse=node('section',null,'pulse');
  const pulseHeading=node('div',null,'pulse-heading'),pulseTitle=node('div');
  pulseTitle.append(node('p','Today’s move','eyebrow'),node('h2','Daily Pulse — by JMN'));
  pulseHeading.append(pulseTitle,icon('move','icon pulse-direction'));
  pulse.append(pulseHeading,node('p',model.pulse,'pulse-copy'));
  const actions=node('div',null,'actions');actions.append(link('Ask Strategist ↗','strategy'),link('Turn into action →',model.action));pulse.append(actions);root.append(pulse);

  if(model.attention.length){
    const section=node('section',null,'attention');section.append(node('h2','Needs Your Attention'));
    const list=node('ul');
    for(const item of model.attention){
      const li=node('li'),a=link('',item.route,'attention-link'),text=node('span',null,'attention-copy');
      text.append(node('strong',item.title),node('span',item.detail,'detail'));
      a.append(icon('attention','icon attention-marker'),text,icon('move','icon row-arrow'));li.append(a);list.append(li);
    }
    section.append(list);root.append(section);
  }

  const pipeline=node('section',null,'pipeline');pipeline.append(node('h2','Content Pipeline'));
  const stages=node('div',null,'stages'),kinds=['review','approved','scheduled','published'];
  model.pipeline.forEach(([label,count],index)=>{
    const a=link('','social','stage');
    a.setAttribute('data-stage',kinds[index]);a.setAttribute('data-state',count===null?'unknown':count>0?'active':'empty');
    a.setAttribute('aria-label',`${label}: ${count===null?'unavailable':count}. Open Social Center`);
    const top=node('span',null,'stage-top');top.append(icon(kinds[index]),node('span',label,'stage-label'));
    const marker=node('span',null,'state-marker');marker.setAttribute('aria-hidden','true');
    a.append(top,node('strong',count===null?'—':String(count),'stage-count'),marker);stages.append(a);
  });
  pipeline.append(stages,link('Open Social Center →','social','foot pipeline-link'));root.append(pipeline);
}
