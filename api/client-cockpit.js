import { verifySocialSessionAuthorizationHeader } from '../lib/socialSession.js';
import { createCockpitService } from '../lib/clientCockpit.js';
export function createHandler({verify = verifySocialSessionAuthorizationHeader, load = createCockpitService()} = {}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({error:'Method not allowed'}); }
    let session;
    try { session = verify(req.headers.authorization || ''); }
    catch { return res.status(401).json({error:'Reopen Home from your client portal.'}); }
    // No company IDs, route overrides or client-provided permissions accepted.
    if (Object.keys(req.query || {}).length) return res.status(400).json({error:'Unexpected parameters'});
    try { return res.status(200).json(await load(session)); }
    catch { return res.status(503).json({error:'Your workspace is temporarily unavailable.'}); }
  };
}
export default createHandler();
