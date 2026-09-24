(() => {
 'use strict';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,primary=false)=>{const b=el('button',text,`btn ${primary?'btn-primary':'btn-secondary'}`);b.type='button';b.onclick=fn;return b;};
 const labels={draft:'Draft',scheduled:'Scheduled',processing:'Preparing on Instagram',publishing:'Publishing',published:'Published',failed:'Needs attention',uncertain:'Check Instagram',cancelled:'Cancelled'};
 const errors={CONFIRMATION_REQUIRED:'Instagram did not confirm the result. Check your profile before creating another post.',RECONNECT_REQUIRED:'Reconnect Instagram before creating a new scheduled post.',PROCESSING_TIMEOUT:'Instagram took too long to process this file. Check its format before trying a new post.',PREPARATION_FAILED:'Instagram could not prepare this post. Check the media and connection before creating a new post.'};
 window.JmnPublishing={mount(root,{account,request,connect}){
  let closed=false,dialog=null,jobs=[],ready=false,timer=null,loading=false;
  const section=el('section','','publishing-section');root.append(section);
  const head=el('div','','publishing-head'),title=el('div');
  title.append(el('div','CREATE · SCHEDULE · PUBLISH','section-kicker'),el('h3','Put your next move out there.'));
  const create=button('+ Create post',()=>compose(),true);head.append(title,create);
  const message=el('p','','publishing-notice');message.setAttribute('role','status');
  const list=el('div','','publishing-list');section.append(head,message,list);
  function draw(){
   message.textContent=ready?'Choose when your content goes live. Scheduled posts run even when you leave the portal.':'Drafts are available. Automatic publishing is awaiting activation.';
   list.replaceChildren();
   if(!account.scopes?.includes('instagram_business_content_publish')){
    const access=el('div','','publishing-access');access.append(el('p','Your account is connected for insights. Enable publishing when you are ready to post.'),button('Enable publishing',()=>connect()));list.append(access);
   }
   if(!jobs.length)list.append(el('p','Your drafts and upcoming posts will appear here.','metrics-note'));
   for(const job of jobs){
    const row=el('article','','publishing-row');const detail=el('div');
    detail.append(el('span',labels[job.status]||job.status,'publishing-status status-'+job.status),el('h4',job.caption?.slice(0,100)||`Untitled ${job.kind==='REELS'?'Reel':'photo'}`));
    if(job.scheduled_at)detail.append(el('p',new Date(job.scheduled_at).toLocaleString(undefined,{timeZone:job.timezone})+' · '+job.timezone,'metrics-note'));
    if(job.error_code)detail.append(el('p',errors[job.error_code]||'Review this post before trying again.','publishing-warning'));
    const actions=el('div','','publishing-row-actions');
    if(job.status==='draft')actions.append(button('Continue draft',()=>compose(job)));
    if(['draft','scheduled'].includes(job.status))actions.append(button('Cancel',async()=>{
     if(!window.confirm('Cancel this post? It will not be sent to Instagram.'))return;
     try{await request({command:'cancel',id:job.id});await refresh();}catch(e){message.textContent=e.message;}
    }));
    row.append(detail,actions);list.append(row);
   }
  }
  async function refresh(){if(closed||loading)return;loading=true;try{const data=await request();if(closed)return;jobs=data.jobs;ready=data.ready;draw();}catch(e){if(!closed)message.textContent=e.message;}finally{loading=false;}}
  function compose(existing){
   if(closed)return;dialog?.close();
   let id=existing?.id||crypto.randomUUID(),kind=existing?.kind||'IMAGE',uploaded=!!existing,busy=false,objectUrl=null;
   const d=el('dialog','','publisher-dialog');dialog=d;d.setAttribute('aria-label','Create Instagram post');
   const bar=el('div','','publisher-bar');bar.append(el('strong',`Create for @${account.username}`),button('Close ×',()=>{if(!busy)d.close();}));
   const body=el('div','','publisher-body'),edit=el('div','','publisher-edit'),preview=el('div','','publisher-preview');
   const fileLabel=el('label','Photo or Reel','publisher-label');const file=el('input');file.type='file';file.accept='image/jpeg,video/mp4';fileLabel.append(file);
   const hint=el('p','JPEG up to 8 MB (4:5 to 1.91:1), or MP4 Reel up to 100 MB. Your file is uploaded privately.','metrics-note');
   const captionLabel=el('label','Caption','publisher-label');const caption=el('textarea');caption.rows=7;caption.maxLength=2200;caption.value=existing?.caption||'';caption.placeholder='What should your audience know — and do next?';captionLabel.append(caption);
   const count=el('p','','publisher-count'),previewCaption=el('p','','publisher-preview-caption');
   const updateCaption=()=>{count.textContent=`${caption.value.length} / 2,200`;previewCaption.textContent=caption.value||'Your caption will appear here.';};caption.oninput=updateCaption;updateCaption();
   const whenLabel=el('label','When to publish','publisher-label'),when=el('select');
   for(const [value,text] of [['later','Schedule for later'],['now','Publish as soon as ready']]){const o=el('option',text);o.value=value;when.append(o);}whenLabel.append(when);
   const timeLabel=el('label','Date and time','publisher-label'),time=el('input');time.type='datetime-local';timeLabel.append(time);
   const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
   const zoneText=el('p',`Time zone: ${zone}. Instagram processing can delay publication by a few minutes.`,'metrics-note');
   when.onchange=()=>{timeLabel.hidden=when.value==='now';};
   const feedback=el('p','','publishing-warning');feedback.setAttribute('role','status');
   const media=el('div','','publisher-media');media.append(el('span','Your preview'));preview.append(el('div',`@${account.username}`,'publisher-preview-account'),media,previewCaption);
   function showMedia(url){media.replaceChildren();const node=el(kind==='REELS'?'video':'img');if(kind==='REELS'){node.controls=true;node.preload='metadata';}else node.alt='Post preview';node.src=url;media.append(node);}
   const localFile=async()=>{
    const f=file.files[0];if(!f)throw new Error('Choose a JPEG photo or MP4 Reel.');
    kind=f.type==='image/jpeg'?'IMAGE':f.type==='video/mp4'?'REELS':null;
    if(!kind||f.size>(kind==='IMAGE'?8:100)*1024*1024||!f.size)throw new Error('Choose a supported file within the size limit.');
    if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(f);
    if(kind==='IMAGE'){const img=new Image();img.src=objectUrl;await img.decode();const ratio=img.width/img.height;
     if(ratio<0.8||ratio>1.91)throw new Error('Crop your photo between 4:5 portrait and 1.91:1 landscape.');}
    showMedia(objectUrl);return f;
   };
   file.onchange=async()=>{uploaded=false;id=crypto.randomUUID();feedback.textContent='';try{await localFile();}catch(e){feedback.textContent=e.message;}};
   async function ensureUpload(){
    if(uploaded)return;const f=await localFile();const result=await request({command:'upload',id,kind});
    const url=new URL(result.uploadUrl);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co'))throw new Error('Unable to prepare a secure upload.');
    feedback.textContent='Uploading media…';
    const response=await fetch(url,{method:'PUT',headers:{'Content-Type':f.type},body:f});
    if(!response.ok)throw new Error('Upload failed. Select the file again to retry.');uploaded=true;
   }
   async function save(schedule){
    if(busy)return;
    let at=null;
    if(schedule){
     if(!ready){feedback.textContent='Publishing has not been activated yet. Save a draft for now.';return;}
     if(!account.scopes?.includes('instagram_business_content_publish')){feedback.textContent='Save your draft, then enable publishing for this account.';return;}
     if(when.value==='later'){
      const date=new Date(time.value);if(!time.value||!Number.isFinite(date.getTime())||date.getTime()<Date.now()+60000){feedback.textContent='Choose a date and time at least one minute ahead.';return;}
      // Reject nonexistent spring-forward local times rather than silently shifting them.
      const pad=n=>String(n).padStart(2,'0');const local=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      if(local!==time.value){feedback.textContent='That local time does not exist because of daylight saving. Choose another time.';return;}
      at=date.toISOString();
     }
     const summary=when.value==='now'?'Publish to Instagram as soon as processing finishes?':`Schedule for ${new Date(at).toLocaleString()} (${zone})?`;
     if(!window.confirm(summary))return;
    }
    busy=true;saveBtn.disabled=sendBtn.disabled=file.disabled=true;
    try{await ensureUpload();await request({command:schedule?'schedule':'save',id,caption:caption.value,timezone:zone,now:when.value==='now',scheduledAt:at});d.close();await refresh();}
    catch(e){feedback.textContent=e.message;}
    finally{busy=false;saveBtn.disabled=sendBtn.disabled=file.disabled=false;}
   }
   const actions=el('div','','publisher-actions'),saveBtn=button('Save draft',()=>save(false)),sendBtn=button('Confirm publication',()=>save(true),true);
   actions.append(saveBtn,sendBtn);edit.append(fileLabel,hint,captionLabel,count,whenLabel,timeLabel,zoneText,feedback,actions);body.append(edit,preview);d.append(bar,body);document.body.append(d);
   d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);d.remove();if(dialog===d)dialog=null;create.focus();},{once:true});d.showModal();
   if(existing)request({command:'preview',id}).then(data=>{if(d.isConnected)showMedia(data.url);}).catch(()=>{uploaded=false;feedback.textContent='Choose your media file to complete this draft.';});
  }
  refresh();timer=setInterval(()=>{if(!document.hidden)refresh();},30000);
  return {close(){closed=true;clearInterval(timer);dialog?.close();}};
 }};
})();
