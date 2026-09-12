// DISPOSABLE D4 Preview-only self-test. Never merge to main.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { verifySocialSessionAuthorizationHeader } from '../../lib/socialSession.js';
import { encryptSocialToken } from '../../lib/socialTokenCrypto.js';
import {
  buildInstagramAuthorizationUrl,
  parseInstagramCallbackQuery,
  completeInstagramOAuthCallback,
  buildInstagramCallbackPage,
} from '../../lib/instagramOAuthFlow.js';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '17841400000000001';
const STATE = 'A'.repeat(43);
const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];

async function rejected(operation) {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const checks = {
    strictSession: false,
    authorizationUrlSafe: false,
    malformedCallbackBlockedBeforeState: false,
    declineConsumesExactlyOnce: false,
    happyPathSequence: false,
    aadContextCorrect: false,
    missingScopeBlocked: false,
    identityMismatchBlocked: false,
    callbackPageSafe: false,
  };

  const previousKey = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  try {
    // Strict session verification with an in-memory synthetic secret only.
    const sessionSecret = 'synthetic-d4-session-secret-at-least-32-bytes';
    const sessionToken = jwt.sign(
      { companyId: COMPANY_ID, contactId: CONTACT_ID },
      sessionSecret,
      { algorithm: 'HS256', expiresIn: '5m' }
    );
    const session = verifySocialSessionAuthorizationHeader(`Bearer ${sessionToken}`, sessionSecret);
    checks.strictSession = session.companyId === COMPANY_ID && session.contactId === CONTACT_ID;

    const authUrl = new URL(buildInstagramAuthorizationUrl({
      clientId: '123456789012345',
      redirectUri: 'https://example.com/api/social/instagram-callback',
      state: STATE,
    }));
    checks.authorizationUrlSafe =
      authUrl.origin === 'https://www.instagram.com' &&
      authUrl.pathname === '/oauth/authorize' &&
      authUrl.searchParams.get('state') === STATE &&
      !authUrl.searchParams.has('companyId') &&
      !authUrl.searchParams.has('contactId') &&
      !authUrl.searchParams.has('sessionToken');

    let malformedConsumes = 0;
    checks.malformedCallbackBlockedBeforeState = await rejected(() =>
      completeInstagramOAuthCallback({
        query: { state: STATE, code: 'abc', error: 'denied' },
        clientId: '123456789012345',
        clientSecret: 'synthetic',
        redirectUri: 'https://example.com/api/social/instagram-callback',
        consumeState: async () => { malformedConsumes += 1; },
        exchangeAuthorizationCode: async () => ({}),
        exchangeLongLivedToken: async () => ({}),
        getAccountIdentity: async () => ({}),
        encryptToken: () => ({}),
        upsertAccount: async () => {},
      })
    ) && malformedConsumes === 0;

    let declineConsumes = 0;
    const decline = await completeInstagramOAuthCallback({
      query: { state: STATE, error: 'access_denied', error_description: 'ignored' },
      clientId: '123456789012345',
      clientSecret: 'synthetic',
      redirectUri: 'https://example.com/api/social/instagram-callback',
      consumeState: async () => {
        declineConsumes += 1;
        return { companyId: COMPANY_ID, contactId: CONTACT_ID };
      },
      exchangeAuthorizationCode: async () => { throw new Error('must not run'); },
      exchangeLongLivedToken: async () => { throw new Error('must not run'); },
      getAccountIdentity: async () => { throw new Error('must not run'); },
      encryptToken: () => { throw new Error('must not run'); },
      upsertAccount: async () => { throw new Error('must not run'); },
    });
    checks.declineConsumesExactlyOnce = decline.outcome === 'declined' && declineConsumes === 1;

    // Actual B crypto helper with a per-invocation synthetic in-memory key.
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const sequence = [];
    let aadContext;
    const happy = await completeInstagramOAuthCallback({
      query: { state: STATE, code: 'synthetic-code' },
      clientId: '123456789012345',
      clientSecret: 'synthetic-app-secret',
      redirectUri: 'https://example.com/api/social/instagram-callback',
      nowMs: 1_800_000_000_000,
      consumeState: async () => {
        sequence.push('state');
        return { companyId: COMPANY_ID, contactId: CONTACT_ID };
      },
      exchangeAuthorizationCode: async () => {
        sequence.push('short');
        return { accessToken: 'IGAA_short_synthetic', userId: USER_ID, permissions: SCOPES };
      },
      exchangeLongLivedToken: async () => {
        sequence.push('long');
        return { accessToken: 'IGAA_long_synthetic', expiresIn: 5_184_000 };
      },
      getAccountIdentity: async ({ expectedUserId }) => {
        sequence.push('identity');
        return { userId: expectedUserId, username: 'synthetic_account', accountType: 'BUSINESS' };
      },
      encryptToken: (token, context) => {
        sequence.push('encrypt');
        aadContext = context;
        return encryptSocialToken(token, context);
      },
      upsertAccount: async ({ encryptedToken, scopes }) => {
        sequence.push('upsert');
        if (!encryptedToken?.ciphertext || scopes.length !== 2) throw new Error('invalid');
      },
    });
    checks.happyPathSequence =
      happy.outcome === 'connected' &&
      sequence.join(',') === 'state,short,long,identity,encrypt,upsert';
    checks.aadContextCorrect =
      aadContext?.companyId === COMPANY_ID &&
      aadContext?.platform === 'instagram' &&
      aadContext?.externalAccountId === USER_ID;

    checks.missingScopeBlocked = await rejected(() =>
      completeInstagramOAuthCallback({
        query: { state: STATE, code: 'synthetic-code' },
        clientId: '123456789012345',
        clientSecret: 'synthetic-app-secret',
        redirectUri: 'https://example.com/api/social/instagram-callback',
        consumeState: async () => ({ companyId: COMPANY_ID, contactId: CONTACT_ID }),
        exchangeAuthorizationCode: async () => ({
          accessToken: 'IGAA_short_synthetic', userId: USER_ID,
          permissions: ['instagram_business_basic'],
        }),
        exchangeLongLivedToken: async () => { throw new Error('must not run'); },
        getAccountIdentity: async () => ({}),
        encryptToken: () => ({}),
        upsertAccount: async () => {},
      })
    );

    checks.identityMismatchBlocked = await rejected(() =>
      completeInstagramOAuthCallback({
        query: { state: STATE, code: 'synthetic-code' },
        clientId: '123456789012345',
        clientSecret: 'synthetic-app-secret',
        redirectUri: 'https://example.com/api/social/instagram-callback',
        consumeState: async () => ({ companyId: COMPANY_ID, contactId: CONTACT_ID }),
        exchangeAuthorizationCode: async () => ({
          accessToken: 'IGAA_short_synthetic', userId: USER_ID, permissions: SCOPES,
        }),
        exchangeLongLivedToken: async () => ({ accessToken: 'IGAA_long_synthetic', expiresIn: 5_184_000 }),
        getAccountIdentity: async () => ({
          userId: '17841400000000002', username: 'wrong', accountType: 'BUSINESS',
        }),
        encryptToken: () => { throw new Error('must not run'); },
        upsertAccount: async () => {},
      })
    );

    const page = buildInstagramCallbackPage({
      outcome: 'connected',
      allowedOrigin: 'https://portal.example.com',
    });
    checks.callbackPageSafe =
      page.html.includes('history.replaceState') &&
      page.html.includes('window.opener.postMessage') &&
      page.html.includes('https://portal.example.com') &&
      !page.html.includes('access_token') &&
      !page.html.includes('client_secret') &&
      typeof page.nonce === 'string' && page.nonce.length > 10;

    // Also directly exercise parser in the Vercel runtime.
    parseInstagramCallbackQuery({ state: STATE, code: 'synthetic-code' });

    const ok = Object.values(checks).every(Boolean);
    return res.status(ok ? 200 : 500).json({ ok, checks });
  } catch {
    return res.status(500).json({ ok: false, checks });
  } finally {
    if (previousKey === undefined) delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    else process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = previousKey;
  }
}
