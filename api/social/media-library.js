import {verifySocialSessionAuthorizationHeader} from '../../lib/socialSession.js';
import {createApprovedContent} from '../../lib/approvedContent.js';
export function createHandler({verify=verifySocialSessionAuthorizationHeader,service=createApprovedContent()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  let session;try{session=verify(req.headers.authorization||'');}catch{return res.status(401).json({error:'Session expired. Reopen Media & Deliverables from your portal.'});}
  try{return res.status(200).json(await service.library(session,req.query||{}));}
  catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Your media library is temporarily unavailable. Please retry.'});}
 };
}
export default createHandler();
