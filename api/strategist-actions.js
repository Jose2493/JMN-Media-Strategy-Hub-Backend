import {verifySocialSessionAuthorizationHeader} from '../lib/socialSession.js';
import {createActionService} from '../lib/strategistActions.js';
export function createHandler({verify=verifySocialSessionAuthorizationHeader,service=createActionService()}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  let session;try{session=verify(req.headers.authorization||'');}catch{return res.status(401).json({error:'Reopen Strategist from your portal.'});}
  try{
   if(Object.keys(req.query||{}).some(k=>req.method!=='GET'||k!=='conversation'))return res.status(400).json({error:'Unexpected parameters.'});
   return res.status(200).json(req.method==='GET'?await service.load(session,req.query?.conversation):await service.submit(session,req.body));
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Actions are temporarily unavailable.'});}
 };
}
export default createHandler();
