import { verifySocialSessionAuthorizationHeader } from '../../lib/socialSession.js';
import { getInstagramAccountForMetrics } from '../../lib/socialAccounts.js';
import { decryptSocialToken } from '../../lib/socialTokenCrypto.js';
import { getInstagramProfileCounts, getInstagramDailyReach } from '../../lib/instagramClient.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Best-effort per-instance cache/coalescing, not durable analytics history.
const cache = new Map();
export function createMetricsHandler({ verifySession = verifySocialSessionAuthorizationHeader,
  getAccount = getInstagramAccountForMetrics, decrypt = decryptSocialToken,
  getProfile = getInstagramProfileCounts, getReach = getInstagramDailyReach,
  now = Date.now, resultCache = cache } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    let session;
    try { session = verifySession(req.headers.authorization || ''); }
    catch { return res.status(401).json({ error: 'Invalid or expired session' }); }
    const id = req.query?.account;
    if (typeof id !== 'string' || !UUID.test(id)) return res.status(400).json({ error: 'Invalid account' });
    try {
      const account = await getAccount(session.companyId, id);
      if (!account || account.company_id !== session.companyId) return res.status(404).json({ error: 'Account unavailable' });
      const timestamp = now();
      if (account.status !== 'active' || !(Date.parse(account.token_expires_at) > timestamp)) {
        return res.status(409).json({ error: 'Reconnect Instagram to load metrics.' });
      }
      const key = `${session.companyId}:${id}:${account.updated_at}`;
      let entry = resultCache.get(key);
      if (!entry || entry.expires <= timestamp) {
        if (resultCache.size >= 100) resultCache.delete(resultCache.keys().next().value);
        const until = Math.floor(timestamp / 86400000) * 86400;
        const since = until - 7 * 86400;
        const token = decrypt({ ciphertext: account.access_token_ciphertext, iv: account.access_token_iv,
          authTag: account.access_token_auth_tag, keyVersion: account.token_key_version, aadVersion: account.token_aad_version },
        { companyId: session.companyId, platform: 'instagram', externalAccountId: account.external_account_id });
        const pending = (async () => {
          const results = await Promise.allSettled([
            getProfile({ accessToken: token, expectedUserId: account.external_account_id }),
            account.scopes?.includes('instagram_business_manage_insights')
              ? getReach({ accessToken: token, userId: account.external_account_id, since, until })
              : Promise.reject({ code: 'MISSING_SCOPE' }),
          ]);
          if (results[0].status === 'rejected' && results[0].reason?.code === 'IDENTITY_MISMATCH') {
            throw new Error('IDENTITY_MISMATCH');
          }
          for (const [i, result] of results.entries()) if (result.status === 'rejected') {
            const code = result.reason?.code;
            console.warn('[instagram-metrics]', { operation: i === 0 ? 'profile' : 'reach',
              code: ['MISSING_SCOPE','IDENTITY_MISMATCH','PROVIDER_HTTP_ERROR','INVALID_RESPONSE','TIMEOUT','NETWORK_ERROR'].includes(code) ? code : 'FAILED',
              status: Number.isInteger(result.reason?.status) ? result.reason.status : null });
          }
          return { accountId: id, fetchedAt: new Date(timestamp).toISOString(),
            range: { since: new Date(since * 1000).toISOString(), until: new Date(until * 1000).toISOString() },
            profile: results[0].status === 'fulfilled' ? results[0].value : null,
            dailyReach: results[1].status === 'fulfilled' ? results[1].value : null,
            partial: results.some(result => result.status === 'rejected') };
        })();
        entry = { expires: timestamp + 60000, pending };
        resultCache.set(key, entry);
      }
      try {
        return res.status(200).json(await entry.pending);
      } catch (error) {
        resultCache.delete(key);
        throw error;
      }
    } catch {
      console.error('[instagram-metrics] account metrics unavailable');
      return res.status(500).json({ error: 'Unable to load Instagram metrics. Try again.' });
    }
  };
}
export default createMetricsHandler();
