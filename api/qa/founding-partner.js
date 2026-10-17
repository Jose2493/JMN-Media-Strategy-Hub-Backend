export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_TARGET_ENV==='production')return res.status(404).send('Not found');
 if(req.method!=='GET'||req.headers.authorization||req.url.includes('?'))return res.status(400).send('Open without credentials or query parameters.');
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
 res.setHeader('Content-Type','text/html; charset=utf-8');
 return res.status(200).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Founding Partners · Preview QA</title><link rel="stylesheet" href="/founding-partner.css"><script type="module" src="/founding-partner-qa.js"></script></head><body class="fp-qa-body"><aside class="fp-qa"><strong>Preview only · Fictional context, no client data or writes</strong><label>Scenario <select id="scenario"><option>Semper / Company</option><option>Riany / Project</option><option>Unauthorized</option><option>Missing context</option><option>Save error</option></select></label></aside><main id="cockpit"></main></body></html>`);
}
