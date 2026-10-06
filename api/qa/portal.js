import {randomBytes} from 'node:crypto';
import {portalPreviewPage} from '../../lib/portalPreviewPage.js';
export default function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_TARGET_ENV==='production')return res.status(404).send('Not found');
 const url=new URL(req.url,'https://preview.invalid');
 const keys=[...url.searchParams.keys()];
 if(req.method!=='GET'||req.headers.authorization||keys.length!==1||keys[0]!=='page')return res.status(400).send('Use only the page selector; no credentials.');
 const nonce=randomBytes(24).toString('base64');
 const html=portalPreviewPage(url.searchParams.get('page'),nonce);
 if(!html)return res.status(404).send('Not found');
 res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
 res.setHeader('Content-Type','text/html; charset=utf-8');
 return res.status(200).send(html);
}
