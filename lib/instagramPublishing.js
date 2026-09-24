import { assertInstagramUserId } from './instagramClient.js';
export const PUBLISH_SCOPE = 'instagram_business_content_publish';
export class PublishingError extends Error {
 constructor(code) { super(code); this.code=code; }
}
// No provider bodies, tokens, or signed URLs enter error responses or logs.
export function createPublishingClient(fetchImpl=globalThis.fetch) {
 async function call(id, edge, token, fields, method='POST') {
  assertInstagramUserId(id);
  const url=new URL(`https://graph.instagram.com/${id}${edge?'/'+edge:''}`);
  if(method==='GET') for(const [k,v] of Object.entries(fields))url.searchParams.set(k,v);
  let response;
  try { response=await fetchImpl(url,{method,headers:{Authorization:`Bearer ${token}`},
   ...(method==='POST'?{body:new URLSearchParams(fields)}:{}),signal:AbortSignal.timeout(20000)}); }
  catch {throw new PublishingError('PROVIDER_UNCONFIRMED');}
  if(!response.ok)throw new PublishingError('PROVIDER_REJECTED');
  let data;try{data=await response.json();}catch{throw new PublishingError('PROVIDER_UNCONFIRMED');}
  if(!data||typeof data!=='object')throw new PublishingError('PROVIDER_UNCONFIRMED');
  return data;
 }
 const resultId=data=>{if(typeof data.id!=='string'||!/^\d{1,30}$/.test(data.id))throw new PublishingError('PROVIDER_UNCONFIRMED');return data.id;};
 return {
  async create(account,token,job,url){return resultId(await call(account,'media',token,job.kind==='REELS'
   ?{media_type:'REELS',video_url:url,caption:job.caption,share_to_feed:'true'}:{image_url:url,caption:job.caption}));},
  async status(id,token){const data=await call(id,'',token,{fields:'status_code'},'GET');
   if(!['IN_PROGRESS','FINISHED','PUBLISHED','ERROR','EXPIRED'].includes(data.status_code))throw new PublishingError('PROVIDER_UNCONFIRMED');return data.status_code;},
  async publish(account,token,id){return resultId(await call(account,'media_publish',token,{creation_id:id}));}
 };
}
