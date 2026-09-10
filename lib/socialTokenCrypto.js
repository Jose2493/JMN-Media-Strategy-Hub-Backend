// AES-256-GCM encrypt/decrypt for provider (Instagram, and later Facebook/

// TikTok/LinkedIn) access tokens. Pure crypto helper -- no Supabase, no HTTP,

// no knowledge of `social_accounts` or any other table beyond the plain

// { companyId, platform, externalAccountId } identifiers the caller passes

// in. It only turns a plaintext token into encrypted material and back.

//

// This is reversible ENCRYPTION, not hashing, on purpose: unlike the

// bootstrap-token pattern used elsewhere in this repo (where only a SHA-256

// hash is ever stored, because the raw value is never needed again), the

// backend genuinely needs the real provider token back later to call

// Instagram's API on the company's behalf. Hashing would make that

// impossible; encryption at rest is the correct tool here.

//

// Every token is bound to its owning account via AES-GCM Additional

// Authenticated Data (AAD) -- see buildAADv1()/buildAAD() below. This is what

// prevents a structurally valid { ciphertext, iv, authTag, keyVersion,

// aadVersion } package from one social_accounts row being copied onto a

// different row (whether by a bug, a bad migration, or a compromised write

// path) and still decrypting: GCM authentication fails unless the AAD

// reconstructed at decrypt time matches the AAD supplied at encrypt time

// exactly. aadVersion is persisted per-token (never assumed) so the AAD

// format itself can change later without breaking already-encrypted tokens.

//

// Key material lives ONLY in an environment variable, never in this repo.

// See getKeyForVersion() below for the exact validation/fail-closed rules.

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

const IV_LENGTH_BYTES = 12;        // standard/recommended GCM nonce size

const KEY_LENGTH_BYTES = 32;       // AES-256

const AUTH_TAG_LENGTH_BYTES = 16;  // GCM default

// Maps a keyVersion to the env var holding that version's key material

// (expected: base64-encoded, decoding to exactly 32 raw bytes). A real key

// rotation adds a new entry here (e.g. `2: 'SOCIAL_TOKEN_ENCRYPTION_KEY_V2'`)

// -- an existing version number is never repurposed for different key

// material, since old ciphertext tagged with that version must keep

// decrypting correctly.

const KEY_VERSION_ENV_VARS = {

1: 'SOCIAL_TOKEN_ENCRYPTION_KEY',

};

export const CURRENT_KEY_VERSION = 1;

// The AAD version is persisted per-token (see encryptSocialToken's return

// shape) precisely so it is independent from CURRENT_KEY_VERSION: rotating

// the encryption key and changing how the AAD is built are two unrelated

// events, and old ciphertext must keep decrypting correctly under whichever

// AAD format it was actually authenticated with, even after

// CURRENT_AAD_VERSION moves on. Bumping this constant only changes what NEW

// encryptions use -- decryptSocialToken() always dispatches on the

// aadVersion stored with the specific token being decrypted, never on this

// constant.

export const CURRENT_AAD_VERSION = 1;

// Maps an aadVersion to the function that builds that version's AAD buffer.

// A future format change (new fields, different encoding) adds a new entry

// here (e.g. `2: buildAADv2`) and bumps CURRENT_AAD_VERSION -- it never

// replaces or reinterprets an existing entry, since tokens already encrypted

// under an old aadVersion must keep authenticating against that exact same

// construction forever.

const AAD_BUILDERS = {

1: buildAADv1,

};

// Thrown for every failure in this module. Messages are deliberately generic

// and static -- never interpolate key material, ciphertext, IV, auth tag,

// plaintext token content, or AAD context values into a message, since these

// are exactly the strings that tend to end up in logs or (if a caller is

// careless) in an API error response.

export class SocialTokenCryptoError extends Error {

constructor(message) {

super(message);

this.name = 'SocialTokenCryptoError';

}

}

function getKeyForVersion(keyVersion) {

const envVarName = KEY_VERSION_ENV_VARS[keyVersion];

if (!envVarName) {

throw new SocialTokenCryptoError('Unsupported key version');

}

const raw = process.env[envVarName];

if (!raw) {

throw new SocialTokenCryptoError('Encryption key is not configured');

}

// Reuse the same strict base64 validation used for ciphertext/iv/authTag

// below: Buffer.from(str, 'base64') does not throw on malformed base64 --

// it silently decodes whatever it can and drops invalid characters, so a

// malformed environment value could otherwise still decode to exactly 32

// bytes and incorrectly pass a length-only check. decodeBase64Strict()

// additionally requires the value to be Node's own canonical encoding of

// its decoded bytes, so it must actually BE valid, canonically-padded

// base64, not merely decode to the right number of bytes.

const keyBuffer = decodeBase64Strict(raw, 'encryption key');

if (keyBuffer.length !== KEY_LENGTH_BYTES) {

throw new SocialTokenCryptoError('Encryption key has invalid length');

}

return keyBuffer;

}

// Strict base64 decode: rejects input that isn't already Node's own

// canonical encoding of its decoded bytes -- not just "decodes to the same

// bytes as something valid." Every value this module ever validates

// (encryption key, ciphertext, iv, authTag) is always generated by this same

// module via Buffer.toString('base64'), which always emits canonical,

// correctly-padded output, so requiring an exact match costs nothing here

// and closes off non-canonical/over-padded input (e.g. extra trailing `=`)

// that would otherwise decode to the same bytes as a valid value. JMN

// controls generation of every one of these values -- there is no legitimate

// unpadded or non-canonical Base64 input to accommodate.

function decodeBase64Strict(value, label) {

if (typeof value !== 'string' || value.length === 0) {

throw new SocialTokenCryptoError(`Missing or invalid ${label}`);

}

const buf = Buffer.from(value, 'base64');

const canonical = buf.toString('base64');

if (canonical !== value) {

throw new SocialTokenCryptoError(`Malformed ${label}`);

}

return buf;

}

// Dispatches to the AAD builder for a specific persisted aadVersion. This is

// the ONLY place that looks up AAD_BUILDERS, so both encrypt (which always

// builds under CURRENT_AAD_VERSION) and decrypt (which must build under

// whatever aadVersion the token actually recorded) go through identical,

// fail-closed version resolution.

function buildAAD(aadVersion, context) {

const builder = AAD_BUILDERS[aadVersion];

if (!builder) {

throw new SocialTokenCryptoError('Unsupported AAD version');

}

return builder(context);

}

// Builds the v1 AES-GCM AAD binding a token to its owning account.

// Deliberately built only from immutable identifiers -- companyId, platform,

// and the provider's own externalAccountId -- never username/display name,

// which can change without the underlying account changing. The caller

// (eventually api/social/instagram-callback.js at Checkpoint D) reconstructs

// this from the owning social_accounts row every time; the context itself is

// NEVER stored alongside the ciphertext, so there is nothing to keep in sync

// or drift -- only the numeric aadVersion is persisted, so a future decrypt

// knows which builder (this one, or a later buildAADv2) to reconstruct it with.

//

// Fields are length-prefixed (`<byteLength>:<value>`) rather than just

// joined with `:`, so no combination of field boundaries can be reinterpreted

// as a different split -- e.g. without length-prefixing, companyId="A:B" +

// platform="C" would serialize identically to companyId="A" +

// platform="B:C". None of companyId/platform/externalAccountId are expected

// to ever contain a literal ':' in practice (companyId is a Postgres uuid,

// platform is one of a small fixed set of literals JMN controls, and

// externalAccountId is a provider-issued id), but the AAD is a security

// boundary, not a convenience string, so it does not rely on that being true.

// A hypothetical future buildAADv2 is free to make different tradeoffs; this

// function's construction is frozen the moment any real token is encrypted

// under aadVersion 1.

function buildAADv1(context) {

if (!context || typeof context !== 'object') {

throw new SocialTokenCryptoError('Missing or invalid token context');

}

const { companyId, platform, externalAccountId } = context;

for (const value of [companyId, platform, externalAccountId]) {

if (typeof value !== 'string' || value.length === 0) {

throw new SocialTokenCryptoError('Missing or invalid token context');

}

}

const encodedFields = [companyId, platform, externalAccountId]

.map((value) => `${Buffer.byteLength(value, 'utf8')}:${value}`)

.join(':');

return Buffer.from(`jmn-social-token:v1:${encodedFields}`, 'utf8');

}

/**

 * Encrypts a plaintext provider access token with AES-256-GCM, bound to the

 * owning account via AAD.

 * @param {string} plaintextToken

 * @param {{ companyId: string, platform: string, externalAccountId: string }} context

 *   Immutable identifiers for the account this token belongs to. All three

 *   are required, non-empty strings. This context is NOT included in the

 *   return value -- it must be re-supplied (reconstructed from the owning

 *   social_accounts row) on every future decryptSocialToken() call for this

 *   token.

 * @returns {{ ciphertext: string, iv: string, authTag: string, keyVersion: number, aadVersion: number }}

 *   ciphertext/iv/authTag are base64-encoded strings. keyVersion and

 *   aadVersion must both be persisted alongside the ciphertext (e.g. as

 *   social_accounts.token_key_version / .token_aad_version) -- every future

 *   decryptSocialToken() call for this token needs both back.

 */

export function encryptSocialToken(plaintextToken, context) {

if (typeof plaintextToken !== 'string' || plaintextToken.length === 0) {

throw new SocialTokenCryptoError('Token to encrypt must be a non-empty string');

}

const aad = buildAAD(CURRENT_AAD_VERSION, context);

const key = getKeyForVersion(CURRENT_KEY_VERSION);

const iv = crypto.randomBytes(IV_LENGTH_BYTES);

const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH_BYTES });

cipher.setAAD(aad);

const ciphertextBuf = Buffer.concat([cipher.update(plaintextToken, 'utf8'), cipher.final()]);

const authTag = cipher.getAuthTag();

return {

ciphertext: ciphertextBuf.toString('base64'),

iv: iv.toString('base64'),

authTag: authTag.toString('base64'),

keyVersion: CURRENT_KEY_VERSION,

aadVersion: CURRENT_AAD_VERSION,

};

}

/**

 * Decrypts a token previously produced by encryptSocialToken(). Fails closed

 * on any structural, context-mismatch, or authentication problem: throws

 * SocialTokenCryptoError, never returns partial/garbage data, never falls

 * back to treating input as already-plaintext.

 * @param {{ ciphertext: string, iv: string, authTag: string, keyVersion: number, aadVersion: number }} encrypted

 *   aadVersion is REQUIRED and is never assumed -- a payload missing it (e.g.

 *   hand-constructed, or from a future format this code predates) is

 *   rejected rather than silently treated as aadVersion 1.

 * @param {{ companyId: string, platform: string, externalAccountId: string }} context

 *   Must exactly match the context passed to the original encryptSocialToken()

 *   call (reconstructed from the current social_accounts row, never trusted

 *   from client input) -- any mismatch fails GCM authentication.

 * @returns {string} the original plaintext token

 */

export function decryptSocialToken(encrypted, context) {

if (!encrypted || typeof encrypted !== 'object') {

throw new SocialTokenCryptoError('Encrypted token payload is missing or malformed');

}

const { ciphertext, iv, authTag, keyVersion, aadVersion } = encrypted;

if (typeof keyVersion !== 'number' || !Number.isInteger(keyVersion)) {

throw new SocialTokenCryptoError('Missing or invalid key version');

}

if (typeof aadVersion !== 'number' || !Number.isInteger(aadVersion)) {

throw new SocialTokenCryptoError('Missing or invalid AAD version');

}

const aad = buildAAD(aadVersion, context); // throws on unsupported AAD version

const key = getKeyForVersion(keyVersion); // throws on unsupported key version

const ciphertextBuf = decodeBase64Strict(ciphertext, 'ciphertext');

const ivBuf = decodeBase64Strict(iv, 'iv');

const authTagBuf = decodeBase64Strict(authTag, 'authTag');

if (ivBuf.length !== IV_LENGTH_BYTES) {

throw new SocialTokenCryptoError('Invalid IV length');

}

if (authTagBuf.length !== AUTH_TAG_LENGTH_BYTES) {

throw new SocialTokenCryptoError('Invalid auth tag length');

}

try {

const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf, { authTagLength: AUTH_TAG_LENGTH_BYTES });

decipher.setAAD(aad);

decipher.setAuthTag(authTagBuf);

const plaintextBuf = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);

return plaintextBuf.toString('utf8');

} catch {

// GCM authentication failure (tampered ciphertext, tampered tag, wrong

// key, wrong IV, wrong/mismatched AAD context, etc.) lands here. Fail

// closed with one generic message -- never expose which specific check

// failed, and never return whatever partial bytes decipher.update() may

// have buffered before final() threw (Buffer.concat above only runs if

// final() succeeds, so a thrown final() means plaintextBuf is never

// constructed at all).

throw new SocialTokenCryptoError('Decryption failed');

}

}
