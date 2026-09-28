import { randomBytes } from 'node:crypto';
import { publishingPreviewPage } from '../../lib/publishingPreviewPage.js';

// Separate read-only fixture route. Never participates in portal authentication.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_TARGET_ENV === 'production') {
    return res.status(404).send('Not found');
  }
  // No credentials, query flags, or client-provided environment override is accepted.
  if (req.method !== 'GET' || req.headers.authorization || req.url.includes('?')) {
    return res.status(400).send('Open the QA path without credentials or query parameters.');
  }
  const nonce = randomBytes(24).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(publishingPreviewPage(nonce));
}
