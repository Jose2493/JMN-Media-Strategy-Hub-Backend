// Optional parent-side helper for the dedicated Home iframe. Install only during portal rollout.
(() => {
  const frame=document.getElementById('jmn-client-cockpit');
  if(!frame)return;
  let origin;
  try{origin=new URL(frame.src).origin;}catch{return;}
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!==origin||event.data?.type!=='jmn:cockpit-height')return;
    const height=event.data.height;
    if(!Number.isSafeInteger(height)||height<1||height>10000)return;
    frame.style.height=height+'px';
  });
})();
