import crypto from 'crypto';
import {
  INSTAGRAM_ANALYTICS_SCOPES,
} from './instagramClient.js';

export const INSTAGRAM_AUTHORIZATION_URL = 'https://www.instagram.com/oauth/authorize';

const APP_ID_PATTERN = /^\d{1,30}$/;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_CODE_LENGTH = 16 * 1024;
const MAX_PROVIDER_ERROR_LENGTH = 256;
const PROFESSIONAL_ACCOUNT_TYPES = new Set(['BUSINESS', 'MEDIA_CREATOR']);

export class InstagramOAuthFlowError extends Error {
  constructor(code = 'FLOW_FAILED') {
    super('Instagram connection failed');
    this.name = 'InstagramOAuthFlowError';
    this.code = code;
  }
}

function fail(code) {
  throw new InstagramOAuthFlowError(code);
}

function requireHttpsUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    fail('CONFIGURATION');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('CONFIGURATION');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
    fail('CONFIGURATION');
  }
  return parsed.toString();
}

function scalarQueryValue(value, { required = false, maxLength = 1024 } = {}) {
  if (Array.isArray(value)) fail('INVALID_CALLBACK');
  if (value === undefined || value === null || value === '') {
    if (required) fail('INVALID_CALLBACK');
    return null;
  }
  if (typeof value !== 'string' || value.length > maxLength) {
    fail('INVALID_CALLBACK');
  }
  return value;
}

function assertStateShape(state) {
  if (typeof state !== 'string' || !STATE_PATTERN.test(state)) {
    fail('INVALID_CALLBACK');
  }
}

function normalizeRequestedScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) fail('CONFIGURATION');
  const unique = [];
  const seen = new Set();
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !/^instagram_[a-z0-9_]{1,100}$/.test(scope)) {
      fail('CONFIGURATION');
    }
    if (!seen.has(scope)) {
      seen.add(scope);
      unique.push(scope);
    }
  }
  return unique;
}

export function buildInstagramAuthorizationUrl({
  clientId,
  redirectUri,
  state,
  scopes = INSTAGRAM_ANALYTICS_SCOPES,
} = {}) {
  if (typeof clientId !== 'string' || !APP_ID_PATTERN.test(clientId)) {
    fail('CONFIGURATION');
  }
  const normalizedRedirectUri = requireHttpsUrl(redirectUri);
  assertStateShape(state);
  const normalizedScopes = normalizeRequestedScopes(scopes);

  const url = new URL(INSTAGRAM_AUTHORIZATION_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', normalizedRedirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', normalizedScopes.join(','));
  url.searchParams.set('state', state);

  // Deliberately omit optional/unstable Meta flags (for example force_reauth
  // variants) until the actual JMN Meta App dashboard-generated Business Login
  // URL is verified. The core OAuth fields above are sufficient and stable.
  return url.toString();
}

export function parseInstagramCallbackQuery(query = {}) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) {
    fail('INVALID_CALLBACK');
  }

  const state = scalarQueryValue(query.state, { required: true, maxLength: 128 });
  assertStateShape(state);
  const code = scalarQueryValue(query.code, { maxLength: MAX_CODE_LENGTH });
  const providerError = scalarQueryValue(query.error, { maxLength: MAX_PROVIDER_ERROR_LENGTH });

  // Exactly one provider outcome must be present. This check intentionally
  // happens before state consumption, so malformed both/neither callbacks do
  // not burn a legitimate state value.
  if (Boolean(code) === Boolean(providerError)) {
    fail('INVALID_CALLBACK');
  }

  if (providerError) {
    return Object.freeze({ kind: 'declined', state });
  }

  return Object.freeze({ kind: 'code', state, code });
}

function assertGrantedScopes(grantedScopes, requiredScopes) {
  if (!Array.isArray(grantedScopes)) fail('INVALID_PROVIDER_RESPONSE');
  const granted = new Set(grantedScopes);
  for (const required of requiredScopes) {
    if (!granted.has(required)) {
      fail('MISSING_REQUIRED_SCOPES');
    }
  }
}

function assertProfessionalIdentity(identity, expectedUserId) {
  if (!identity || typeof identity !== 'object') fail('INVALID_PROVIDER_RESPONSE');
  if (identity.userId !== expectedUserId) fail('IDENTITY_MISMATCH');
  if (typeof identity.username !== 'string' || identity.username.length === 0) {
    fail('INVALID_PROVIDER_RESPONSE');
  }
  if (!PROFESSIONAL_ACCOUNT_TYPES.has(identity.accountType)) {
    fail('UNSUPPORTED_ACCOUNT_TYPE');
  }
}

function computeExpiry(nowMs, expiresIn) {
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) fail('INTERNAL');
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) fail('INVALID_PROVIDER_RESPONSE');
  const expiresAtMs = nowMs + expiresIn * 1000;
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs) fail('INVALID_PROVIDER_RESPONSE');
  return new Date(expiresAtMs).toISOString();
}

export async function completeInstagramOAuthCallback({
  query,
  clientId,
  clientSecret,
  redirectUri,
  requiredScopes = INSTAGRAM_ANALYTICS_SCOPES,
  nowMs = Date.now(),
  consumeState,
  exchangeAuthorizationCode,
  exchangeLongLivedToken,
  getAccountIdentity,
  encryptToken,
  upsertAccount,
} = {}) {
  const parsed = parseInstagramCallbackQuery(query);
  const scopes = normalizeRequestedScopes(requiredScopes);

  for (const dependency of [
    consumeState,
    exchangeAuthorizationCode,
    exchangeLongLivedToken,
    getAccountIdentity,
    encryptToken,
    upsertAccount,
  ]) {
    if (typeof dependency !== 'function') fail('CONFIGURATION');
  }

  // State is consumed before provider HTTP work and before any provider ID is
  // trusted. company/contact identity is therefore resolved only from JMN's DB.
  let trusted;
  try {
    trusted = await consumeState({ rawState: parsed.state, platform: 'instagram' });
  } catch {
    fail('INVALID_STATE');
  }

  if (!trusted || typeof trusted.companyId !== 'string' || typeof trusted.contactId !== 'string') {
    fail('INVALID_STATE');
  }

  // Provider decline/error still consumes a valid state, preventing replay.
  // Provider error strings are intentionally ignored and never surfaced.
  if (parsed.kind === 'declined') {
    return Object.freeze({ outcome: 'declined' });
  }

  let shortLived;
  try {
    shortLived = await exchangeAuthorizationCode({
      clientId,
      clientSecret,
      redirectUri,
      code: parsed.code,
    });
  } catch {
    fail('PROVIDER_EXCHANGE_FAILED');
  }

  if (!shortLived || typeof shortLived.accessToken !== 'string' || typeof shortLived.userId !== 'string') {
    fail('INVALID_PROVIDER_RESPONSE');
  }
  assertGrantedScopes(shortLived.permissions, scopes);

  let longLived;
  try {
    longLived = await exchangeLongLivedToken({
      clientSecret,
      shortLivedAccessToken: shortLived.accessToken,
    });
  } catch {
    fail('PROVIDER_EXCHANGE_FAILED');
  }

  if (!longLived || typeof longLived.accessToken !== 'string') {
    fail('INVALID_PROVIDER_RESPONSE');
  }

  let identity;
  try {
    identity = await getAccountIdentity({
      accessToken: longLived.accessToken,
      expectedUserId: shortLived.userId,
    });
  } catch {
    fail('IDENTITY_MISMATCH');
  }
  assertProfessionalIdentity(identity, shortLived.userId);

  const context = Object.freeze({
    companyId: trusted.companyId,
    platform: 'instagram',
    externalAccountId: shortLived.userId,
  });

  let encryptedToken;
  try {
    encryptedToken = encryptToken(longLived.accessToken, context);
  } catch {
    fail('TOKEN_ENCRYPTION_FAILED');
  }

  const tokenExpiresAt = computeExpiry(nowMs, longLived.expiresIn);

  try {
    await upsertAccount({
      companyId: trusted.companyId,
      contactId: trusted.contactId,
      externalAccountId: shortLived.userId,
      username: identity.username,
      displayName: identity.username,
      accountType: identity.accountType,
      encryptedToken,
      tokenExpiresAt,
      scopes: shortLived.permissions,
    });
  } catch {
    fail('ACCOUNT_OWNERSHIP_DENIED');
  }

  return Object.freeze({ outcome: 'connected' });
}

export function validatePostMessageOrigin(value) {
  const normalized = requireHttpsUrl(value);
  const parsed = new URL(normalized);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    fail('CONFIGURATION');
  }
  return parsed.origin;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildInstagramCallbackPage({ outcome, allowedOrigin } = {}) {
  if (!['connected', 'declined', 'error'].includes(outcome)) fail('INTERNAL');
  const origin = validatePostMessageOrigin(allowedOrigin);
  const nonce = crypto.randomBytes(18).toString('base64');
  const safeOriginForScript = JSON.stringify(origin).replaceAll('<', '\\u003c');
  const safeOutcomeForScript = JSON.stringify(outcome);
  const title = outcome === 'connected'
    ? 'Instagram connected'
    : outcome === 'declined'
      ? 'Instagram connection cancelled'
      : 'Instagram connection failed';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style nonce="${nonce}">body{font-family:system-ui,-apple-system,sans-serif;background:#0d0d0d;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:520px;padding:32px;text-align:center}p{color:#bdbdbd}</style>
</head>
<body>
<main><h1>${escapeHtml(title)}</h1><p>You can close this window and return to JMN.</p></main>
<script nonce="${nonce}">
(() => {
  try { history.replaceState({}, document.title, location.pathname); } catch {}
  const message = { type: 'jmn:social-connect', platform: 'instagram', result: ${safeOutcomeForScript} };
  try {
    if (window.opener) {
      window.opener.postMessage(message, ${safeOriginForScript});
      window.close();
    }
  } catch {}
})();
</script>
</body>
</html>`;

  return Object.freeze({ html, nonce });
}
