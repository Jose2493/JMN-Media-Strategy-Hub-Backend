import { createClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSTAGRAM_ID_PATTERN = /^\d{1,30}$/;
const MAX_TEXT = 255;

export class SocialAccountsError extends Error {
  constructor(message = 'Social account operation failed') {
    super(message);
    this.name = 'SocialAccountsError';
  }
}

let supabaseClient = null;
function getSupabaseClient() {
  if (!supabaseClient) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
      throw new SocialAccountsError();
    }
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return supabaseClient;
}

function assertUuid(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new SocialAccountsError();
  }
}

function assertText(value, { nullable = false } = {}) {
  if (nullable && value == null) return;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TEXT) {
    throw new SocialAccountsError();
  }
}

function assertEncryptedToken(encryptedToken) {
  if (!encryptedToken || typeof encryptedToken !== 'object') {
    throw new SocialAccountsError();
  }
  for (const field of ['ciphertext', 'iv', 'authTag']) {
    if (typeof encryptedToken[field] !== 'string' || encryptedToken[field].length === 0) {
      throw new SocialAccountsError();
    }
  }
  for (const field of ['keyVersion', 'aadVersion']) {
    if (!Number.isInteger(encryptedToken[field]) || encryptedToken[field] < 1) {
      throw new SocialAccountsError();
    }
  }
}

function assertScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new SocialAccountsError();
  }
  for (const scope of scopes) {
    if (typeof scope !== 'string' || !/^instagram_[a-z0-9_]{1,100}$/.test(scope)) {
      throw new SocialAccountsError();
    }
  }
}

export async function upsertOwnedInstagramAccount({
  companyId,
  contactId,
  externalAccountId,
  username,
  displayName,
  accountType,
  encryptedToken,
  tokenExpiresAt,
  scopes,
} = {}) {
  assertUuid(companyId);
  assertUuid(contactId);
  if (typeof externalAccountId !== 'string' || !INSTAGRAM_ID_PATTERN.test(externalAccountId)) {
    throw new SocialAccountsError();
  }
  assertText(username);
  assertText(displayName, { nullable: true });
  assertText(accountType);
  assertEncryptedToken(encryptedToken);
  assertScopes(scopes);

  const expiry = new Date(tokenExpiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
    throw new SocialAccountsError();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('upsert_owned_instagram_account', {
    p_company_id: companyId,
    p_external_account_id: externalAccountId,
    p_username: username,
    p_display_name: displayName ?? username,
    p_account_type: accountType,
    p_connected_by_contact_id: contactId,
    p_access_token_ciphertext: encryptedToken.ciphertext,
    p_access_token_iv: encryptedToken.iv,
    p_access_token_auth_tag: encryptedToken.authTag,
    p_token_key_version: encryptedToken.keyVersion,
    p_token_aad_version: encryptedToken.aadVersion,
    p_token_expires_at: expiry.toISOString(),
    p_scopes: scopes,
  });

  if (error || !Array.isArray(data) || data.length !== 1 || !data[0]?.id) {
    // Zero rows includes a cross-company ownership conflict or a contact/company
    // mismatch. Both fail closed and remain deliberately indistinguishable here.
    throw new SocialAccountsError();
  }

  return data[0].id;
}

export async function listInstagramAccountsForCompany(companyId) {
  assertUuid(companyId);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('social_accounts')
    .select('id, username, display_name, account_type, token_expires_at, scopes, status, last_refreshed_at, updated_at')
    .eq('company_id', companyId)
    .eq('platform', 'instagram')
    .order('updated_at', { ascending: false });

  if (error || !Array.isArray(data)) {
    throw new SocialAccountsError();
  }

  return data.map((row) => Object.freeze({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    accountType: row.account_type,
    tokenExpiresAt: row.token_expires_at,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    status: row.status,
    lastRefreshedAt: row.last_refreshed_at,
    updatedAt: row.updated_at,
  }));
}
