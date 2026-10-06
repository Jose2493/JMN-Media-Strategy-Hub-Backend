(() => {
 'use strict';
 // Separate from session/bootstrap messages. Only layout and display data.
 const parentOrigin='https://portal.jmnmedia.com';
 if(window.parent===window||new URLSearchParams(location.search).get('embedded')==='1')return;
 document.documentElement.classList.add('portal-embedded');
 let active=false,lastHeight=0,queued=false;
 const send=()=>{
  queued=false;if(!active)return;
  const height=Math.ceil(Math.max(document.body.getBoundingClientRect().height,document.body.scrollHeight));
  if(height>0&&height!==lastHeight){lastHeight=height;window.parent.postMessage({type:'jmn:portal-height',version:1,height},parentOrigin);}
 };
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(send);}};
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.type!=='jmn:portal-init'||event.data.version!==1)return;
  const height=event.data.viewportHeight;
  if(Number.isFinite(height)&&height>=240&&height<=10000)document.documentElement.style.setProperty('--portal-viewport-height',height+'px');
  active=true;lastHeight=0;
  if(typeof window.JmnHomeDisplay==='function')window.JmnHomeDisplay(event.data.display);
  schedule();
 });
 new ResizeObserver(schedule).observe(document.body);
 window.addEventListener('resize',schedule);
 window.addEventListener('load',schedule);
 document.fonts?.ready.then(schedule);
 window.parent.postMessage({type:'jmn:portal-ready',version:1},parentOrigin);
})();
