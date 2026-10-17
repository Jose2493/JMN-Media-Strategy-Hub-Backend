// Preview-only fixture to exercise the production parent sizing helper, with no portal data.
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_TARGET_ENV==='production')return res.status(404).send('Not found');
 if(req.method!=='GET'||req.headers.authorization||req.url.includes('?'))return res.status(400).send('Open without credentials or query parameters.');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Founding onboarding iframe · Preview QA</title><link rel="stylesheet" href="/client-cockpit.css"><script defer src="/client-cockpit-embed.js"></script><script defer src="/client-cockpit-frame-qa.js"></script></head><body><aside class="qa"><strong>Fictional portal shell · No production access</strong><label>Frame width <select id="frame-width"><option value="100%">Desktop</option><option value="390px">Mobile 390px</option><option value="320px">Narrow 320px</option></select></label></aside><iframe id="jmn-client-cockpit" title="Founding Partner QA" src="/api/qa/founding-partner"></iframe><p class="qa">End of portal shell — page scroll continues here.</p></body></html>`);
}
