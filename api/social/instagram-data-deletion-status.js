import { verifyMetaDeletionConfirmation } from '../../lib/metaSignedRequest.js';

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
}

export default async function handler(req, res) {
  setHeaders(res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const code = Array.isArray(req.query?.code) ? null : req.query?.code;
  if (typeof appSecret !== 'string' || appSecret.length === 0 || typeof code !== 'string') {
    return res.status(404).send('Not found');
  }

  try {
    verifyMetaDeletionConfirmation(code, appSecret);
  } catch {
    return res.status(404).send('Not found');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Data deletion complete</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:560px;padding:32px;text-align:center}p{color:#bdbdbd;line-height:1.6}</style></head><body><main><h1>Instagram data deletion complete</h1><p>JMN Media has completed the deletion request for the connected Instagram account data associated with this request.</p></main></body></html>`);
}
