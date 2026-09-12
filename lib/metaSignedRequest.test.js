import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  MetaSignedRequestError,
  extractMetaSignedRequest,
  verifyMetaSignedRequest,
  createMetaDeletionConfirmation,
  verifyMetaDeletionConfirmation,
} from './metaSignedRequest.js';

const SECRET = 'synthetic-meta-secret-at-least-32-bytes';
const USER_ID = '17841400000000001';

function signPayload(payload, secret = SECRET) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encodedPayload, 'utf8').digest('base64url');
  return `${signature}.${encodedPayload}`;
}

test('verifies canonical HMAC-SHA256 signed_request', () => {
  const signed = signPayload({ algorithm: 'HMAC-SHA256', user_id: USER_ID, issued_at: 1800000000 });
  assert.deepEqual(verifyMetaSignedRequest(signed, SECRET), { userId: USER_ID });
});

test('rejects tampered signed_request', () => {
  const signed = signPayload({ algorithm: 'HMAC-SHA256', user_id: USER_ID });
  const [signature, payload] = signed.split('.');
  assert.throws(
    () => verifyMetaSignedRequest(`${signature}.${payload.slice(0, -1)}A`, SECRET),
    MetaSignedRequestError
  );
});

test('rejects wrong algorithm and numeric user IDs', () => {
  assert.throws(
    () => verifyMetaSignedRequest(signPayload({ algorithm: 'HMAC-SHA1', user_id: USER_ID }), SECRET),
    MetaSignedRequestError
  );
  assert.throws(
    () => verifyMetaSignedRequest(signPayload({ algorithm: 'HMAC-SHA256', user_id: 17841400000000001 }), SECRET),
    MetaSignedRequestError
  );
});

test('extracts exactly one form signed_request', () => {
  const signed = signPayload({ algorithm: 'HMAC-SHA256', user_id: USER_ID });
  assert.equal(extractMetaSignedRequest({ signed_request: signed }), signed);
  assert.equal(extractMetaSignedRequest(`signed_request=${encodeURIComponent(signed)}`), signed);
  assert.throws(
    () => extractMetaSignedRequest(`signed_request=${encodeURIComponent(signed)}&signed_request=${encodeURIComponent(signed)}`),
    MetaSignedRequestError
  );
});

test('deletion confirmation is opaque, signed, and tamper resistant', () => {
  const code = createMetaDeletionConfirmation({ userId: USER_ID, appSecret: SECRET, nowMs: 1_800_000_000_000 });
  assert.equal(code.includes(USER_ID), false);
  assert.equal(verifyMetaDeletionConfirmation(code, SECRET, { nowMs: 1_800_000_100_000 }), true);

  const tampered = `${code.slice(0, -1)}${code.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () => verifyMetaDeletionConfirmation(tampered, SECRET, { nowMs: 1_800_000_100_000 }),
    MetaSignedRequestError
  );
});
