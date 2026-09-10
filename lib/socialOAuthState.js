// Server-side OAuth state issuance/consumption for the Social Command
// Center's connect flows (Instagram now; Facebook/TikTok/LinkedIn later).
// Pure request-shaping + one Supabase table (`social_oauth_states`) -- no
// Meta/OAuth-provider HTTP calls, no token exchange, no social_accounts
// writes. Those live in the future connect/callback route (Checkpoint D),
// which calls createSocialOAuthState() before redirecting to the provider
// and consumeSocialOAuthState() when the provider redirects back.
//
// The raw OAuth state is a bearer-style transient secret: whoever holds it
// can claim the company/contact it was issued for, for as long as it is
// valid and unused. It is treated exactly like the plaintext access tokens
// in socialTokenCrypto.js -- never logged, never included in an error
// message, never returned from anywhere except createSocialOAuthState()'s
// own return value. Only SHA-256(rawState) is ever persisted, matching the
// existing bootstrap-token pattern in api/session-exchange.js
// (`crypto.createHash('sha256').update(bootstrapToken).digest('hex')`) --
// reused verbatim here for the same reason: the raw value is never needed
// back out of storage, only compared against.
//
// companyId/contactId are accepted here exactly as the caller supplies them;
// this module does not itself verify a session. The caller (the future
// connect route) is responsible for deriving both from the verified JWT --
// never from anything a browser could set directly -- before calling
// createSocialOAuthState(). This mirrors the existing rule enforced in
// api/design-template.js: company/contact identity comes from server-side
// session verification, never client input.

import crypto from 'crypto';

// @supabase/supabase-js is imported dynamically inside getSupabaseClient()
// below, not as a static top-level import. Combined with that function being
// called only AFTER input validation runs (see createSocialOAuthState() /
// consumeSocialOAuthState()), this means every purely-local code path in
// this module -- generateRawState(), hashRawStateHex(), and rejecting
// malformed input -- works even in an environment where that package isn't
// installed/resolvable at all, as long as no call actually needs the
// database. Production always has the dependency installed normally, so
// this costs nothing there; it only removes an unconditional import-time
// dependency for code paths that were never going to touch Supabase anyway.

const TABLE = 'social_oauth_states';

const RAW_STATE_BYTES = 32; // >= 32 cryptographically random bytes, per spec

export const STATE_TTL_MINUTES = 10;

// Thrown for every failure in this module. Messages are deliberately generic
// and static -- never interpolate the raw state, its hash, or any other
// caller-supplied value. In particular, every reason a consume attempt can
// fail (unknown state, expired, already used, wrong platform) collapses into
// the SAME message on purpose: distinguishing them would let a caller probe
// for which specific condition applied to a state it does not actually hold,
// the same "don't leak which check failed" posture already used for
// design_templates authorization in lib/designTemplates.js.
export class SocialOAuthStateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SocialOAuthStateError';
  }
}

// The only platforms this module accepts today. Deliberately a closed,
// centrally-defined set rather than "any non-empty string": whitespace, a
// URL, or an attacker-controlled label must be rejected outright, not
// trimmed/lowercased into something that happens to match. Callers are
// expected to supply one of these literals exactly -- adding a platform
// later means adding it here, not relaxing the check.
export const ALLOWED_PLATFORMS = ['instagram', 'facebook', 'tiktok', 'linkedin'];

// Postgres `uuid` format (companies.id / contacts.id are both `uuid`
// columns). Any RFC 4122 layout is accepted (8-4-4-4-12 hex), not just v4,
// since Postgres's uuid type itself doesn't constrain the version -- only
// gen_random_uuid()'s own output happens to be v4.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new SocialOAuthStateError(`Missing or invalid ${label}`);
  }
}

function assertValidPlatform(value) {
  if (typeof value !== 'string' || !ALLOWED_PLATFORMS.includes(value)) {
    throw new SocialOAuthStateError('Missing or invalid platform');
  }
}

// Base64url alphabet only: letters, digits, `-`, `_`. No `+`, `/`, or `=` --
// JMN's own states are never padded, so a padded value is rejected here by
// construction, before it ever reaches the length/canonical checks below.
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

// Strictly validates that a raw OAuth state is EXACTLY what
// generateRawState() produces: 32 raw bytes, canonically base64url-encoded.
// This runs before hashing and before any Supabase call (see
// consumeSocialOAuthState() below) -- rejecting a malformed state costs
// nothing and happens before the database is ever touched.
//
// Malformed input is rejected outright, never normalized into something
// valid: no re-padding, no alphabet substitution, no truncation/extension to
// fit the expected length. A value is accepted only if it already IS the
// canonical encoding of exactly 32 bytes -- checked the same way
// lib/socialTokenCrypto.js's decodeBase64Strict() checks base64 canonicality
// (decode, then require the re-encoding to equal the original string
// exactly), adapted to the base64url alphabet JMN actually uses for states.
//
// Exported (unlike the UUID/platform validators above) specifically so its
// accept/reject behavior can be tested directly and purely, without needing
// to go through consumeSocialOAuthState()'s Supabase-dependent code path at
// all -- consumeSocialOAuthState() itself just calls this first.
export function assertValidRawStateFormat(rawState) {
  if (typeof rawState !== 'string' || rawState.length === 0) {
    throw new SocialOAuthStateError('Missing or invalid rawState');
  }
  if (!BASE64URL_PATTERN.test(rawState)) {
    throw new SocialOAuthStateError('Malformed rawState');
  }
  const decoded = Buffer.from(rawState, 'base64url');
  if (decoded.length !== RAW_STATE_BYTES) {
    throw new SocialOAuthStateError('Malformed rawState');
  }
  if (decoded.toString('base64url') !== rawState) {
    throw new SocialOAuthStateError('Malformed rawState');
  }
}

// Lazily constructed, memoized once created. Deliberately NOT built at
// module-load time (unlike lib/designTemplates.js / lib/repositories.js,
// which construct their client as a top-level const): constructing here
// means input validation in createSocialOAuthState()/consumeSocialOAuthState()
// always runs -- and can reject bad input -- before this module ever
// requires SUPABASE_URL/SUPABASE_SECRET_KEY to be configured. In production
// (Vercel) this runs exactly once per warm container either way, so there is
// no behavioral cost to laziness there.
let supabaseClient = null;
async function getSupabaseClient() {
  if (!supabaseClient) {
    const { createClient } = await import('@supabase/supabase-js');
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY
    );
  }
  return supabaseClient;
}

/**
 * Generates a fresh raw OAuth state: >= 32 cryptographically random bytes,
 * base64url-encoded (URL-safe, no padding/`+`/`/`) so it can be embedded
 * directly in an OAuth `state` redirect parameter. Exported as a pure,
 * side-effect-free function so its randomness/format can be tested without
 * any database involved.
 * @returns {string}
 */
export function generateRawState() {
  return crypto.randomBytes(RAW_STATE_BYTES).toString('base64url');
}

/**
 * SHA-256 hex digest of a raw state, matching the existing bootstrap-token
 * hashing convention in api/session-exchange.js exactly. Pure function --
 * no database, no side effects.
 * @param {string} rawState
 * @returns {string} 64-character lowercase hex digest
 */
export function hashRawStateHex(rawState) {
  return crypto.createHash('sha256').update(rawState).digest('hex');
}

/**
 * Issues a new OAuth state for a company/contact about to start a provider
 * connect flow. Stores only SHA-256(rawState) -- the raw value is returned
 * to the caller exactly once and is not retrievable afterward.
 * @param {{ companyId: string, contactId: string, platform: string }} params
 *   companyId/contactId MUST already be derived from a verified session by
 *   the caller -- this function does not verify anything itself, it only
 *   checks that both are syntactically valid Postgres uuid strings.
 *   platform must be one of ALLOWED_PLATFORMS exactly (no normalization).
 * @returns {Promise<string>} the raw state, to embed in the OAuth redirect.
 */
export async function createSocialOAuthState({ companyId, contactId, platform } = {}) {
  assertValidUuid(companyId, 'companyId');
  assertValidUuid(contactId, 'contactId');
  assertValidPlatform(platform);

  const rawState = generateRawState();
  const stateHash = hashRawStateHex(rawState);
  const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000).toISOString();

  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from(TABLE)
    .insert({
      state_hash: stateHash,
      company_id: companyId,
      contact_id: contactId,
      platform,
      expires_at: expiresAt,
    });

  if (error) {
    // Covers the astronomically unlikely state_hash collision (UNIQUE
    // constraint) and any other insert failure alike -- fail closed with one
    // generic message, never surface the raw state or its hash.
    throw new SocialOAuthStateError('Failed to create OAuth state');
  }

  return rawState;
}

/**
 * Consumes a raw OAuth state returned by the provider's redirect, exactly
 * once. Atomic under concurrency: see the single compound `.update()` below.
 * @param {{ rawState: string, platform: string }} params
 *   rawState must be EXACTLY what generateRawState() produces (32 bytes,
 *   canonical base64url, no padding) -- see assertValidRawStateFormat()
 *   above; anything else is rejected before hashing or any Supabase call.
 *   platform must be one of ALLOWED_PLATFORMS exactly (no normalization).
 * @returns {Promise<{ companyId: string, contactId: string }>}
 *   Trusted identifiers resolved from the DB record -- never from anything
 *   the browser/provider redirect supplied directly.
 */
export async function consumeSocialOAuthState({ rawState, platform } = {}) {
  assertValidRawStateFormat(rawState);
  assertValidPlatform(platform);

  const stateHash = hashRawStateHex(rawState);
  const nowIso = new Date().toISOString();

  // The entire safety property lives in this being ONE compound UPDATE, not
  // a SELECT followed by a separate UPDATE. PostgREST executes
  // .update().eq().eq().is().gt().select() as a single
  // `UPDATE social_oauth_states SET used_at = $1 WHERE state_hash = $2 AND
  // platform = $3 AND used_at IS NULL AND expires_at > $4 RETURNING
  // company_id, contact_id` statement. If two requests race on the exact
  // same rawState, Postgres's normal row-level locking serializes the two
  // UPDATEs against that row: the first to commit flips used_at away from
  // NULL, and the second one's own WHERE clause (used_at IS NULL) then no
  // longer matches that row, so it affects zero rows. There is no window
  // between "check" and "mark used" for a second request to slip through --
  // there is no separate check.
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ used_at: nowIso })
    .eq('state_hash', stateHash)
    .eq('platform', platform)
    .is('used_at', null)
    .gt('expires_at', nowIso)
    .select('company_id, contact_id');

  if (error) {
    throw new SocialOAuthStateError('Failed to consume OAuth state');
  }
  if (!data || data.length === 0) {
    // Unknown state, wrong platform, expired, or already used -- all
    // indistinguishable on purpose. See the class-level comment above.
    throw new SocialOAuthStateError('OAuth state is invalid, expired, or already used');
  }
  if (data.length > 1) {
    // Structurally impossible given state_hash's UNIQUE constraint, but fail
    // closed rather than trust an ambiguous result if that constraint were
    // ever weakened.
    throw new SocialOAuthStateError('OAuth state resolution was ambiguous');
  }

  const [row] = data;
  return { companyId: row.company_id, contactId: row.contact_id };
}