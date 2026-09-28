import { randomUUID } from 'node:crypto';
import { strategistDb, UUID, httpError } from './strategistStore.js';
import { BUCKET, JOB_FIELDS, checked, ownedAccount } from './socialPublishing.js';
export const CONTENT_BUCKET='jmn-content';
const FIELDS='id,company_id,title,kind,original_filename,original_ext,master_path,review_path,poster_path,publishing_path,caption,project_label,status,created_at,approved_at';
export function createApprovedContent({getDb=strategistDb,getAccount=ownedAccount,newId=randomUUID,now=()=>new Date().toISOString()}={}) {
 function validate(a,companyId){
  if(!a||a.company_id!==companyId||!UUID.test(a.id)||!UUID.test(a.company_id)||!['IN_REVIEW','APPROVED'].includes(a.status)||!['IMAGE','REELS'].includes(a.kind)||!['jpg','jpeg','png','mp4','mov'].includes(a.original_ext))throw httpError(404,'Content unavailable.');
  const base=`${a.company_id}/${a.id}/`,ext=a.kind==='IMAGE'?'jpg':'mp4';
  if(a.master_path!==base+'master.'+a.original_ext||a.review_path!==base+'review.'+ext||a.poster_path!==base+'poster.jpg'||a.publishing_path!==base+'social.'+ext)throw httpError(404,'Content unavailable.');
  return a;
 }
 const publicAsset=a=>({id:a.id,title:a.title,kind:a.kind,caption:a.caption,projectLabel:a.project_label,status:a.status,createdAt:a.created_at,approvedAt:a.approved_at});
 async function sign(db,path,ttl=300,options){
  const {data,error}=await db.storage.from(CONTENT_BUCKET).createSignedUrl(path,ttl,options);
  if(error||!data?.signedUrl)throw httpError(503,'Media unavailable. Please retry.');return data.signedUrl;
 }
 async function asset(db,session,id){
  if(typeof id!=='string'||!UUID.test(id))throw httpError(400,'Invalid content.');
  return validate(await checked(db.from('social_approved_assets').select(FIELDS).eq('company_id',session.companyId).eq('id',id).maybeSingle()),session.companyId);
 }
 function approved(a){if(a.status!=='APPROVED')throw httpError(409,'Approve this content before downloading or posting.');}
 async function review(db,a){return {...publicAsset(a),previewUrl:await sign(db,a.review_path),posterUrl:await sign(db,a.poster_path)};}
 return {
  async list(session){
   const db=getDb();const rows=await checked(db.from('social_approved_assets').select(FIELDS).eq('company_id',session.companyId).order('created_at',{ascending:false}).limit(30));
   return {assets:await Promise.all(rows.map(row=>review(db,validate(row,session.companyId))))};
  },
  async review(session,_accountId,id){const db=getDb(),a=await asset(db,session,id);return review(db,a);},
  async approve(session,_accountId,id){
   const db=getDb(),a=await asset(db,session,id);if(a.status==='APPROVED')return {asset:publicAsset(a)};
   const updated=await checked(db.from('social_approved_assets').update({status:'APPROVED',approved_at:now(),approved_by:session.contactId}).eq('company_id',session.companyId).eq('id',id).eq('status','IN_REVIEW').select(FIELDS).maybeSingle());
   // Idempotent concurrent approval, retaining the first recorded approver/time.
   return {asset:publicAsset(updated?validate(updated,session.companyId):await asset(db,session,id))};
  },
  async download(session,_accountId,id){
   const db=getDb(),a=await asset(db,session,id);approved(a);
   const filename=a.original_filename.replace(/[^\p{L}\p{N} ._()-]/gu,'_').slice(0,180).replace(/^\.+/,'')||('original.'+a.original_ext);
   return {url:await sign(db,a.master_path,60,{download:filename})};
  },
  async preview(session,accountId,id){
   await getAccount(session,accountId);const db=getDb(),a=await asset(db,session,id);approved(a);
   return {...publicAsset(a),previewUrl:await sign(db,a.publishing_path)};
  },
  async prepare(session,accountId,id){
   await getAccount(session,accountId);const db=getDb(),a=await asset(db,session,id);approved(a);
   const count=await db.from('social_publish_jobs').select('id',{count:'exact',head:true}).eq('company_id',session.companyId).gte('created_at',new Date(Date.now()-86400000).toISOString());
   if(count.error)throw httpError(503,'Unable to prepare post.');if(count.count>=100)throw httpError(429,'Daily upload limit reached.');
   const source=db.storage.from(CONTENT_BUCKET),folder=a.publishing_path.slice(0,a.publishing_path.lastIndexOf('/')),name=a.publishing_path.slice(folder.length+1);
   const files=await source.list(folder,{search:name,limit:10}),file=files.data?.find(f=>f.name===name);
   const mime=a.kind==='IMAGE'?'image/jpeg':'video/mp4',limit=(a.kind==='IMAGE'?8:100)*1024*1024;
   if(files.error||!file||file.metadata?.mimetype!==mime||!(file.metadata.size>0&&file.metadata.size<=limit))throw httpError(400,'Approved media is missing or exceeds the supported size.');
   const jobId=newId(),path=`${session.companyId}/${accountId}/${jobId}.${a.kind==='IMAGE'?'jpg':'mp4'}`;
   // Server-side storage copy; the browser never downloads/reuploads the media.
   const copy=await source.copy(a.publishing_path,path,{destinationBucket:BUCKET});
   if(copy.error)throw httpError(503,'Couldn’t prepare this media. Please retry.');
   try{
    const job=await checked(db.from('social_publish_jobs').insert({id:jobId,company_id:session.companyId,account_id:accountId,created_by:session.contactId,kind:a.kind,storage_path:path,caption:a.caption}).select(JOB_FIELDS).single());
    return {job};
   }catch(error){await db.storage.from(BUCKET).remove([path]);throw error;}
  }
 };
}
