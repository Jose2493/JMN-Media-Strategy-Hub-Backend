import {verifySocialSessionAuthorizationHeader} from '../lib/socialSession.js';
import {createFoundingService,validateFoundingBody} from '../lib/foundingPartners.js';
export function createHandler({verify=verifySocialSessionAuthorizationHeader,service=createFoundingService()}={}) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  let session;try{session=verify(req.headers.authorization||'');}catch{return res.status(401).json({error:'Reopen Home from your portal.'});}
  if(Object.keys(req.query||{}).length)return res.status(400).json({error:'Unexpected parameters.'});
  try{return res.status(200).json(req.method==='GET'?await service.load(session):await service.save(session,validateFoundingBody(req.body)));}
  catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Onboarding is temporarily unavailable.'});}
 };
}
export default createHandler();
