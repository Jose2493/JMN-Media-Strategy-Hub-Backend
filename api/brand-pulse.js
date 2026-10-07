import { verifySocialSessionAuthorizationHeader } from '../lib/socialSession.js';
import { createPulseService } from '../lib/brandPulse.js';

export function createBrandPulseHandler({verify=verifySocialSessionAuthorizationHeader,service=createPulseService()}={}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); return res.status(405).json({error:'Method not allowed'}); }
    let session;
    try { session=verify(req.headers.authorization || ''); } catch { return res.status(401).json({error:'Invalid or expired session'}); }
    if (Object.keys(req.query || {}).length) return res.status(400).json({error:'Query parameters are not supported'});
    try {
      const pulse=await service({session,...(req.method==='POST'?{body:req.body || {}}:{})});
      return res.status(200).json({pulse});
    } catch(error) { return res.status(error.status || 503).json({error:error.status ? error.message : 'Brand Pulse is temporarily unavailable'}); }
  };
}
export default createBrandPulseHandler();
