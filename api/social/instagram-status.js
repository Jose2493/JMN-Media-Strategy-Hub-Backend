import { verifySocialSessionAuthorizationHeader } from '../../lib/socialSession.js';
import { listInstagramAccountsForCompany } from '../../lib/socialAccounts.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let session;
  try {
    session = verifySocialSessionAuthorizationHeader(req.headers.authorization || '');
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  try {
    const accounts = await listInstagramAccountsForCompany(session.companyId);
    return res.status(200).json({ accounts });
  } catch {
    return res.status(500).json({ error: 'Unable to load Instagram connection status' });
  }
}
