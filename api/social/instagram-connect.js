import { verifySocialSessionAuthorizationHeader } from '../../lib/socialSession.js';
import { createSocialOAuthState } from '../../lib/socialOAuthState.js';
import {
  buildInstagramAuthorizationUrl,
} from '../../lib/instagramOAuthFlow.js';

function hasConnectConfig() {
  return Boolean(
    process.env.INSTAGRAM_APP_ID &&
    process.env.INSTAGRAM_REDIRECT_URI
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let session;
  try {
    session = verifySocialSessionAuthorizationHeader(req.headers.authorization || '');
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (!hasConnectConfig()) {
    return res.status(503).json({ error: 'Instagram connection is not configured' });
  }

  try {
    const state = await createSocialOAuthState({
      companyId: session.companyId,
      contactId: session.contactId,
      platform: 'instagram',
    });

    const authorizationUrl = buildInstagramAuthorizationUrl({
      clientId: process.env.INSTAGRAM_APP_ID,
      redirectUri: process.env.INSTAGRAM_REDIRECT_URI,
      state,
    });

    return res.status(200).json({ authorizationUrl });
  } catch {
    return res.status(500).json({ error: 'Unable to start Instagram connection' });
  }
}
