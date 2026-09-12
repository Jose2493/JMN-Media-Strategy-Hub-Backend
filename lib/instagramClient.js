// Server-side Instagram API client primitives for JMN's Social Command Center.
//
// Scope of this module (Checkpoint D3):
// - exchange an Instagram Business Login authorization code for a short-lived token
// - exchange that token for a long-lived token
// - refresh a long-lived token
// - verify the connected Instagram professional-account identity via /me
//
// This module intentionally does NOT build browser authorization URLs, consume JMN
// OAuth state, write social_accounts, encrypt tokens, or perform redirects. Those
// orchestration concerns belong to the connect/callback layer in Checkpoint D4.
//
// Security rules:
// - provider tokens / app secrets are never logged here
// - provider response bodies are never copied into thrown errors
// - request URLs containing query credentials are never copied into thrown errors
// - all provider responses are shape-validated before use
// - Instagram user IDs are accepted only as digit strings (never JS numbers)
// - every request has an AbortController timeout

export const INSTAGRAM_OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
export const INSTAGRAM_GRAPH_BASE_URL = 'https://graph.instagram.com';
export const DEFAULT_INSTAGRAM_TIMEOUT_MS = 10_000;

// Analytics-first minimum for JMN's initial Social Command Center.
export const INSTAGRAM_ANALYTICS_SCOPES = Object.freeze([
  'instagram_business_basic',
  'instagram_business_manage_insights',
]);

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TOKEN_LENGTH = 16 * 1024;
const MAX_CODE_LENGTH = 16 * 1024;
const MAX_SECRET_LENGTH = 4 * 1024;
const MAX_REDIRECT_URI_LENGTH = 2 * 1024;
const MAX_EXPIRY_SECONDS = 366 * 24 * 60 * 60;
const USER_ID_PATTERN = /^\d{1,30}$/;

const ERROR_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Invalid Instagram client input',
  TIMEOUT: 'Instagram request timed out',
  NETWORK_ERROR: 'Instagram request failed',
  PROVIDER_HTTP_ERROR: 'Instagram provider rejected request',
  INVALID_RESPONSE: 'Instagram provider returned invalid response',
  IDENTITY_MISMATCH: 'Instagram account identity did not match authorization',
});

export class InstagramClientError extends Error {
  constructor(code, { operation = 'unknown', status = null, retryable = false } = {}) {
    super(ERROR_MESSAGES[code] || 'Instagram client error');
    this.name = 'InstagramClientError';
    this.code = code;
    this.operation = operation;
    this.status = Number.isInteger(status) ? status : null;
    this.retryable = Boolean(retryable);
  }
}

function invalidInput(operation) {
  return new InstagramClientError('INVALID_INPUT', { operation });
}

function requireString(value, operation, { maxLength } = {}) {
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidInput(operation);
  }
  if (maxLength && value.length > maxLength) {
    throw invalidInput(operation);
  }
  return value;
}

function assertTimeout(timeoutMs, operation) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw invalidInput(operation);
  }
}

function assertFetch(fetchImpl, operation) {
  if (typeof fetchImpl !== 'function') {
    throw invalidInput(operation);
  }
}

function assertHttpsUrl(value, operation) {
  requireString(value, operation, { maxLength: MAX_REDIRECT_URI_LENGTH });
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw invalidInput(operation);
  }
  if (parsed.protocol !== 'https:') {
    throw invalidInput(operation);
  }
  return value;
}

export function assertInstagramUserId(value) {
  if (typeof value !== 'string' || !USER_ID_PATTERN.test(value)) {
    throw invalidInput('validate_user_id');
  }
  return value;
}

function normalizePermissions(value, operation) {
  let permissions;
  if (Array.isArray(value)) {
    permissions = value;
  } else if (typeof value === 'string') {
    permissions = value === '' ? [] : value.split(',');
  } else if (value == null) {
    return [];
  } else {
    throw new InstagramClientError('INVALID_RESPONSE', { operation });
  }

  const normalized = [];
  const seen = new Set();
  for (const permission of permissions) {
    if (typeof permission !== 'string') {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }
    const trimmed = permission.trim();
    if (!/^instagram_[a-z0-9_]{1,100}$/.test(trimmed)) {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function requireAccessToken(value, operation) {
  if (typeof value !== 'string' || value.length < 8 || value.length > MAX_TOKEN_LENGTH) {
    throw new InstagramClientError('INVALID_RESPONSE', { operation });
  }
  return value;
}

function requireExpirySeconds(value, operation) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_EXPIRY_SECONDS) {
    throw new InstagramClientError('INVALID_RESPONSE', { operation });
  }
  return value;
}

function providerStatus(response) {
  return Number.isInteger(response?.status) ? response.status : null;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

async function requestJson({ url, options, fetchImpl, timeoutMs, operation }) {
  assertFetch(fetchImpl, operation);
  assertTimeout(timeoutMs, operation);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response || typeof response.ok !== 'boolean' || typeof response.text !== 'function') {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }

    if (!response.ok) {
      const status = providerStatus(response);
      throw new InstagramClientError('PROVIDER_HTTP_ERROR', {
        operation,
        status,
        retryable: status != null && isRetryableStatus(status),
      });
    }

    const text = await response.text();
    if (typeof text !== 'string' || text.length === 0 || Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }

    return payload;
  } catch (error) {
    if (error instanceof InstagramClientError) {
      throw error;
    }
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new InstagramClientError('TIMEOUT', { operation, retryable: true });
    }
    throw new InstagramClientError('NETWORK_ERROR', { operation, retryable: true });
  } finally {
    clearTimeout(timeout);
  }
}

function extractAuthorizationRecord(payload, operation) {
  // Current Instagram Business Login documentation/examples wrap the record in
  // data[0]. A bare record is also accepted because Meta has returned that shape
  // in older/adjacent Instagram OAuth flows; both paths receive identical strict
  // field validation below. Multiple records are never accepted.
  if (Array.isArray(payload.data)) {
    if (payload.data.length !== 1 || !payload.data[0] || typeof payload.data[0] !== 'object' || Array.isArray(payload.data[0])) {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }
    return payload.data[0];
  }

  if (Object.hasOwn(payload, 'access_token') && Object.hasOwn(payload, 'user_id')) {
    return payload;
  }

  throw new InstagramClientError('INVALID_RESPONSE', { operation });
}

export async function exchangeInstagramAuthorizationCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_INSTAGRAM_TIMEOUT_MS,
} = {}) {
  const operation = 'exchange_authorization_code';

  requireString(clientId, operation, { maxLength: 128 });
  requireString(clientSecret, operation, { maxLength: MAX_SECRET_LENGTH });
  assertHttpsUrl(redirectUri, operation);
  requireString(code, operation, { maxLength: MAX_CODE_LENGTH });

  const form = new FormData();
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);
  form.set('grant_type', 'authorization_code');
  form.set('redirect_uri', redirectUri);
  form.set('code', code);

  const payload = await requestJson({
    url: INSTAGRAM_OAUTH_TOKEN_URL,
    options: {
      method: 'POST',
      body: form,
      headers: {
        Accept: 'application/json',
      },
    },
    fetchImpl,
    timeoutMs,
    operation,
  });

  const record = extractAuthorizationRecord(payload, operation);
  const accessToken = requireAccessToken(record.access_token, operation);
  const userId = assertInstagramUserIdFromProvider(record.user_id, operation);
  const permissions = normalizePermissions(record.permissions, operation);

  return Object.freeze({ accessToken, userId, permissions });
}

function assertInstagramUserIdFromProvider(value, operation) {
  if (typeof value !== 'string' || !USER_ID_PATTERN.test(value)) {
    throw new InstagramClientError('INVALID_RESPONSE', { operation });
  }
  return value;
}

export async function exchangeInstagramLongLivedToken({
  clientSecret,
  shortLivedAccessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_INSTAGRAM_TIMEOUT_MS,
} = {}) {
  const operation = 'exchange_long_lived_token';

  requireString(clientSecret, operation, { maxLength: MAX_SECRET_LENGTH });
  requireString(shortLivedAccessToken, operation, { maxLength: MAX_TOKEN_LENGTH });

  const url = new URL('/access_token', INSTAGRAM_GRAPH_BASE_URL);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('access_token', shortLivedAccessToken);

  const payload = await requestJson({
    url,
    options: {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    fetchImpl,
    timeoutMs,
    operation,
  });

  const accessToken = requireAccessToken(payload.access_token, operation);
  const expiresIn = requireExpirySeconds(payload.expires_in, operation);
  return Object.freeze({ accessToken, expiresIn });
}

export async function refreshInstagramLongLivedToken({
  accessToken,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_INSTAGRAM_TIMEOUT_MS,
} = {}) {
  const operation = 'refresh_long_lived_token';

  requireString(accessToken, operation, { maxLength: MAX_TOKEN_LENGTH });

  const url = new URL('/refresh_access_token', INSTAGRAM_GRAPH_BASE_URL);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);

  const payload = await requestJson({
    url,
    options: {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    fetchImpl,
    timeoutMs,
    operation,
  });

  const refreshedAccessToken = requireAccessToken(payload.access_token, operation);
  const expiresIn = requireExpirySeconds(payload.expires_in, operation);
  return Object.freeze({ accessToken: refreshedAccessToken, expiresIn });
}

export async function getInstagramAccountIdentity({
  accessToken,
  expectedUserId,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_INSTAGRAM_TIMEOUT_MS,
} = {}) {
  const operation = 'get_account_identity';

  requireString(accessToken, operation, { maxLength: MAX_TOKEN_LENGTH });
  if (expectedUserId !== undefined) {
    if (typeof expectedUserId !== 'string' || !USER_ID_PATTERN.test(expectedUserId)) {
      throw invalidInput(operation);
    }
  }

  const url = new URL('/me', INSTAGRAM_GRAPH_BASE_URL);
  url.searchParams.set('fields', 'user_id,username,account_type');
  url.searchParams.set('access_token', accessToken);

  const payload = await requestJson({
    url,
    options: {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    fetchImpl,
    timeoutMs,
    operation,
  });

  const userId = assertInstagramUserIdFromProvider(payload.user_id, operation);
  if (expectedUserId !== undefined && userId !== expectedUserId) {
    throw new InstagramClientError('IDENTITY_MISMATCH', { operation });
  }

  if (typeof payload.username !== 'string' || payload.username.length === 0 || payload.username.length > 100) {
    throw new InstagramClientError('INVALID_RESPONSE', { operation });
  }

  let accountType = null;
  if (payload.account_type !== undefined && payload.account_type !== null) {
    if (typeof payload.account_type !== 'string' || payload.account_type.length === 0 || payload.account_type.length > 64) {
      throw new InstagramClientError('INVALID_RESPONSE', { operation });
    }
    accountType = payload.account_type;
  }

  return Object.freeze({ userId, username: payload.username, accountType });
}
