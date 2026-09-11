// DISPOSABLE -- Checkpoint C-Live release-gate runner.
// Preview-only. Never merge this route to main.
//
// This invokes the real lib/socialOAuthState.js against the live Supabase
// project using Vercel Preview environment variables. It creates only
// transient social_oauth_states rows, exercises one-time / concurrent
// consumption, and deletes every state row it creates in a finally block.
// No raw state, hash, company/contact ID, secret, or database error is
// returned or logged.

import { createClient } from '@supabase/supabase-js';
import {
  createSocialOAuthState,
  consumeSocialOAuthState,
  hashRawStateHex,
} from '../../lib/socialOAuthState.js';

function sameIdentity(result, expected) {
  return Boolean(
    result &&
      result.companyId === expected.companyId &&
      result.contactId === expected.contactId
  );
}

async function mustReject(operation) {
  try {
    await operation();
    return false;
  } catch {
    return true;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (process.env.VERCEL_ENV !== 'preview') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return res.status(500).json({ ok: false, stage: 'environment' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const createdHashes = [];
  const checks = {
    sequentialConsume: false,
    replayBlocked: false,
    concurrentExactlyOneSuccess: false,
    concurrentIdentityTrusted: false,
    wrongPlatformBlocked: false,
    wrongPlatformDidNotConsume: false,
    expiredBlocked: false,
    cleanup: false,
  };

  try {
    // Use an already-existing contact/company pair solely as valid FK anchors.
    // No company/contact row is created, updated, or deleted by this runner.
    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('id, company_id')
      .not('company_id', 'is', null)
      .limit(1);

    if (contactError || !contacts || contacts.length !== 1) {
      return res.status(500).json({ ok: false, stage: 'setup', checks });
    }

    const expected = {
      contactId: contacts[0].id,
      companyId: contacts[0].company_id,
    };

    // 1) Normal consume succeeds exactly once; replay is blocked.
    const sequentialState = await createSocialOAuthState({
      companyId: expected.companyId,
      contactId: expected.contactId,
      platform: 'instagram',
    });
    createdHashes.push(hashRawStateHex(sequentialState));

    const sequentialResult = await consumeSocialOAuthState({
      rawState: sequentialState,
      platform: 'instagram',
    });
    checks.sequentialConsume = sameIdentity(sequentialResult, expected);

    checks.replayBlocked = await mustReject(() =>
      consumeSocialOAuthState({
        rawState: sequentialState,
        platform: 'instagram',
      })
    );

    // 2) Real concurrency gate: two consumers race on the same fresh state.
    // Exactly one must fulfill and exactly one must reject.
    const concurrentState = await createSocialOAuthState({
      companyId: expected.companyId,
      contactId: expected.contactId,
      platform: 'instagram',
    });
    createdHashes.push(hashRawStateHex(concurrentState));

    const concurrentResults = await Promise.allSettled([
      consumeSocialOAuthState({ rawState: concurrentState, platform: 'instagram' }),
      consumeSocialOAuthState({ rawState: concurrentState, platform: 'instagram' }),
    ]);

    const fulfilled = concurrentResults.filter((r) => r.status === 'fulfilled');
    const rejected = concurrentResults.filter((r) => r.status === 'rejected');
    checks.concurrentExactlyOneSuccess = fulfilled.length === 1 && rejected.length === 1;
    checks.concurrentIdentityTrusted =
      fulfilled.length === 1 && sameIdentity(fulfilled[0].value, expected);

    // 3) Wrong platform must not consume the state. A subsequent correct
    // platform consume must still succeed.
    const platformState = await createSocialOAuthState({
      companyId: expected.companyId,
      contactId: expected.contactId,
      platform: 'instagram',
    });
    createdHashes.push(hashRawStateHex(platformState));

    checks.wrongPlatformBlocked = await mustReject(() =>
      consumeSocialOAuthState({ rawState: platformState, platform: 'facebook' })
    );

    const afterWrongPlatform = await consumeSocialOAuthState({
      rawState: platformState,
      platform: 'instagram',
    });
    checks.wrongPlatformDidNotConsume = sameIdentity(afterWrongPlatform, expected);

    // 4) Expiry is enforced by the same atomic consume query. Only this
    // runner's own state row is modified to simulate an expired callback.
    const expiredState = await createSocialOAuthState({
      companyId: expected.companyId,
      contactId: expected.contactId,
      platform: 'instagram',
    });
    const expiredHash = hashRawStateHex(expiredState);
    createdHashes.push(expiredHash);

    const { error: expireError } = await supabase
      .from('social_oauth_states')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('state_hash', expiredHash);

    if (expireError) {
      return res.status(500).json({ ok: false, stage: 'expiry-setup', checks });
    }

    checks.expiredBlocked = await mustReject(() =>
      consumeSocialOAuthState({ rawState: expiredState, platform: 'instagram' })
    );

    const functionalChecks = Object.entries(checks)
      .filter(([name]) => name !== 'cleanup')
      .every(([, value]) => value === true);

    return res.status(functionalChecks ? 200 : 500).json({
      ok: functionalChecks,
      checks: {
        sequentialConsume: checks.sequentialConsume,
        replayBlocked: checks.replayBlocked,
        concurrentExactlyOneSuccess: checks.concurrentExactlyOneSuccess,
        concurrentIdentityTrusted: checks.concurrentIdentityTrusted,
        wrongPlatformBlocked: checks.wrongPlatformBlocked,
        wrongPlatformDidNotConsume: checks.wrongPlatformDidNotConsume,
        expiredBlocked: checks.expiredBlocked,
      },
      createdStateCount: createdHashes.length,
    });
  } catch {
    return res.status(500).json({ ok: false, stage: 'execution', checks });
  } finally {
    if (createdHashes.length > 0) {
      try {
        const { error } = await supabase
          .from('social_oauth_states')
          .delete()
          .in('state_hash', createdHashes);
        checks.cleanup = !error;
      } catch {
        checks.cleanup = false;
      }
    } else {
      checks.cleanup = true;
    }
  }
}
