// Tests for lib/socialOAuthState.js. Uses Node's built-in test runner
// (node:test) and assert. Run with: node --test
//
// Split into two groups:
//
// 1. Pure/offline tests -- random-state generation and input validation.
//    These never touch Supabase (createSocialOAuthState/consumeSocialOAuthState
//    validate their input BEFORE constructing a Supabase client -- see
//    getSupabaseClient() in the module), so they run and pass in ANY
//    environment, with or without SUPABASE_URL/SUPABASE_SECRET_KEY configured.
//
// 2. Live-Supabase tests -- everything that requires an actual DB row
//    (creating/consuming/expiring/racing real social_oauth_states rows).
//    These run against the real `odlgjkxtfrtxnovsjcnl` project using
//    synthetic QA company/contact rows created in `before` and deleted in
//    `after`. They require SUPABASE_URL and SUPABASE_SECRET_KEY to be set in
//    the environment running this file; if they are not, this whole group is
//    reported as SKIPPED (not failed, not silently omitted) with a clear
//    reason, via node:test's describe-level `skip` option.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createSocialOAuthState,
  consumeSocialOAuthState,
  generateRawState,
  hashRawStateHex,
  assertValidRawStateFormat,
  ALLOWED_PLATFORMS,
  SocialOAuthStateError,
  STATE_TTL_MINUTES,
} from './socialOAuthState.js';

const HAS_SUPABASE_ENV = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
const SKIP_REASON = 'SUPABASE_URL/SUPABASE_SECRET_KEY not configured in this environment -- see Checkpoint C report for how this was verified against the live project instead';

// Valid-looking synthetic UUIDs for use as "the other, not-under-test" field
// in negative tests below -- real Postgres uuid format, but never inserted
// anywhere, so they never touch the database (validation always rejects the
// OTHER, actually-malformed field first).
const SYNTHETIC_COMPANY_ID = crypto.randomUUID();
const SYNTHETIC_CONTACT_ID = crypto.randomUUID();

// =====================================================================
// Group 1: pure / offline tests (no Supabase client is ever constructed)
// =====================================================================

// 1. Generated raw states are not deterministic.
test('generated raw states are not deterministic', () => {
  const a = generateRawState();
  const b = generateRawState();
  assert.notEqual(a, b);
});

test('generated raw state is base64url of at least 32 random bytes', () => {
  const raw = generateRawState();
  // base64url alphabet only -- no '+', '/', or '=' padding, so it's safe to
  // embed directly in an OAuth redirect query parameter.
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const decoded = Buffer.from(raw, 'base64url');
  assert.equal(decoded.length, 32);
});

test('hashRawStateHex matches the existing bootstrap-token SHA-256 hex convention', () => {
  const raw = generateRawState();
  const expected = crypto.createHash('sha256').update(raw).digest('hex');
  assert.equal(hashRawStateHex(raw), expected);
  assert.match(hashRawStateHex(raw), /^[0-9a-f]{64}$/);
});

test('STATE_TTL_MINUTES is the specified initial 10-minute window', () => {
  assert.equal(STATE_TTL_MINUTES, 10);
});

// ---------------------------------------------------------------------
// Hardening pass: strict raw-state format validation. All of these call
// assertValidRawStateFormat() directly -- proving the accept/reject
// decision is correct without depending on Supabase at all -- as well as
// consumeSocialOAuthState() itself, to prove rejection happens before any
// DB access (see the dedicated test below).
// ---------------------------------------------------------------------

// A generated state passes.
test('a generated state passes strict format validation', () => {
  assert.doesNotThrow(() => assertValidRawStateFormat(generateRawState()));
});

// 'abc' with a valid platform is rejected before DB access. Proof that no
// DB access was attempted: this sandbox has neither the
// @supabase/supabase-js package installed nor Supabase credentials
// configured, so if consumeSocialOAuthState() had gotten as far as calling
// getSupabaseClient(), the rejection would be a module-resolution/Supabase
// error, NOT a SocialOAuthStateError. Asserting the specific error type is
// therefore proof the rejection happened at input validation.
test("'abc' with a valid platform is rejected before DB access", async () => {
  await assert.rejects(() => consumeSocialOAuthState({ rawState: 'abc', platform: 'instagram' }), SocialOAuthStateError);
});

test('padded base64url is rejected', () => {
  const padded = generateRawState() + '='; // '=' is outside the base64url alphabet JMN uses
  assert.throws(() => assertValidRawStateFormat(padded), SocialOAuthStateError);
});

test('invalid base64url characters are rejected', () => {
  const raw = generateRawState();
  const withInvalidChar = '+' + raw.slice(1); // '+' belongs to standard base64, not base64url
  assert.throws(() => assertValidRawStateFormat(withInvalidChar), SocialOAuthStateError);
});

test('a valid base64url value decoding to the wrong byte length is rejected', () => {
  const wrongLength = crypto.randomBytes(16).toString('base64url'); // valid alphabet, canonical, but only 16 bytes
  assert.throws(() => assertValidRawStateFormat(wrongLength), SocialOAuthStateError);
});

test('missing or non-string raw state is rejected', () => {
  assert.throws(() => assertValidRawStateFormat(''), SocialOAuthStateError);
  assert.throws(() => assertValidRawStateFormat(undefined), SocialOAuthStateError);
  assert.throws(() => assertValidRawStateFormat(null), SocialOAuthStateError);
});

// ---------------------------------------------------------------------
// Hardening pass: creation-context validation (UUID identifiers, closed
// platform set). All still run before any Supabase client is constructed.
// ---------------------------------------------------------------------

test('non-UUID companyId/contactId are rejected', async () => {
  await assert.rejects(() => createSocialOAuthState({ companyId: 'co1', contactId: SYNTHETIC_CONTACT_ID, platform: 'instagram' }), SocialOAuthStateError);
  await assert.rejects(() => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: 'c1', platform: 'instagram' }), SocialOAuthStateError);
  await assert.rejects(() => createSocialOAuthState({ companyId: '', contactId: SYNTHETIC_CONTACT_ID, platform: 'instagram' }), SocialOAuthStateError);
  await assert.rejects(() => createSocialOAuthState({}), SocialOAuthStateError);
  await assert.rejects(() => createSocialOAuthState(), SocialOAuthStateError);
});

test('a syntactically valid UUID pair with a valid platform passes context validation (fails only at the DB step)', async () => {
  // Same "which error type came back" proof as the rawState test above:
  // a UUID-shaped companyId/contactId and an allowed platform must clear
  // validation, so the only way this can fail in this sandbox is the
  // unrelated missing-Supabase-package/credentials problem -- never
  // SocialOAuthStateError.
  await assert.rejects(
    () => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: SYNTHETIC_CONTACT_ID, platform: 'instagram' }),
    (err) => !(err instanceof SocialOAuthStateError)
  );
});

test('platform must be one of the controlled set, with no normalization', async () => {
  // Wrong case -- not lowercased/accepted.
  await assert.rejects(() => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: SYNTHETIC_CONTACT_ID, platform: 'Instagram' }), SocialOAuthStateError);
  // Whitespace -- not trimmed/accepted.
  await assert.rejects(() => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: SYNTHETIC_CONTACT_ID, platform: ' instagram ' }), SocialOAuthStateError);
  // A URL, not a platform literal.
  await assert.rejects(() => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: SYNTHETIC_CONTACT_ID, platform: 'https://instagram.com' }), SocialOAuthStateError);
  // An arbitrary attacker-controlled label.
  await assert.rejects(() => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: SYNTHETIC_CONTACT_ID, platform: 'myspace' }), SocialOAuthStateError);
  // Empty/non-string.
  await assert.rejects(() => createSocialOAuthState({ companyId: SYNTHETIC_COMPANY_ID, contactId: SYNTHETIC_CONTACT_ID, platform: '' }), SocialOAuthStateError);
  // Same closed-set + no-normalization rule applies on the consume side too.
  await assert.rejects(() => consumeSocialOAuthState({ rawState: generateRawState(), platform: 'Instagram' }), SocialOAuthStateError);
  await assert.rejects(() => consumeSocialOAuthState({ rawState: generateRawState(), platform: 'myspace' }), SocialOAuthStateError);
});

test('ALLOWED_PLATFORMS is exactly the four currently planned platforms', () => {
  assert.deepEqual([...ALLOWED_PLATFORMS].sort(), ['facebook', 'instagram', 'linkedin', 'tiktok']);
});

// =====================================================================
// Group 2: live-Supabase tests (real social_oauth_states rows)
// =====================================================================

describe('social_oauth_states against the live project', { skip: HAS_SUPABASE_ENV ? false : SKIP_REASON }, () => {
  let supabase;
  let qaCompanyId;
  let qaContactId;
  const QA_MARKER = 'ZZ_QA_CHECKPOINT_C_DELETE_ME';

  before(async () => {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({ business_name: QA_MARKER })
      .select('id')
      .single();
    if (companyError) throw companyError;
    qaCompanyId = company.id;

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        company_id: qaCompanyId,
        email: `qa-checkpoint-c-${crypto.randomUUID()}@example.invalid`,
        full_name: QA_MARKER,
      })
      .select('id')
      .single();
    if (contactError) throw contactError;
    qaContactId = contact.id;
  });

  after(async () => {
    // Explicit, ordered cleanup rather than relying solely on ON DELETE
    // CASCADE -- provable and correct either way.
    await supabase.from('social_oauth_states').delete().eq('company_id', qaCompanyId);
    await supabase.from('contacts').delete().eq('id', qaContactId);
    await supabase.from('companies').delete().eq('id', qaCompanyId);
  });

  async function createQaState(overrides = {}) {
    return createSocialOAuthState({
      companyId: qaCompanyId,
      contactId: qaContactId,
      platform: 'instagram',
      ...overrides,
    });
  }

  async function readRowByRawState(rawState) {
    const { data, error } = await supabase
      .from('social_oauth_states')
      .select('*')
      .eq('state_hash', hashRawStateHex(rawState))
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // 4 & 5. Valid state consumes successfully, returning the DB record's
  // company/contact (not anything the caller supplied to consume()).
  test('valid state consumes successfully and returns the DB record company/contact', async () => {
    const rawState = await createQaState();
    const result = await consumeSocialOAuthState({ rawState, platform: 'instagram' });
    assert.equal(result.companyId, qaCompanyId);
    assert.equal(result.contactId, qaContactId);
  });

  // 2. Raw state is never stored in the DB.
  test('raw state is never stored in the database', async () => {
    const rawState = await createQaState();
    const row = await readRowByRawState(rawState);
    assert.ok(row, 'expected a row for this state');
    assert.notEqual(row.state_hash, rawState);
    assert.equal(JSON.stringify(row).includes(rawState), false);
  });

  // 3. Stored state hash equals SHA-256(raw state).
  test('stored state hash equals SHA-256(raw state)', async () => {
    const rawState = await createQaState();
    const row = await readRowByRawState(rawState);
    assert.equal(row.state_hash, hashRawStateHex(rawState));
  });

  // 6. Second use of the same state fails.
  test('second use of the same state fails', async () => {
    const rawState = await createQaState();
    await consumeSocialOAuthState({ rawState, platform: 'instagram' });
    await assert.rejects(() => consumeSocialOAuthState({ rawState, platform: 'instagram' }), SocialOAuthStateError);
  });

  // 7. Unknown state fails.
  test('unknown state fails', async () => {
    const neverCreated = generateRawState();
    await assert.rejects(() => consumeSocialOAuthState({ rawState: neverCreated, platform: 'instagram' }), SocialOAuthStateError);
  });

  // 8. Expired state fails.
  test('expired state fails', async () => {
    const rawState = await createQaState();
    // Backdate expires_at directly (bypassing the module, which always
    // issues a fresh 10-minute TTL) to deterministically simulate expiry
    // without waiting.
    const { error: backdateError } = await supabase
      .from('social_oauth_states')
      .update({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() })
      .eq('state_hash', hashRawStateHex(rawState));
    if (backdateError) throw backdateError;

    await assert.rejects(() => consumeSocialOAuthState({ rawState, platform: 'instagram' }), SocialOAuthStateError);
  });

  // 9. Wrong platform fails.
  test('wrong platform fails', async () => {
    const rawState = await createQaState({ platform: 'instagram' });
    await assert.rejects(() => consumeSocialOAuthState({ rawState, platform: 'facebook' }), SocialOAuthStateError);
  });

  // 12. Two concurrent consumption attempts on the same state: exactly one
  // success, one failure. The real test of the atomic-UPDATE design.
  test('two concurrent consumption attempts on the same state result in exactly one success and one failure', async () => {
    const rawState = await createQaState();

    const results = await Promise.allSettled([
      consumeSocialOAuthState({ rawState, platform: 'instagram' }),
      consumeSocialOAuthState({ rawState, platform: 'instagram' }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one concurrent attempt must succeed');
    assert.equal(rejected.length, 1, 'exactly one concurrent attempt must fail');
    assert.equal(fulfilled[0].value.companyId, qaCompanyId);
    assert.ok(rejected[0].reason instanceof SocialOAuthStateError);
  });

  // 13. Errors/log output never expose the raw state, including for a state
  // that was validly generated but never inserted (unknown-state path).
  test('errors and simulated logging never expose the raw state', async () => {
    const rawState = generateRawState(); // syntactically valid, never created

    const loggedLines = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
      loggedLines.push(args.map(String).join(' '));
    };

    let caught;
    try {
      try {
        await consumeSocialOAuthState({ rawState, platform: 'instagram' });
      } catch (err) {
        caught = err;
        console.error('OAuth state consumption failed:', err, err.stack);
      }
    } finally {
      console.error = originalConsoleError;
    }

    assert.ok(caught instanceof SocialOAuthStateError);
    assert.equal(caught.message.includes(rawState), false);
    assert.equal(caught.stack.includes(rawState), false);
    for (const line of loggedLines) {
      assert.equal(line.includes(rawState), false);
    }
  });

  // 14. Successful consumption persists used_at.
  test('successful consumption persists used_at', async () => {
    const rawState = await createQaState();
    await consumeSocialOAuthState({ rawState, platform: 'instagram' });
    const row = await readRowByRawState(rawState);
    assert.ok(row.used_at, 'expected used_at to be set after consumption');
  });

  // 15. Failed consumption does not mutate another state (or even the
  // targeted-but-mismatched row itself).
  test('failed consumption does not mutate another state', async () => {
    const rawStateA = await createQaState(); // will be attacked with the wrong platform
    const rawStateB = await createQaState(); // unrelated, untouched sibling state

    await assert.rejects(() => consumeSocialOAuthState({ rawState: rawStateA, platform: 'facebook' }), SocialOAuthStateError);

    const rowA = await readRowByRawState(rawStateA);
    assert.equal(rowA.used_at, null, 'the mismatched-platform attempt must not have marked state A used');

    // B was never touched by the failed attempt on A, and remains fully
    // usable on its own.
    const resultB = await consumeSocialOAuthState({ rawState: rawStateB, platform: 'instagram' });
    assert.equal(resultB.companyId, qaCompanyId);
  });
});