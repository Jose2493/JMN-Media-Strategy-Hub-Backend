import { verifySocialSessionAuthorizationHeader } from '../../lib/socialSession.js';
import { createApprovedContent } from '../../lib/approvedContent.js';
export function createHandler({verify=verifySocialSessionAuthorizationHeader,service=createApprovedContent()}={}) {
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  let session;try{session=verify(req.headers.authorization||'');}catch{return res.status(401).json({error:'Session expired. Reopen Social Center from your portal.'});}
  try{
   if(req.method==='GET')return res.status(200).json(await service.list(session));
   const body=req.body||{};
   if(!['review','approve','download','preview','prepare'].includes(body.command)||Object.keys(body).some(k=>!['command','assetId','accountId'].includes(k)))
    return res.status(400).json({error:'Invalid approved content request.'});
   return res.status(200).json(await service[body.command](session,body.accountId,body.assetId));
  }catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Approved content is temporarily unavailable.'});}
 };
}
export default createHandler();
