// Tests for lib/socialTokenCrypto.js. Uses Node's built-in test runner
// (node:test) and assert -- no new dependency, matches this repo having no
// existing test framework to defer to. Run with: node --test
//
// Every test uses a synthetic fake token string and a synthetic ownership
// context (company id / platform / external account id). Nothing here is a
// real Instagram/Meta credential or a real JMN company/account.

import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptSocialToken,
  decryptSocialToken,
  SocialTokenCryptoError,
  CURRENT_KEY_VERSION,
  CURRENT_AAD_VERSION,
} from './socialTokenCrypto.js';

const ENV_VAR = 'SOCIAL_TOKEN_ENCRYPTION_KEY';
const ORIGINAL_ENV_VALUE = process.env[ENV_VAR];

function randomBase64Key(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64');
}

// Fresh random 32-byte test key before every test -- generated in-memory,
// never written to any file, never the real production key (which is not
// created as part of this checkpoint at all).
beforeEach(() => {
  process.env[ENV_VAR] = randomBase64Key(32);
});

after(() => {
  if (ORIGINAL_ENV_VALUE === undefined) {
    delete process.env[ENV_VAR];
  } else {
    process.env[ENV_VAR] = ORIGINAL_ENV_VALUE;
  }
});

const FAKE_TOKEN = 'FAKE_IG_TOKEN_do_not_log_1234567890abcdefXYZ';

// Synthetic ownership context standing in for a real social_accounts row.
// encryptSocialToken/decryptSocialToken bind the ciphertext to exactly these
// three fields via AES-GCM AAD. None of these are real JMN/Meta identifiers.
const TEST_CONTEXT = {
  companyId: '11111111-1111-4111-8111-111111111111',
  platform: 'instagram',
  externalAccountId: '17841400000000001',
};

// A second synthetic company, for the "copied ciphertext row onto a
// different account" tests below.
const OTHER_CONTEXT = {
  companyId: '22222222-2222-4222-8222-222222222222',
  platform: 'instagram',
  externalAccountId: '17841400000000001',
};

// 1. Normal encrypt -> decrypt round trip returns the exact original token.
test('round trip returns the exact original token', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const decrypted = decryptSocialToken(encrypted, TEST_CONTEXT);
  assert.equal(decrypted, FAKE_TOKEN);
});

// 2. Encrypting the same token twice produces different ciphertext/IV.
test('encrypting the same token twice produces different ciphertext and IV', () => {
  const first = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const second = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  // Both must still independently decrypt correctly.
  assert.equal(decryptSocialToken(first, TEST_CONTEXT), FAKE_TOKEN);
  assert.equal(decryptSocialToken(second, TEST_CONTEXT), FAKE_TOKEN);
});

// 3. Tampered ciphertext fails.
test('tampered ciphertext fails to decrypt', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const bytes = Buffer.from(encrypted.ciphertext, 'base64');
  bytes[0] ^= 0xff; // flip a byte
  const tampered = { ...encrypted, ciphertext: bytes.toString('base64') };
  assert.throws(() => decryptSocialToken(tampered, TEST_CONTEXT), SocialTokenCryptoError);
});

// 4. Tampered auth tag fails.
test('tampered auth tag fails to decrypt', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const bytes = Buffer.from(encrypted.authTag, 'base64');
  bytes[0] ^= 0xff;
  const tampered = { ...encrypted, authTag: bytes.toString('base64') };
  assert.throws(() => decryptSocialToken(tampered, TEST_CONTEXT), SocialTokenCryptoError);
});

// 5. Wrong encryption key fails.
test('decrypting with a different key than it was encrypted with fails', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  // Swap in a different random key after encrypting.
  process.env[ENV_VAR] = randomBase64Key(32);
  assert.throws(() => decryptSocialToken(encrypted, TEST_CONTEXT), SocialTokenCryptoError);
});

// 6. Unsupported key version fails.
test('unsupported key version is rejected', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const wrongVersion = { ...encrypted, keyVersion: CURRENT_KEY_VERSION + 1 };
  assert.throws(() => decryptSocialToken(wrongVersion, TEST_CONTEXT), SocialTokenCryptoError);
});

// 7. Empty/missing token is rejected.
test('empty, missing, or non-string token is rejected on encrypt', () => {
  assert.throws(() => encryptSocialToken('', TEST_CONTEXT), SocialTokenCryptoError);
  assert.throws(() => encryptSocialToken(undefined, TEST_CONTEXT), SocialTokenCryptoError);
  assert.throws(() => encryptSocialToken(null, TEST_CONTEXT), SocialTokenCryptoError);
});

// 8. Invalid production key length is rejected.
test('a key that does not decode to exactly 32 bytes is rejected, fail closed', () => {
  process.env[ENV_VAR] = randomBase64Key(16); // wrong length on purpose
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT), SocialTokenCryptoError);
});

// 9. Plaintext token does not appear in serialized encrypted output.
test('serialized encrypted output never contains the plaintext token', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const serialized = JSON.stringify(encrypted);
  assert.equal(serialized.includes(FAKE_TOKEN), false);
});

// 10. Errors/log output do not expose plaintext token material.
test('thrown errors and anything logged during a failure never expose the plaintext token', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const bytes = Buffer.from(encrypted.ciphertext, 'base64');
  bytes[0] ^= 0xff;
  const tampered = { ...encrypted, ciphertext: bytes.toString('base64') };

  const loggedLines = [];
  const originalConsoleError = console.error;
  console.error = (...args) => {
    loggedLines.push(args.map(String).join(' '));
  };

  let caught;
  try {
    try {
      decryptSocialToken(tampered, TEST_CONTEXT);
    } catch (err) {
      caught = err;
      // Simulate a caller that logs the caught error, including its stack --
      // proving that even careless logging of the whole error object still
      // exposes nothing, since the error never carried token material.
      console.error('decryption failed:', err, err.stack);
    }
  } finally {
    console.error = originalConsoleError;
  }

  assert.ok(caught instanceof SocialTokenCryptoError);
  assert.equal(caught.message.includes(FAKE_TOKEN), false);
  assert.equal(caught.stack.includes(FAKE_TOKEN), false);
  for (const line of loggedLines) {
    assert.equal(line.includes(FAKE_TOKEN), false);
  }
});

// ---------------------------------------------------------------------
// Hardening pass: structural rejection tests added after Checkpoint B
// review. These prove getKeyForVersion() now requires syntactically valid,
// canonical base64 for the production key -- not just "decodes to 32
// bytes" -- and that ciphertext/iv/authTag get the same strict treatment.
// Tests 1-10 above are otherwise unchanged; they now pass TEST_CONTEXT
// because the later AAD-binding pass made context a required parameter.
// ---------------------------------------------------------------------

// 11. Malformed base64 production key is rejected even if Node's permissive
// decoder could otherwise produce 32 bytes from it.
test('malformed base64 key is rejected even when it still decodes to 32 bytes', () => {
  const validKeyB64 = randomBase64Key(32);
  // Buffer.from(..., 'base64') ignores characters outside the base64
  // alphabet -- appending garbage after a complete, validly-padded base64
  // string makes Node decode exactly the same 32 bytes as the clean
  // string, while the string itself is not valid base64 and does not
  // round-trip. A length-only check would incorrectly accept this.
  const malformedKey = validKeyB64 + '!!!not-base64!!!';
  assert.equal(Buffer.from(malformedKey, 'base64').length, 32, 'test setup assumption: Node still decodes 32 bytes from this malformed string');

  process.env[ENV_VAR] = malformedKey;
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT), SocialTokenCryptoError);
});

// 12. Missing encryption environment variable is rejected.
test('missing encryption environment variable is rejected', () => {
  delete process.env[ENV_VAR];
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT), SocialTokenCryptoError);
});

// 13. Malformed base64 ciphertext is rejected.
test('malformed base64 ciphertext is rejected', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const tampered = { ...encrypted, ciphertext: encrypted.ciphertext + '!!!not-base64!!!' };
  assert.throws(() => decryptSocialToken(tampered, TEST_CONTEXT), SocialTokenCryptoError);
});

// 14. Invalid IV length is rejected (syntactically valid base64, wrong byte length).
test('IV that decodes to the wrong length is rejected', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const wrongLengthIv = crypto.randomBytes(10).toString('base64'); // valid base64, wrong length (not 12)
  const tampered = { ...encrypted, iv: wrongLengthIv };
  assert.throws(() => decryptSocialToken(tampered, TEST_CONTEXT), SocialTokenCryptoError);
});

// 15. Invalid auth tag length is rejected (syntactically valid base64, wrong byte length).
test('auth tag that decodes to the wrong length is rejected', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const wrongLengthTag = crypto.randomBytes(8).toString('base64'); // valid base64, wrong length (not 16)
  const tampered = { ...encrypted, authTag: wrongLengthTag };
  assert.throws(() => decryptSocialToken(tampered, TEST_CONTEXT), SocialTokenCryptoError);
});

// 16. Excessively/non-canonically padded base64 key is rejected even though
// it still decodes to exactly 32 bytes. decodeBase64Strict() now requires
// the supplied value to equal Node's own canonical re-encoding of its
// decoded bytes, not just decode to the same bytes after stripping `=`.
test('excessively padded base64 key is rejected even when it still decodes to 32 bytes', () => {
  const validKeyB64 = randomBase64Key(32);
  const overPaddedKey = validKeyB64 + '='; // one extra `=` beyond canonical padding
  assert.equal(Buffer.from(overPaddedKey, 'base64').length, 32, 'test setup assumption: Node still decodes 32 bytes with the extra padding');
  assert.notEqual(Buffer.from(overPaddedKey, 'base64').toString('base64'), overPaddedKey, 'test setup assumption: the over-padded string is not canonical');

  process.env[ENV_VAR] = overPaddedKey;
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT), SocialTokenCryptoError);
});

// ---------------------------------------------------------------------
// AAD-binding pass: encryptSocialToken/decryptSocialToken now require a
// { companyId, platform, externalAccountId } context and bind the
// ciphertext to it via AES-GCM Additional Authenticated Data, so a
// { ciphertext, iv, authTag, keyVersion } package copied onto a different
// social_accounts row fails to decrypt even with the correct key. Tests
// 1-16 above are functionally unchanged; they were only updated to pass
// TEST_CONTEXT, which this pass made a required parameter.
// ---------------------------------------------------------------------

// 17. Normal encrypt/decrypt with matching AAD context still round-trips.
test('round trip with matching AAD context still returns the exact original token', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  // A freshly-constructed object with the same field values (not the same
  // object reference) -- proves the match is by value, as it will be in
  // production when the context is rebuilt from a database row each time.
  const decrypted = decryptSocialToken(encrypted, { ...TEST_CONTEXT });
  assert.equal(decrypted, FAKE_TOKEN);
});

// 18. Same encrypted package, different companyId, fails. This is the "moved
// to the wrong company" case.
test('decrypting with a different companyId in context fails', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const wrongContext = { ...TEST_CONTEXT, companyId: OTHER_CONTEXT.companyId };
  assert.throws(() => decryptSocialToken(encrypted, wrongContext), SocialTokenCryptoError);
});

// 19. Same encrypted package, different platform, fails.
test('decrypting with a different platform in context fails', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const wrongContext = { ...TEST_CONTEXT, platform: 'facebook' };
  assert.throws(() => decryptSocialToken(encrypted, wrongContext), SocialTokenCryptoError);
});

// 20. Same encrypted package, different externalAccountId, fails. This is
// the exact "ciphertext copied onto a sibling social_accounts row" scenario
// the AAD binding exists to close off.
test('decrypting with a different externalAccountId in context fails', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const wrongContext = { ...TEST_CONTEXT, externalAccountId: '17841400000000002' };
  assert.throws(() => decryptSocialToken(encrypted, wrongContext), SocialTokenCryptoError);
});

// 21. Missing or malformed context is rejected on both encrypt and decrypt,
// checked independently per required field.
test('missing or malformed context is rejected', () => {
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, undefined), SocialTokenCryptoError);
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, {}), SocialTokenCryptoError);
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, { ...TEST_CONTEXT, companyId: '' }), SocialTokenCryptoError);
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, { ...TEST_CONTEXT, platform: 123 }), SocialTokenCryptoError);
  assert.throws(() => encryptSocialToken(FAKE_TOKEN, { ...TEST_CONTEXT, externalAccountId: null }), SocialTokenCryptoError);

  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  assert.throws(() => decryptSocialToken(encrypted, undefined), SocialTokenCryptoError);
  assert.throws(() => decryptSocialToken(encrypted, { ...TEST_CONTEXT, externalAccountId: '' }), SocialTokenCryptoError);
});

// 22. AAD context values never leak into the serialized encrypted output --
// they are reconstructed from the social_accounts row at use time and are
// never stored alongside the ciphertext. Only the numeric aadVersion is
// persisted (not the context itself).
test('AAD context values do not appear in the serialized encrypted output', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const serialized = JSON.stringify(encrypted);
  assert.equal(serialized.includes(TEST_CONTEXT.companyId), false);
  assert.equal(serialized.includes(TEST_CONTEXT.platform), false);
  assert.equal(serialized.includes(TEST_CONTEXT.externalAccountId), false);
  assert.deepEqual(Object.keys(encrypted).sort(), ['aadVersion', 'authTag', 'ciphertext', 'iv', 'keyVersion'].sort());
});

// ---------------------------------------------------------------------
// AAD-versioning pass: aadVersion is now a persisted, required field on the
// encrypted package (separate from keyVersion), so a future AAD format
// change can coexist with tokens already authenticated under an older
// version instead of becoming silently undecryptable.
// ---------------------------------------------------------------------

// 23. Encrypted output records the current AAD version.
test('encrypted output contains the current AAD version', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  assert.equal(encrypted.aadVersion, CURRENT_AAD_VERSION);
  assert.equal(Number.isInteger(encrypted.aadVersion), true);
});

// 24. A persisted aadVersion matching what the token was actually encrypted
// under decrypts normally (the ordinary case once this is stored in
// social_accounts.token_aad_version).
test('matching persisted AAD version decrypts normally', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  // Simulate reading keyVersion/aadVersion back from a DB row rather than
  // reusing the in-memory object, to prove this isn't relying on reference
  // identity or a field decrypt doesn't actually look at.
  const fromRow = {
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    aadVersion: encrypted.aadVersion,
  };
  assert.equal(decryptSocialToken(fromRow, TEST_CONTEXT), FAKE_TOKEN);
});

// 25. Missing AAD version is rejected outright -- never silently assumed to
// be version 1, even though 1 is currently the only version that exists.
test('missing AAD version is rejected', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const { aadVersion, ...withoutAadVersion } = encrypted;
  assert.throws(() => decryptSocialToken(withoutAadVersion, TEST_CONTEXT), SocialTokenCryptoError);
});

// 26. An unsupported AAD version fails closed (no builder registered for it).
test('unsupported AAD version is rejected', () => {
  const encrypted = encryptSocialToken(FAKE_TOKEN, TEST_CONTEXT);
  const futureVersion = { ...encrypted, aadVersion: CURRENT_AAD_VERSION + 1 };
  assert.throws(() => decryptSocialToken(futureVersion, TEST_CONTEXT), SocialTokenCryptoError);
});