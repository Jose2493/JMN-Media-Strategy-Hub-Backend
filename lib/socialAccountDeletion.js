import { createClient } from '@supabase/supabase-js';

const USER_ID_PATTERN = /^\d{1,30}$/;
const DELETE_BATCH_SIZE = 100;

export class SocialAccountDeletionError extends Error {
  constructor(code = 'DELETE_FAILED') {
    super('Unable to delete social account data');
    this.name = 'SocialAccountDeletionError';
    this.code = code;
  }
}

function fail(code = 'DELETE_FAILED') {
  throw new SocialAccountDeletionError(code);
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (typeof url !== 'string' || !url.startsWith('https://') || typeof secret !== 'string' || secret.length === 0) {
    fail('CONFIGURATION');
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function chunks(values, size = DELETE_BATCH_SIZE) {
  const output = [];
  for (let i = 0; i < values.length; i += size) output.push(values.slice(i, i + size));
  return output;
}

async function assertDelete(queryPromise) {
  const { error } = await queryPromise;
  if (error) fail();
}

export async function deleteInstagramAccountDataByExternalId(externalAccountId, {
  supabase = null,
} = {}) {
  if (typeof externalAccountId !== 'string' || !USER_ID_PATTERN.test(externalAccountId)) {
    fail('INVALID_ACCOUNT_ID');
  }

  const client = supabase || getSupabaseClient();

  const { data: account, error: accountError } = await client
    .from('social_accounts')
    .select('id')
    .eq('platform', 'instagram')
    .eq('external_account_id', externalAccountId)
    .maybeSingle();

  if (accountError) fail();
  if (!account) {
    // Meta can retry callbacks and a deletion request can arrive after a
    // deauthorization callback. Absence therefore means the requested state is
    // already satisfied and must be treated as success.
    return Object.freeze({ deleted: false, alreadyAbsent: true });
  }

  if (typeof account.id !== 'string' || account.id.length === 0) fail();
  const accountId = account.id;

  // Read media IDs first because their metric rows key off social_media_id.
  const { data: mediaRows, error: mediaError } = await client
    .from('social_media')
    .select('id')
    .eq('social_account_id', accountId);
  if (mediaError || !Array.isArray(mediaRows)) fail();

  const mediaIds = mediaRows
    .map((row) => row?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  // Delete leaf rows first. Each step is idempotent. The social_accounts row is
  // intentionally last so a provider retry can complete a partially-finished
  // deletion if a transient error occurs midway through the sequence.
  for (const batch of chunks(mediaIds)) {
    await assertDelete(
      client.from('social_media_metrics').delete().in('social_media_id', batch)
    );
  }

  await assertDelete(
    client.from('social_account_metrics').delete().eq('social_account_id', accountId)
  );
  await assertDelete(
    client.from('social_sync_runs').delete().eq('social_account_id', accountId)
  );
  await assertDelete(
    client.from('social_media').delete().eq('social_account_id', accountId)
  );

  await assertDelete(
    client
      .from('social_accounts')
      .delete()
      .eq('id', accountId)
      .eq('platform', 'instagram')
      .eq('external_account_id', externalAccountId)
  );

  return Object.freeze({ deleted: true, alreadyAbsent: false });
}
