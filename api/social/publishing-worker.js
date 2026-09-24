import { timingSafeEqual } from 'node:crypto';
import { runPublishStep } from '../../lib/socialPublishing.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const expected=process.env.CRON_SECRET?'Bearer '+process.env.CRON_SECRET:'';
 const actual=req.headers.authorization||'';
 if(req.method!=='GET'||!expected||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(401).json({error:'Unauthorized'});
 if(process.env.INSTAGRAM_PUBLISHING_ENABLED!=='true')return res.status(200).json({enabled:false});
 try{return res.status(200).json(await runPublishStep());}
 catch{return res.status(503).json({error:'Worker unavailable'});}
}
