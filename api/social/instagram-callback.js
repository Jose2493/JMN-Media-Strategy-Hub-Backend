import {
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  getInstagramAccountIdentity,
} from '../../lib/instagramClient.js';
import { consumeSocialOAuthState } from '../../lib/socialOAuthState.js';
import { encryptSocialToken } from '../../lib/socialTokenCrypto.js';
import { upsertOwnedInstagramAccount } from '../../lib/socialAccounts.js';
import {
  buildInstagramCallbackPage,
  completeInstagramOAuthCallback,
  InstagramOAuthFlowError,
  validatePostMessageOrigin,
} from '../../lib/instagramOAuthFlow.js';

const APP_ID_PATTERN = /^\d{1,30}$/;

function validHttpsUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash;
  } catch {
    return false;
  }
}

function callbackConfigIsValid() {
  if (!APP_ID_PATTERN.test(process.env.INSTAGRAM_APP_ID || '')) return false;
  if (typeof process.env.INSTAGRAM_APP_SECRET !== 'string' || process.env.INSTAGRAM_APP_SECRET.length === 0) return false;
  if (!validHttpsUrl(process.env.INSTAGRAM_REDIRECT_URI)) return false;
  if (typeof process.env.SOCIAL_TOKEN_ENCRYPTION_KEY !== 'string' || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY.length === 0) return false;
  try {
    validatePostMessageOrigin(process.env.SOCIAL_OAUTH_ALLOWED_ORIGIN);
  } catch {
    return false;
  }
  return true;
}

function setBaseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
}

function sendCallbackPage(res, outcome, statusCode) {
  try {
    const { html, nonce } = buildInstagramCallbackPage({
      outcome,
      allowedOrigin: process.env.SOCIAL_OAUTH_ALLOWED_ORIGIN,
    });
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; ` +
      `base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; img-src 'none'`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(statusCode).send(html);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(statusCode).send('Instagram connection failed. You can close this window.');
  }
}

export default async function handler(req, res) {
  setBaseHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  // Fail before consuming OAuth state if server configuration is incomplete.
  if (!callbackConfigIsValid()) {
    return sendCallbackPage(res, 'error', 503);
  }

  try {
    const result = await completeInstagramOAuthCallback({
      query: req.query,
      clientId: process.env.INSTAGRAM_APP_ID,
      clientSecret: process.env.INSTAGRAM_APP_SECRET,
      redirectUri: process.env.INSTAGRAM_REDIRECT_URI,
      consumeState: consumeSocialOAuthState,
      exchangeAuthorizationCode: exchangeInstagramAuthorizationCode,
      exchangeLongLivedToken: exchangeInstagramLongLivedToken,
      getAccountIdentity: getInstagramAccountIdentity,
      encryptToken: encryptSocialToken,
      upsertAccount: upsertOwnedInstagramAccount,
    });

    if (result.outcome === 'declined') {
      return sendCallbackPage(res, 'declined', 200);
    }

    return sendCallbackPage(res, 'connected', 200);
  } catch (error) {
    // No raw provider error, authorization code, state, token, account ID, or
    // Supabase error is reflected or logged. The opener receives only "error".
    const clientFailure = error instanceof InstagramOAuthFlowError &&
      ['INVALID_CALLBACK', 'INVALID_STATE', 'MISSING_REQUIRED_SCOPES', 'UNSUPPORTED_ACCOUNT_TYPE'].includes(error.code);
    return sendCallbackPage(res, 'error', clientFailure ? 400 : 500);
  }
}
