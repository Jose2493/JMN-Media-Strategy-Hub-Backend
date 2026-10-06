(() => {
 'use strict';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,primary=false)=>{const b=el('button',text,`btn ${primary?'btn-primary':'btn-secondary'}`);b.type='button';b.onclick=fn;return b;};
 const labels={draft:'Draft',scheduled:'Scheduled',processing:'Processing',publishing:'Publishing',published:'Published',failed:'Needs attention',uncertain:'Check Instagram',cancelled:'Cancelled'};
 const errors={CONFIRMATION_REQUIRED:'Publication unconfirmed. Check Instagram before creating another post.',RECONNECT_REQUIRED:'Reconnect Instagram to schedule a new post.',PROCESSING_TIMEOUT:'Processing timed out. Check the file format before creating a new post.',PREPARATION_FAILED:'Couldn’t prepare this post. Check the media or reconnect Instagram.'};
 function mountContent(root,{request,onPost,library=false,listRequest}){
  let closed=false,items=[],tab='IN_REVIEW',reviewDialog=null,page=0,hasMore=false,loadVersion=0;
  const filters={q:'',filter:'all',project:''};
  const section=el('section','','approved-content'),intro=el('div');
  intro.append(el('h3',library?'Your media library':'Content'),el('p',library?'Every photo and reel produced together, in one place.':'Review your latest work and prepare your next post.','publishing-subtitle'));
  const tabs=el('nav','','publishing-tabs');tabs.setAttribute('aria-label','Filter client content');
  const note=el('p','Loading content…','metrics-note');note.setAttribute('role','status');
  const assets=el('div','','approved-assets');
  for(const [state,label] of [['IN_REVIEW','In Review'],['APPROVED','Approved']]){
   const b=button(label,()=>{tab=state;draw();});b.dataset.state=state;tabs.append(b);
  }
  const controls=el('form','','library-controls');
  const search=el('input');search.type='search';search.maxLength=160;search.placeholder='Search by title';search.setAttribute('aria-label','Search by title');
  const campaign=el('input');campaign.maxLength=160;campaign.placeholder='Project / campaign (exact name)';campaign.setAttribute('aria-label','Project or campaign');
  const filter=el('select');filter.setAttribute('aria-label','Filter media');
  for(const [value,label] of [['all','All'],['photos','Photos'],['reels','Reels'],['approved','Approved']]){const o=el('option',label);o.value=value;filter.append(o);}
  const apply=button('Search',()=>{});apply.type='submit';controls.append(search,filter,campaign,apply);
  controls.onsubmit=e=>{e.preventDefault();filters.q=search.value.trim();filters.project=campaign.value.trim();filters.filter=filter.value;page=0;load();};
  filter.onchange=()=>{filters.q=search.value.trim();filters.project=campaign.value.trim();filters.filter=filter.value;page=0;load();};
  const pager=el('nav','','library-pager');pager.setAttribute('aria-label','Media library pages');
  const prev=button('Previous',()=>{page--;load();}),next=button('Next',()=>{page++;load();}),pageLabel=el('span');pager.append(prev,pageLabel,next);
  const retry=button('Retry',()=>load());retry.hidden=true;
  section.append(intro,library?controls:tabs,note,retry,assets);if(library){section.classList.add('media-library');section.append(pager);}
  // Place content above Publishing without changing the publishing layout.
  const previous=Array.from(root.children);root.replaceChildren(section,...previous);
  async function act(trigger,fn){trigger.disabled=true;note.textContent='';try{await fn();}catch(e){if(!closed)note.textContent=e.message;}finally{trigger.disabled=false;}}
  function draw(){
   if(closed)return;assets.replaceChildren();
   for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.state===tab));
   const visible=library?items:items.filter(a=>a.status===tab);if(library){prev.disabled=page===0;next.disabled=!hasMore;pageLabel.textContent=`Page ${page+1}`;}note.textContent=visible.length?'':library?(filters.q||filters.project||filters.filter!=='all'?'No media matches these filters. Try another search.':'Your media library is empty. Your JMN team’s deliveries will appear here.'):tab==='IN_REVIEW'?'Nothing awaiting review.':'Your approved content will appear here.';
   for(const asset of visible){
    const card=el('article','','approved-asset'),thumb=el('img');thumb.alt=asset.title;if(asset.posterUrl||asset.previewUrl)thumb.src=asset.posterUrl||asset.previewUrl;
    const detail=el('div','','approved-asset-detail'),approved=asset.status==='APPROVED';
    detail.append(el('span',approved?'Approved':'In Review','publishing-status '+(approved?'status-published':'status-draft')),el('h4',asset.title));
    detail.append(el('p',[asset.kind==='REELS'?'Reel':'Photo',asset.projectLabel,(library?asset.createdAt:asset.approvedAt)?new Date(library?asset.createdAt:asset.approvedAt).toLocaleDateString():null].filter(Boolean).join(' · '),'publishing-row-meta'));
    const actions=el('div','','content-actions');
    const review=button(approved?'Preview':'Review preview',()=>act(review,async()=>{
     const fresh=await request({command:'review',assetId:asset.id});if(closed)return;openReview(fresh);
    }));actions.append(review);
    if(approved){
     const download=button('Download original',()=>act(download,async()=>{
      const result=await request({command:'download',assetId:asset.id});if(closed)return;
      const link=el('a');link.href=result.url;link.rel='noreferrer';link.referrerPolicy='no-referrer';link.download='';document.body.append(link);link.click();link.remove();
     }));
     const post=button('Post this',()=>act(post,async()=>{
      if(!onPost)throw new Error('Connect Instagram to post this content.');
      const fresh=await request({command:'preview',assetId:asset.id});if(!closed)onPost(fresh);
     }),true);actions.append(download);if(!library||onPost)actions.append(post);
    }
    card.append(thumb,detail,actions);assets.append(card);
   }
  }
  function openReview(asset){
   reviewDialog?.close();const d=el('dialog','','publisher-dialog content-review-dialog');reviewDialog=d;d.setAttribute('aria-label','Review content');
   const bar=el('div','','publisher-bar'),heading=el('div');heading.append(el('h2',asset.title),el('p','Review Preview'));
   const close=button('×',()=>d.close());close.setAttribute('aria-label','Close review');bar.append(heading,close);
   const body=el('div','','content-review-body');body.append(el('p','Optimized for fast playback. Original quality is preserved.','content-preview-note'));
   const media=el(asset.kind==='REELS'?'video':'img');
   if(asset.kind==='REELS'){media.controls=true;media.preload='metadata';if(asset.posterUrl)media.poster=asset.posterUrl;}else media.alt='Protected review preview';
   if(asset.previewUrl)media.src=asset.previewUrl;body.append(media,el('p','For review only','content-preview-note'));
   const footer=el('div','','publisher-actions'),feedback=el('p','','publishing-warning');feedback.setAttribute('role','status');footer.append(feedback);
   if(asset.status==='IN_REVIEW'){
    const approve=button('Approve',async()=>{
     if(!window.confirm('Approve this content? Original download and publishing will become available.'))return;
     approve.disabled=true;
     try{await request({command:'approve',assetId:asset.id});if(!closed){d.close();tab='APPROVED';await load();}}
     catch(e){feedback.textContent=e.message;}finally{approve.disabled=false;}
    },true);footer.append(approve);
   }
   d.append(bar,body,footer);document.body.append(d);d.addEventListener('close',()=>{d.remove();if(reviewDialog===d)reviewDialog=null;},{once:true});d.showModal();
  }
  async function load(){
   const version=++loadVersion;retry.hidden=true;note.textContent=library?'Loading your media library…':'Loading content…';assets.replaceChildren();section.setAttribute('aria-busy','true');prev.disabled=true;next.disabled=true;
   try{const data=await (library?listRequest({...filters,page:String(page)}):request());if(closed||version!==loadVersion)return;items=data.assets;hasMore=!!data.hasMore;draw();}
   catch(e){if(!closed&&version===loadVersion){note.textContent=e.message;retry.hidden=false;}}
   finally{if(!closed&&version===loadVersion)section.setAttribute('aria-busy','false');}
  }
  load();return {close(){closed=true;reviewDialog?.close();}};
 }
 window.JmnPublishing={mountContent,mount(root,{account,request,connect,approvedRequest,composerOnly=false}){
  let closed=false,dialog=null,jobs=[],ready=false,timer=null,loading=false,activeTab='posts';
  const section=el('section','','publishing-section');root.append(section);
  const content=approvedRequest&&!composerOnly?mountContent(root,{request:approvedRequest,onPost:asset=>compose(null,asset)}):null;
  const head=el('div','','publishing-head'),title=el('div');
  title.append(el('h3','Publishing'),el('p','Create, schedule and manage your social content.','publishing-subtitle'));
  const create=button('+ Create post',()=>compose(),true);head.append(title,create);
  const message=el('p','','publishing-notice');message.setAttribute('role','status');
  const status=el('span','','publishing-connection');
  const tabs=el('nav','','publishing-tabs');tabs.setAttribute('aria-label','Filter publishing posts');
  const filters={posts:()=>true,drafts:j=>j.status==='draft',scheduled:j=>j.status==='scheduled',published:j=>j.status==='published'};
  for(const [key,label] of [['posts','Posts'],['drafts','Drafts'],['scheduled','Scheduled'],['published','Published']]){
   const tab=button(label,()=>{activeTab=key;draw();});tab.dataset.filter=key;tabs.append(tab);
  }
  const list=el('div','','publishing-list');list.setAttribute('aria-label','Publishing posts');
  section.append(head,status,tabs,message,list);message.textContent='Loading posts…';
  function draw(){
   message.textContent='';
   const canPublish=account.scopes?.includes('instagram_business_content_publish');
   status.textContent=ready&&canPublish?'Auto-publishing active':'Instagram connected';
   for(const tab of tabs.children){tab.setAttribute('aria-pressed',String(tab.dataset.filter===activeTab));}
   const visibleJobs=jobs.filter(filters[activeTab]);
   list.replaceChildren();
   if(!account.scopes?.includes('instagram_business_content_publish')){
    const access=el('div','','publishing-access');access.append(el('p','Connect publishing to post directly from JMN Media.'),button('Enable publishing',()=>connect()));list.append(access);
   }
   if(!visibleJobs.length){
    const empty=el('div','','publishing-empty');
    const copy={posts:['Your next post starts here','Create a post or save an idea for later.'],drafts:['No drafts yet','Save a post as a draft and pick it up anytime.'],scheduled:['Nothing scheduled yet','Create a post now or schedule one for later.'],published:['No published posts yet','Posts published through JMN Media will appear here.']}[activeTab];
    empty.append(el('span','＋','publishing-empty-icon'),el('h4',copy[0]),el('p',copy[1]),button('Create post',()=>compose()));list.append(empty);
   }
   for(const job of visibleJobs){
    const row=el('article','','publishing-row');const detail=el('div','','publishing-row-detail');
    const summary=el('div','','publishing-row-summary');
    summary.append(el('span',labels[job.status]||job.status,'publishing-status status-'+job.status),el('h4',job.caption?.slice(0,100)||`Untitled ${job.kind==='REELS'?'Reel':'photo'}`));detail.append(summary);
    detail.append(el('p',`${job.kind==='REELS'?'Reel':'Photo'} · Instagram`,'publishing-row-meta'));
    if(job.scheduled_at)detail.append(el('p',new Date(job.scheduled_at).toLocaleString(undefined,{timeZone:job.timezone})+' · '+job.timezone,'metrics-note'));
    if(job.error_code)detail.append(el('p',errors[job.error_code]||'Review this post before trying again.','publishing-warning'));
    const actions=el('div','','publishing-row-actions');
    if(job.status==='draft')actions.append(button('Continue',()=>compose(job)));
    if(['draft','scheduled'].includes(job.status))actions.append(button('Cancel',async()=>{
     if(!window.confirm('Cancel this post? It will not be sent to Instagram.'))return;
     try{await request({command:'cancel',id:job.id});await refresh();}catch(e){message.textContent=e.message;}
    }));
    for(const action of actions.children){if(action.textContent==='Cancel')action.className+=' publishing-cancel';else action.className+=' publishing-continue';}
    row.append(detail,actions);list.append(row);
   }
  }
  async function refresh(){if(closed||loading)return;loading=true;try{const data=await request();if(closed)return;jobs=data.jobs;ready=data.ready;draw();}catch(e){if(!closed)message.textContent=e.message;}finally{loading=false;}}
  function compose(existing,approvedAsset){
   if(closed)return;dialog?.close();
   let id=existing?.id||crypto.randomUUID(),kind=approvedAsset?.kind||existing?.kind||'IMAGE',uploaded=!!existing,busy=false,objectUrl=null;
   const d=el('dialog','','publisher-dialog');dialog=d;d.setAttribute('aria-label','Create Instagram post');
   const bar=el('div','','publisher-bar'),heading=el('div');
   heading.append(el('h2','Create post'),el('p',`@${account.username} · Instagram`));
   const closeBtn=button('×',()=>{if(!busy)d.close();});closeBtn.setAttribute('aria-label','Close composer');bar.append(heading,closeBtn);
   const body=el('div','','publisher-body'),edit=el('div','','publisher-edit'),preview=el('div','','publisher-preview');
   const fileLabel=el('label','Media','publisher-label');const file=el('input');file.type='file';file.accept='image/jpeg,video/mp4';
   const uploadZone=el('span','','publisher-upload'),uploadIcon=el('span','↑','publisher-upload-icon'),fileName=el('span',approvedAsset?approvedAsset.title:existing?'Replace media':'Drop a photo or reel here','publisher-file-name');
   uploadIcon.setAttribute('aria-hidden','true');uploadZone.append(uploadIcon,fileName,el('span','or choose file','publisher-upload-choice'),file);fileLabel.append(uploadZone);
   file.setAttribute('aria-label','Choose a JPEG photo or MP4 Reel');file.setAttribute('aria-describedby','publisher-file-hint');
   uploadZone.addEventListener('dragover',e=>{e.preventDefault();if(!busy)uploadZone.classList.add('is-dragging');});
   uploadZone.addEventListener('dragleave',()=>uploadZone.classList.remove('is-dragging'));
   uploadZone.addEventListener('drop',e=>{e.preventDefault();uploadZone.classList.remove('is-dragging');if(busy||!e.dataTransfer.files.length)return;file.files=e.dataTransfer.files;file.dispatchEvent(new Event('change'));});
   const hint=el('p','JPEG up to 8 MB (4:5 to 1.91:1), or MP4 Reel up to 100 MB. Your file is uploaded privately.','metrics-note');
   hint.id='publisher-file-hint';
   const captionLabel=el('label','Caption','publisher-label');const caption=el('textarea');caption.rows=5;caption.maxLength=2200;caption.value=approvedAsset?.caption||existing?.caption||'';caption.placeholder='Write a caption…';captionLabel.append(caption);
   const count=el('p','','publisher-count'),previewCaption=el('p','','publisher-preview-caption');
   const updateCaption=()=>{count.textContent=`${caption.value.length} / 2,200`;previewCaption.textContent=caption.value||'Your caption will appear here.';};caption.oninput=updateCaption;updateCaption();
   const whenLabel=el('fieldset','','publisher-timing'),when=el('select');when.hidden=true;whenLabel.append(el('legend','Publish'));
   for(const [value,text] of [['later','Schedule for later'],['now','Publish as soon as ready']]){const o=el('option',text);o.value=value;when.append(o);}whenLabel.append(when);
   const segments=el('div','','publisher-segments');
   for(const [value,text] of [['now','Post now'],['later','Schedule']]){
    const label=el('label'),radio=el('input');radio.type='radio';radio.name='publisher-timing';radio.value=value;radio.checked=when.value===value;
    radio.onchange=()=>{when.value=value;when.dispatchEvent(new Event('change'));};label.append(radio,el('span',text));segments.append(label);
   }whenLabel.append(segments);
   const timeLabel=el('label','Date and time','publisher-label'),time=el('input');time.type='datetime-local';timeLabel.append(time);
   const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
   const zoneText=el('p',`Time zone: ${zone}. Instagram processing can delay publication by a few minutes.`,'metrics-note');
   when.onchange=()=>{timeLabel.hidden=when.value==='now';sendBtn.textContent=when.value==='now'?'Post now':'Schedule post';};
   const feedback=el('p','','publishing-warning');feedback.setAttribute('role','status');
   const media=el('div','','publisher-media');media.append(el('span','Add media to preview your post'));preview.append(el('div',`@${account.username}`,'publisher-preview-account'),media,previewCaption);
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
   file.onchange=async()=>{approvedAsset=null;uploaded=false;id=crypto.randomUUID();feedback.textContent='';try{await localFile();fileName.textContent=file.files[0].name;}catch(e){feedback.textContent=e.message;}};
   async function ensureUpload(){
    if(uploaded)return;
    if(approvedAsset){
     feedback.textContent='Preparing approved media…';
     const result=await approvedRequest({command:'prepare',assetId:approvedAsset.id});
     id=result.job.id;kind=result.job.kind;uploaded=true;return;
    }
    const f=await localFile();const result=await request({command:'upload',id,kind});
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
   const actions=el('div','','publisher-actions'),saveBtn=button('Save draft',()=>save(false)),sendBtn=button('Schedule post',()=>save(true),true),cancelBtn=button('Cancel',()=>{if(!busy)d.close();});
   const footerButtons=el('div','','publisher-footer-buttons');footerButtons.append(cancelBtn,saveBtn,sendBtn);actions.append(feedback,footerButtons);
   edit.append(fileLabel,hint,captionLabel,count,whenLabel,timeLabel,zoneText);body.append(edit,preview);d.append(bar,body,actions);document.body.append(d);
   d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.addEventListener('close',()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);d.remove();if(dialog===d)dialog=null;create.focus();},{once:true});d.showModal();
   if(approvedAsset){
    if(approvedAsset.previewUrl)showMedia(approvedAsset.previewUrl);
    else if(approvedAsset.posterUrl){const poster=el('img');poster.alt='Approved Reel preview';poster.src=approvedAsset.posterUrl;media.replaceChildren(poster);}
   }
   if(existing)request({command:'preview',id}).then(data=>{if(d.isConnected)showMedia(data.url);}).catch(()=>{uploaded=false;feedback.textContent='Choose your media file to complete this draft.';});
  }
  if(composerOnly)section.hidden=true;
  else {refresh();timer=setInterval(()=>{if(!document.hidden)refresh();},30000);}
  return {compose:asset=>compose(null,asset),close(){closed=true;content?.close();clearInterval(timer);dialog?.close();}};
 }};
})();
