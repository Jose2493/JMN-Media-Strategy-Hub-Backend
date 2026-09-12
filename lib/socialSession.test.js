import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  SocialSessionError,
  verifySocialSessionAuthorizationHeader,
} from './socialSession.js';

const SECRET = 'synthetic-session-secret-at-least-32-bytes-long';
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';

function makeToken(payload = {}, options = {}) {
  return jwt.sign(
    { companyId: COMPANY_ID, contactId: CONTACT_ID, ...payload },
    SECRET,
    { expiresIn: '30m', algorithm: 'HS256', ...options }
  );
}

test('strict Bearer HS256 session resolves only trusted company/contact UUID claims', () => {
  const token = makeToken();
  assert.deepEqual(
    verifySocialSessionAuthorizationHeader(`Bearer ${token}`, SECRET),
    { companyId: COMPANY_ID, contactId: CONTACT_ID }
  );
});

test('missing, malformed, or loose Authorization formats are rejected', () => {
  const token = makeToken();
  for (const value of [
    '',
    token,
    `bearer ${token}`,
    `Bearer  ${token}`,
    `Bearer ${token} extra`,
    'Basic abc',
  ]) {
    assert.throws(
      () => verifySocialSessionAuthorizationHeader(value, SECRET),
      SocialSessionError
    );
  }
});

test('wrong secret and expired token are rejected generically', () => {
  const token = makeToken();
  assert.throws(
    () => verifySocialSessionAuthorizationHeader(`Bearer ${token}`, 'wrong-secret-that-is-long-enough'),
    SocialSessionError
  );

  const expired = jwt.sign(
    { companyId: COMPANY_ID, contactId: CONTACT_ID },
    SECRET,
    { algorithm: 'HS256', expiresIn: -1 }
  );
  assert.throws(
    () => verifySocialSessionAuthorizationHeader(`Bearer ${expired}`, SECRET),
    SocialSessionError
  );
});

test('non-HS256 token is rejected even with the same secret', () => {
  const token = jwt.sign(
    { companyId: COMPANY_ID, contactId: CONTACT_ID },
    SECRET,
    { algorithm: 'HS384', expiresIn: '30m' }
  );
  assert.throws(
    () => verifySocialSessionAuthorizationHeader(`Bearer ${token}`, SECRET),
    SocialSessionError
  );
});

test('malformed or missing identity claims are rejected', () => {
  for (const payload of [
    { companyId: 'not-a-uuid' },
    { contactId: 'not-a-uuid' },
    { companyId: null },
    { contactId: null },
  ]) {
    const token = makeToken(payload);
    assert.throws(
      () => verifySocialSessionAuthorizationHeader(`Bearer ${token}`, SECRET),
      SocialSessionError
    );
  }
});

test('missing or too-short configured session secret fails closed', () => {
  const token = makeToken();
  assert.throws(
    () => verifySocialSessionAuthorizationHeader(`Bearer ${token}`, ''),
    SocialSessionError
  );
  assert.throws(
    () => verifySocialSessionAuthorizationHeader(`Bearer ${token}`, 'short'),
    SocialSessionError
  );
});
