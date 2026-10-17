// Optional parent-side helper for the dedicated Home iframe. Install only during portal rollout.
(() => {
  const frame=document.getElementById('jmn-client-cockpit');
  if(!frame)return;
  let origin;
  try{origin=new URL(frame.src).origin;}catch{return;}
  const measure=()=>frame.contentWindow?.postMessage({type:'jmn:cockpit-measure'},origin);
  frame.style.display='block';
  frame.style.width='100%';
  frame.style.maxWidth='100%';
  frame.style.maxHeight='none';
  frame.setAttribute('scrolling','no');
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!==origin||event.data?.type!=='jmn:cockpit-height')return;
    const height=event.data.height;
    if(!Number.isSafeInteger(height)||height<1||height>10000)return;
    frame.style.height=height+'px';
  });
  // Handles both late helper installation and a child that finishes after us.
  frame.addEventListener('load',measure);
  window.addEventListener('resize',measure);
  window.visualViewport?.addEventListener('resize',measure);
  measure();
})();
