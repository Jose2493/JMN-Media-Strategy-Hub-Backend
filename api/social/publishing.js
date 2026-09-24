import { verifySocialSessionAuthorizationHeader } from '../../lib/socialSession.js';
import { strategistDb, UUID, httpError } from '../../lib/strategistStore.js';
import { BUCKET, JOB_FIELDS, checked, ownedAccount, assertPublishAccess, publishingReady, validateSchedule } from '../../lib/socialPublishing.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
 let session;try{session=verifySocialSessionAuthorizationHeader(req.headers.authorization||'');}catch{return res.status(401).json({error:'Session expired. Reopen Social Center from your portal.'});}
 try{
  const body=req.body||{};const accountId=req.method==='GET'?req.query.account:body.accountId;
  const account=await ownedAccount(session,accountId);const db=strategistDb();
  const query=()=>db.from('social_publish_jobs').select('*').eq('company_id',session.companyId).eq('account_id',accountId);
  if(req.method==='GET'){
   const jobs=await checked(db.from('social_publish_jobs').select(JOB_FIELDS).eq('company_id',session.companyId).eq('account_id',accountId).order('created_at',{ascending:false}).limit(50));
   return res.status(200).json({jobs,ready:await publishingReady(db)});
  }
  if(typeof body.id!=='string'||!UUID.test(body.id))throw httpError(400,'Invalid post');
  let job=await checked(query().eq('id',body.id).maybeSingle());
  if(body.command==='upload'){
   if(!['IMAGE','REELS'].includes(body.kind))throw httpError(400,'Choose a JPEG image or MP4 Reel.');
   if(!job){
    const count=await db.from('social_publish_jobs').select('id',{count:'exact',head:true}).eq('company_id',session.companyId).gte('created_at',new Date(Date.now()-86400000).toISOString());
    if(count.error)throw httpError(503,'Unable to create post.');
    if(count.count>=100)throw httpError(429,'Daily upload limit reached.');
    const row={id:body.id,company_id:session.companyId,account_id:accountId,created_by:session.contactId,kind:body.kind,
     storage_path:`${session.companyId}/${accountId}/${body.id}.${body.kind==='IMAGE'?'jpg':'mp4'}`};
    const result=await db.from('social_publish_jobs').insert(row).select('*').single();
    if(result.error?.code==='23505')job=await checked(query().eq('id',body.id).maybeSingle());
    else if(result.error)throw httpError(503,'Unable to create post.');else job=result.data;
   }
   if(!job||job.status!=='draft'||job.kind!==body.kind)throw httpError(409,'This post cannot accept a new upload.');
   const {data,error}=await db.storage.from(BUCKET).createSignedUploadUrl(job.storage_path,{upsert:false});
   if(error||!data?.signedUrl)throw httpError(503,'Unable to prepare upload.');
   return res.status(200).json({id:job.id,uploadUrl:data.signedUrl});
  }
  if(!job)throw httpError(404,'Post unavailable');
  if(body.command==='preview'){
   const {data,error}=await db.storage.from(BUCKET).createSignedUrl(job.storage_path,600);
   if(error||!data?.signedUrl)throw httpError(409,'Upload the media first.');
   return res.status(200).json({url:data.signedUrl});
  }
  if(body.command==='save'||body.command==='schedule'){
   if(job.status!=='draft')throw httpError(409,'This post changed. Refresh the queue.');
   if(typeof body.caption!=='string'||body.caption.length>2200)throw httpError(400,'Caption must be 2,200 characters or fewer.');
   let patch={caption:body.caption};
   if(body.command==='schedule'){
    if(!await publishingReady(db))throw httpError(503,'Scheduling is not activated. Your draft is safe.');
    patch={...validateSchedule(body),status:'scheduled'};assertPublishAccess(account,Date.parse(patch.scheduled_at));
    const folder=job.storage_path.slice(0,job.storage_path.lastIndexOf('/'));const name=job.storage_path.slice(folder.length+1);
    const {data,error}=await db.storage.from(BUCKET).list(folder,{search:name,limit:10});const file=data?.find(f=>f.name===name);
    const mime=job.kind==='IMAGE'?'image/jpeg':'video/mp4';const limit=job.kind==='IMAGE'?8*1024*1024:100*1024*1024;
    if(error||!file||file.metadata?.mimetype!==mime||!(file.metadata.size>0&&file.metadata.size<=limit))throw httpError(400,'Media is missing or exceeds the supported size.');
   }
   const row=await checked(db.from('social_publish_jobs').update({...patch,updated_at:new Date().toISOString()}).eq('id',job.id).eq('company_id',session.companyId).eq('account_id',accountId).eq('status','draft').select(JOB_FIELDS).maybeSingle());
   if(!row)throw httpError(409,'This post changed. Refresh the queue.');return res.status(200).json({job:row});
  }
  if(body.command==='cancel'){
   const row=await checked(db.from('social_publish_jobs').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',job.id).eq('company_id',session.companyId).eq('account_id',accountId).in('status',['draft','scheduled']).select(JOB_FIELDS).maybeSingle());
   if(!row)throw httpError(409,'Publishing has already started, or this post changed. Refresh the queue.');return res.status(200).json({job:row});
  }
  throw httpError(400,'Invalid command');
 }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Publishing is temporarily unavailable. Please retry.'});}
}
