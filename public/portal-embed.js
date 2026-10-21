// Parent helper. Opt-in frames only; no tokens, URLs, identities or business logic in messages.
(()=>{
 const channels={cockpit:'jmn:cockpit',strategy:'jmn:strategy',social:'jmn:social',design:'jmn:design'};
 for(const frame of document.querySelectorAll('iframe[data-jmn-workspace]')){
  const channel=Object.hasOwn(channels,frame.dataset.jmnWorkspace)?channels[frame.dataset.jmnWorkspace]:null;
  if(!channel)continue;
  let origin;try{const url=new URL(frame.src,location.href);if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')continue;origin=url.origin;}catch{continue;}
  frame.style.display='block';frame.style.width='100%';frame.style.maxWidth='100%';frame.style.maxHeight='none';frame.setAttribute('scrolling','no');
  const wrapper=frame.parentElement;
  if(wrapper?.classList.contains('cbe-block-iframe-wrapper')){wrapper.style.padding='0';wrapper.style.height='auto';wrapper.style.overflow='visible';frame.style.position='static';}
  const measure=()=>frame.contentWindow?.postMessage({type:channel+'-measure'},origin);
  window.addEventListener('message',event=>{
   if(event.source!==frame.contentWindow||event.origin!==origin||event.data?.type!==channel+'-height')return;
   const height=event.data.height;
   if(!Number.isSafeInteger(height)||height<1||height>1000000)return;
   frame.style.height=height+'px';
  });
  frame.addEventListener('load',measure);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);measure();
 }
})();
