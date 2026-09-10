-- Checkpoint D1 — applied to Supabase project odlgjkxtfrtxnovsjcnl on 2026-09-10
-- via mcp__Supabase__apply_migration, name:
-- "social_command_center_d1_upsert_owned_instagram_account"
--
-- Scope: ownership RPC only. No Meta client, routes, OAuth, production
-- secrets, or UI were touched. See the D1 report for full QA results.

create or replace function public.upsert_owned_instagram_account(
  p_company_id uuid,
  p_external_account_id text,
  p_username text,
  p_display_name text,
  p_account_type text,
  p_connected_by_contact_id uuid,
  p_access_token_ciphertext text,
  p_access_token_iv text,
  p_access_token_auth_tag text,
  p_token_key_version integer,
  p_token_aad_version integer,
  p_token_expires_at timestamptz,
  p_scopes text[]
)
returns table (id uuid)
language sql
security invoker
set search_path = pg_catalog
as $func$
  insert into public.social_accounts (
    company_id, platform, external_account_id, username, display_name, account_type,
    connected_by_contact_id, access_token_ciphertext, access_token_iv, access_token_auth_tag,
    token_key_version, token_aad_version, token_expires_at, scopes, status
  )
  select
    p_company_id, 'instagram', p_external_account_id, p_username, p_display_name, p_account_type,
    p_connected_by_contact_id, p_access_token_ciphertext, p_access_token_iv, p_access_token_auth_tag,
    p_token_key_version, p_token_aad_version, p_token_expires_at, p_scopes, 'active'
  where exists (
    -- Defense-in-depth guard: fail closed unless the connecting contact
    -- actually belongs to the company the row will be owned by. Protects
    -- against an application bug supplying a syntactically-valid but
    -- cross-company (companyId, contactId) pair -- e.g. a session-derived
    -- companyId paired with a contactId sourced from stale/wrong state
    -- upstream. Expressed as a WHERE EXISTS on the INSERT ... SELECT
    -- itself (not a separate check-then-act statement), so there is no
    -- window between "verify" and "write": if the EXISTS is false, the
    -- SELECT yields zero rows, so the INSERT has nothing to insert and
    -- ON CONFLICT never even evaluates. NULL p_connected_by_contact_id
    -- fails this the same way (c.id = NULL is never true) -- there is no
    -- "no connecting contact" escape hatch in this version.
    select 1
    from public.contacts c
    where c.id = p_connected_by_contact_id
      and c.company_id = p_company_id
  )
  on conflict (platform, external_account_id)
  do update set
    access_token_ciphertext = excluded.access_token_ciphertext,
    access_token_iv         = excluded.access_token_iv,
    access_token_auth_tag   = excluded.access_token_auth_tag,
    token_key_version       = excluded.token_key_version,
    token_aad_version       = excluded.token_aad_version,
    token_expires_at        = excluded.token_expires_at,
    last_refreshed_at       = now(),
    username                = excluded.username,
    display_name            = excluded.display_name,
    account_type            = excluded.account_type,
    scopes                  = excluded.scopes,
    status                  = 'active',
    connected_by_contact_id = excluded.connected_by_contact_id,
    updated_at              = now()
  -- The entire cross-company ownership guarantee lives in this WHERE:
  -- if a row already exists for (platform, external_account_id) but is
  -- owned by a DIFFERENT company than the caller, the DO UPDATE's WHERE
  -- evaluates false, Postgres leaves the existing row completely
  -- untouched, and the statement returns zero rows (verified directly --
  -- see the D1 report's scenario 3 and 4 results, including updated_at
  -- staying byte-for-byte identical on a rejected cross-company attempt).
  where public.social_accounts.company_id = excluded.company_id
  returning public.social_accounts.id;
$func$;

-- Lock the function down to service_role only. PUBLIC/anon/authenticated
-- are explicitly revoked (not just "never granted") so this is correct
-- even if a future default-privilege change would otherwise grant EXECUTE
-- automatically. SECURITY INVOKER (the default for `language sql`, kept
-- explicit here) means RLS on social_accounts/contacts -- currently
-- enabled with zero policies -- still applies to whatever role actually
-- calls this function; it is not a bypass.
revoke all on function public.upsert_owned_instagram_account(
  uuid, text, text, text, text, uuid, text, text, text, integer, integer, timestamptz, text[]
) from public;

revoke execute on function public.upsert_owned_instagram_account(
  uuid, text, text, text, text, uuid, text, text, text, integer, integer, timestamptz, text[]
) from anon;

revoke execute on function public.upsert_owned_instagram_account(
  uuid, text, text, text, text, uuid, text, text, text, integer, integer, timestamptz, text[]
) from authenticated;

grant execute on function public.upsert_owned_instagram_account(
  uuid, text, text, text, text, uuid, text, text, text, integer, integer, timestamptz, text[]
) to service_role;
