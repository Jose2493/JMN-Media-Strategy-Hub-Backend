// DISPOSABLE -- Checkpoint D2 release-gate probe. Preview-only. Never
// merge this to main; deploy only from a throwaway branch and delete the
// branch/route immediately after reading the results.
//
// Purpose: empirically determine whether Vercel's Outgoing
// Requests/fetch-span instrumentation captures sensitive query-string
// parameters from an HTTP request our own serverless function makes, using
// two transports (global fetch vs. Node's native https.request).

import https from 'node:https';

const SYNTHETIC_ACCESS_TOKEN = 'JMN_SYNTHETIC_ACCESS_TOKEN_DO_NOT_USE';
const SYNTHETIC_CLIENT_SECRET = 'JMN_SYNTHETIC_CLIENT_SECRET_DO_NOT_USE';

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Not found' });
  }

  const transport = req.query.transport === 'https' ? 'https' : 'fetch';

  const targetUrl =
    `https://${req.headers.host}/api/qa/d2-echo-target` +
    `?access_token=${encodeURIComponent(SYNTHETIC_ACCESS_TOKEN)}` +
    `&client_secret=${encodeURIComponent(SYNTHETIC_CLIENT_SECRET)}`;

  try {
    if (transport === 'fetch') {
      const response = await fetch(targetUrl);
      await response.text();
      return res.status(200).json({ ok: response.ok, transport });
    }

    const statusCode = await new Promise((resolve, reject) => {
      const reqB = https.request(targetUrl, { method: 'GET' }, (resB) => {
        resB.on('data', () => {});
        resB.on('end', () => resolve(resB.statusCode));
      });
      reqB.on('error', reject);
      reqB.end();
    });

    return res.status(200).json({
      ok: statusCode >= 200 && statusCode < 300,
      transport,
    });
  } catch {
    return res.status(200).json({ ok: false, transport });
  }
}
