import {
  extractMetaSignedRequest,
  verifyMetaSignedRequest,
  createMetaDeletionConfirmation,
  MetaSignedRequestError,
} from '../../lib/metaSignedRequest.js';
import {
  deleteInstagramAccountDataByExternalId,
  SocialAccountDeletionError,
} from '../../lib/socialAccountDeletion.js';

const PUBLIC_BASE_URL = 'https://jmn-media-strategy-hub-backend.vercel.app';

function setHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export default async function handler(req, res) {
  setHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (typeof appSecret !== 'string' || appSecret.length === 0) {
    return res.status(503).json({ error: 'Instagram connection is not configured' });
  }

  try {
    const signedRequest = extractMetaSignedRequest(req.body);
    const { userId } = verifyMetaSignedRequest(signedRequest, appSecret);
    await deleteInstagramAccountDataByExternalId(userId);

    const confirmationCode = createMetaDeletionConfirmation({ userId, appSecret });
    const statusUrl = new URL('/api/social/instagram-data-deletion-status', PUBLIC_BASE_URL);
    statusUrl.searchParams.set('code', confirmationCode);

    return res.status(200).json({
      url: statusUrl.toString(),
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    if (error instanceof MetaSignedRequestError) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    if (error instanceof SocialAccountDeletionError) {
      return res.status(500).json({ error: 'Unable to complete request' });
    }
    return res.status(500).json({ error: 'Unable to complete request' });
  }
}
