import { strategistDb, UUID, httpError } from './strategistStore.js';
import { getInstagramAccountForMetrics } from './socialAccounts.js';
import { decryptSocialToken } from './socialTokenCrypto.js';
import { createPublishingClient, PUBLISH_SCOPE } from './instagramPublishing.js';
export const BUCKET='social-publishing';
export const JOB_FIELDS='id,kind,caption,status,scheduled_at,timezone,error_code,media_id,created_at,published_at';
export function validateSchedule(body,now=Date.now()) {
 if(typeof body.caption!=='string'||body.caption.length>2200)throw httpError(400,'Caption must be 2,200 characters or fewer.');
 if(typeof body.timezone!=='string'||body.timezone.length>100)throw httpError(400,'Choose a valid time zone.');
 try{new Intl.DateTimeFormat('en',{timeZone:body.timezone});}catch{throw httpError(400,'Choose a valid time zone.');}
 const at=body.now===true?now:Date.parse(body.scheduledAt);
 if(!Number.isFinite(at)||(body.now!==true&&at<now+60000)||at>now+30*86400000)throw httpError(400,'Choose a time at least one minute ahead and within 30 days.');
 return {caption:body.caption,timezone:body.timezone,scheduled_at:new Date(at).toISOString()};
}
export async function checked(query) {
 const {data,error}=await query;if(error)throw httpError(503,'Publishing is temporarily unavailable. Please retry.');return data;
}
export async function ownedAccount(session,id,getAccount=getInstagramAccountForMetrics) {
 if(typeof id!=='string'||!UUID.test(id))throw httpError(400,'Invalid account');
 const account=await getAccount(session.companyId,id);
 if(!account||account.company_id!==session.companyId)throw httpError(404,'Account unavailable');return account;
}
export function assertPublishAccess(account,until=Date.now()) {
 if(account.status!=='active'||!(Date.parse(account.token_expires_at)>until+300000)||!account.scopes?.includes(PUBLISH_SCOPE))
 throw httpError(409,'Enable publishing or reconnect Instagram before scheduling this post.');
}
export async function publishingReady(db=strategistDb()) {
 if(process.env.INSTAGRAM_PUBLISHING_ENABLED!=='true'||!process.env.CRON_SECRET)return false;
 const {data,error}=await db.from('social_publish_worker').select('last_seen').eq('id',true).maybeSingle();
 return !error&&Date.parse(data?.last_seen)>Date.now()-300000;
}
export function decryptAccount(account) {
 return decryptSocialToken({ciphertext:account.access_token_ciphertext,iv:account.access_token_iv,authTag:account.access_token_auth_tag,
  keyVersion:account.token_key_version,aadVersion:account.token_aad_version},
 {companyId:account.company_id,platform:'instagram',externalAccountId:account.external_account_id});
}
export function createWorkerRepository(db=strategistDb()) {
 return {
  async claim(){const rows=await checked(db.rpc('claim_social_publish_job'));return rows?.[0]||null;},
  async save(job,patch){const row=await checked(db.from('social_publish_jobs').update({...patch,updated_at:new Date().toISOString()})
   .eq('id',job.id).eq('lease',job.lease).eq('status',job.status).gt('locked_until',new Date().toISOString()).select('id').maybeSingle());
   if(!row)throw new Error('LEASE_LOST');Object.assign(job,patch);},
  async mediaUrl(job){const {data,error}=await db.storage.from(BUCKET).createSignedUrl(job.storage_path,3600);
   if(error||!data?.signedUrl)throw new Error('MEDIA_UNAVAILABLE');return data.signedUrl;}
 };
}
// One provider stage per invocation; the database retains progress across restarts.
export async function runPublishStep({repository=createWorkerRepository(),client=createPublishingClient(),
 getAccount=getInstagramAccountForMetrics,decrypt=decryptAccount,now=Date.now}={}) {
 const job=await repository.claim();if(!job)return {processed:0};
 const save=patch=>repository.save(job,patch);
 try {
  const account=await getAccount(job.company_id,job.account_id);
  if(!account||account.company_id!==job.company_id)throw new Error('ACCOUNT_UNAVAILABLE');
  assertPublishAccess(account,now());
  const token=decrypt(account);
  if(job.attempts>20)throw new Error('PROCESSING_TIMEOUT');
  if(!job.container_id){
   const url=await repository.mediaUrl(job);
   const id=await client.create(account.external_account_id,token,job,url);
   await save({container_id:id,next_attempt_at:new Date(now()+60000).toISOString(),locked_until:null,lease:null});
  }else{
   const state=await client.status(job.container_id,token);
   if(state==='PUBLISHED'){await save({status:'published',published_at:new Date(now()).toISOString(),error_code:null,lease:null,locked_until:null});}
   else if(state==='IN_PROGRESS'){await save({next_attempt_at:new Date(now()+60000).toISOString(),lease:null,locked_until:null});}
   else if(state==='FINISHED'){
    // Commit intent BEFORE issuing a publish request. An ambiguous result is never retried automatically.
    await save({status:'publishing'});
    let mediaId;
    try{mediaId=await client.publish(account.external_account_id,token,job.container_id);}
    catch{await save({status:'uncertain',error_code:'CONFIRMATION_REQUIRED',lease:null,locked_until:null});return {processed:1};}
    await save({status:'published',media_id:mediaId,published_at:new Date(now()).toISOString(),error_code:null,lease:null,locked_until:null});
   }else throw new Error('MEDIA_REJECTED');
  }
 }catch(error){
  if(error.message==='LEASE_LOST')return {processed:1};
  // If committing the response failed, retain publishing intent for stale-lease recovery.
  if(job.status==='publishing')return {processed:1};
  const code=error.status===409?'RECONNECT_REQUIRED':error.message==='PROCESSING_TIMEOUT'?'PROCESSING_TIMEOUT':'PREPARATION_FAILED';
  await save({status:'failed',error_code:code,lease:null,locked_until:null});
 }
 return {processed:1};
}
