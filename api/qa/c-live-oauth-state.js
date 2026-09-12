// DISPOSABLE -- Checkpoint C-Live release-gate runner.
// Preview-only. Never merge this route to main.
// Redeploy marker: retest after branch-specific SUPABASE_URL cleanup.
//
// This invokes the real lib/socialOAuthState.js against the live Supabase
// project using Vercel Preview environment variables. It creates only
// transient social_oauth_states rows, exercises one-time / concurrent
// consumption, and deletes every state row it creates before responding.
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

  const environment = {
    supabaseUrlConfigured: Boolean(process.env.SUPABASE_URL),
    supabaseSecretConfigured: Boolean(process.env.SUPABASE_SECRET_KEY),
  };

  if (!environment.supabaseUrlConfigured || !environment.supabaseSecretConfigured) {
    return res.status(500).json({ ok: false, stage: 'environment', environment });
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

  let stage = 'setup';
  let functionalChecks = false;

  try {
    const { data: contacts, error: contactError } = await supabase
      .from('contacts')
      .select('id, company_id')
      .not('company_id', 'is', null)
      .limit(1);

    if (contactError || !contacts || contacts.length !== 1) {
      throw new Error('setup failed');
    }

    const expected = {
      contactId: contacts[0].id,
      companyId: contacts[0].company_id,
    };

    stage = 'sequential';
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

    stage = 'concurrency';
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

    stage = 'platform';
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

    stage = 'expiry';
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
      throw new Error('expiry setup failed');
    }

    checks.expiredBlocked = await mustReject(() =>
      consumeSocialOAuthState({ rawState: expiredState, platform: 'instagram' })
    );

    functionalChecks = Object.entries(checks)
      .filter(([name]) => name !== 'cleanup')
      .every(([, value]) => value === true);
    stage = functionalChecks ? 'cleanup' : 'assertions';
  } catch {
    functionalChecks = false;
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

  const ok = functionalChecks && checks.cleanup;

  return res.status(ok ? 200 : 500).json({
    ok,
    stage: ok ? 'complete' : stage,
    checks,
    createdStateCount: createdHashes.length,
  });
}
