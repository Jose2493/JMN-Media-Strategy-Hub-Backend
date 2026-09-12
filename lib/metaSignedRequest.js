import crypto from 'crypto';

const MAX_SIGNED_REQUEST_LENGTH = 32 * 1024;
const MAX_APP_SECRET_LENGTH = 4096;
const MAX_STATUS_CODE_LENGTH = 4096;
const USER_ID_PATTERN = /^\d{1,30}$/;

export class MetaSignedRequestError extends Error {
  constructor(code = 'INVALID_REQUEST') {
    super('Invalid Meta signed request');
    this.name = 'MetaSignedRequestError';
    this.code = code;
  }
}

function fail(code = 'INVALID_REQUEST') {
  throw new MetaSignedRequestError(code);
}

function requireAppSecret(appSecret) {
  if (typeof appSecret !== 'string' || appSecret.length < 8 || appSecret.length > MAX_APP_SECRET_LENGTH) {
    fail('CONFIGURATION');
  }
  return appSecret;
}

function decodeBase64Url(value, { maxBytes = 16 * 1024 } = {}) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    fail();
  }
  if (value.length % 4 === 1) fail();

  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  let decoded;
  try {
    decoded = Buffer.from(padded, 'base64');
  } catch {
    fail();
  }
  if (decoded.length === 0 || decoded.length > maxBytes) fail();

  // Reject non-canonical encodings so alternate textual representations cannot
  // bypass comparisons or create ambiguous audit/debug behavior.
  if (decoded.toString('base64url') !== value) fail();
  return decoded;
}

function parseSignedPayload(encodedPayload) {
  const raw = decodeBase64Url(encodedPayload);
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    fail();
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail();
  return payload;
}

export function extractMetaSignedRequest(body) {
  if (body && typeof body === 'object' && !Array.isArray(body) && !Buffer.isBuffer(body)) {
    const value = body.signed_request;
    if (Array.isArray(value) || typeof value !== 'string') fail();
    return value;
  }

  if (Buffer.isBuffer(body)) {
    if (body.length > MAX_SIGNED_REQUEST_LENGTH * 2) fail();
    body = body.toString('utf8');
  }

  if (typeof body === 'string') {
    if (body.length > MAX_SIGNED_REQUEST_LENGTH * 2) fail();
    const params = new URLSearchParams(body);
    const values = params.getAll('signed_request');
    if (values.length !== 1) fail();
    return values[0];
  }

  fail();
}

export function verifyMetaSignedRequest(signedRequest, appSecret) {
  requireAppSecret(appSecret);
  if (typeof signedRequest !== 'string' || signedRequest.length === 0 || signedRequest.length > MAX_SIGNED_REQUEST_LENGTH) {
    fail();
  }

  const parts = signedRequest.split('.');
  if (parts.length !== 2) fail();
  const [encodedSignature, encodedPayload] = parts;

  const signature = decodeBase64Url(encodedSignature, { maxBytes: 64 });
  if (signature.length !== 32) fail();

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(encodedPayload, 'utf8')
    .digest();

  if (!crypto.timingSafeEqual(signature, expected)) fail('INVALID_SIGNATURE');

  const payload = parseSignedPayload(encodedPayload);
  if (payload.algorithm !== 'HMAC-SHA256') fail('INVALID_ALGORITHM');
  if (typeof payload.user_id !== 'string' || !USER_ID_PATTERN.test(payload.user_id)) fail('INVALID_USER_ID');

  return Object.freeze({ userId: payload.user_id });
}

function signOpaquePayload(encodedPayload, appSecret) {
  return crypto
    .createHmac('sha256', requireAppSecret(appSecret))
    .update(encodedPayload, 'utf8')
    .digest('base64url');
}

export function createMetaDeletionConfirmation({ userId, appSecret, nowMs = Date.now() } = {}) {
  if (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId)) fail('INVALID_USER_ID');
  requireAppSecret(appSecret);
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) fail('INVALID_TIME');

  const subjectHash = crypto.createHash('sha256').update(`instagram:${userId}`, 'utf8').digest('base64url');
  const payload = {
    v: 1,
    iat: Math.floor(nowMs / 1000),
    nonce: crypto.randomBytes(16).toString('base64url'),
    sub: subjectHash,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signOpaquePayload(encodedPayload, appSecret);
  return `${encodedPayload}.${signature}`;
}

export function verifyMetaDeletionConfirmation(code, appSecret, { nowMs = Date.now() } = {}) {
  requireAppSecret(appSecret);
  if (typeof code !== 'string' || code.length === 0 || code.length > MAX_STATUS_CODE_LENGTH) fail();
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) fail('INVALID_TIME');

  const parts = code.split('.');
  if (parts.length !== 2) fail();
  const [encodedPayload, encodedSignature] = parts;
  const signature = decodeBase64Url(encodedSignature, { maxBytes: 64 });
  if (signature.length !== 32) fail();
  const expected = Buffer.from(signOpaquePayload(encodedPayload, appSecret), 'base64url');
  if (!crypto.timingSafeEqual(signature, expected)) fail('INVALID_SIGNATURE');

  const payload = parseSignedPayload(encodedPayload);
  if (payload.v !== 1) fail();
  if (!Number.isSafeInteger(payload.iat) || payload.iat <= 0) fail();
  if (payload.iat > Math.floor(nowMs / 1000) + 300) fail();
  if (typeof payload.nonce !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(payload.nonce)) fail();
  if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.sub)) fail();

  return true;
}
