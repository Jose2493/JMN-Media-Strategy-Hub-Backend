import { verifySocialSessionAuthorizationHeader } from '../lib/socialSession.js';
import { strategistStore, UUID, textField, httpError } from '../lib/strategistStore.js';
import metricsHandler from './social/instagram-metrics.js';

async function loadSnapshot(authorization,accountId,mediaId) {
  let status=200, data;
  const res={setHeader(){},status(code){status=code;return this;},json(value){data=value;return this;}};
  await metricsHandler({method:'GET',headers:{authorization},query:{account:accountId}},res);
  if(status!==200) throw httpError(status,'Unable to retrieve this post');
  const post=data.recentMedia?.find(p=>p.id===mediaId);
  if(!post) throw httpError(404,'This post is no longer in the recent sample. Refresh Social Center.');
  // Only trusted server-fetched fields. No client-supplied metrics or arbitrary URLs.
  return {capturedAt:data.fetchedAt,accountId,post:{id:post.id,caption:post.caption,type:post.type,permalink:post.permalink,timestamp:post.timestamp,likes:post.likes,comments:post.comments},profile:data.profile,dailyReach:data.dailyReach,range:data.range};
}
export function createStrategistHandler({verify=verifySocialSessionAuthorizationHeader,store=strategistStore,snapshot=loadSnapshot}={}) {
 return async (req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  let session;
  try{session=verify(req.headers.authorization || '');}catch{return res.status(401).json({error:'Invalid or expired session'});}
  try{
    if(req.method==='GET') {
      const id=req.query?.conversation;
      return res.status(200).json(id ? await store.history(session.companyId,id,req.query?.before) : await store.list(session.companyId));
    }
    if(req.method!=='POST') {res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
    const body=req.body || {};
    if(body.action==='campaign') return res.status(201).json({campaign:await store.createCampaign(session.companyId,session.contactId,textField(body.name,100,true),textField(body.objective || '',1000))});
    if(body.action!=='thread') throw httpError(400,'Invalid action');
    const title=textField(body.title,120,true),campaignId=body.campaignId || null;
    if(campaignId) await store.campaign(session.companyId,campaignId);
    let socialContext=null;
    if(body.post) {
      if(typeof body.post.accountId!=='string' || !UUID.test(body.post.accountId) || typeof body.post.mediaId!=='string' || !/^\d{1,40}$/.test(body.post.mediaId)) throw httpError(400,'Invalid post');
      socialContext=await snapshot(req.headers.authorization,body.post.accountId,body.post.mediaId);
    }
    const thread=await store.createThread(session.companyId,session.contactId,{campaignId,title,socialContext});
    return res.status(201).json({conversationId:thread.id});
  }catch(error){return res.status(error.status || 500).json({error:error.status ? error.message : 'Unable to open campaign workspace'});}
 };
}
export default createStrategistHandler();
