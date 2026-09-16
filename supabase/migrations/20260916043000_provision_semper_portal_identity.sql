begin;

-- Semper's SuiteDash company identifier is not exposed in the contact URL.
-- Keep it NULL until it is known; company identity remains stable on this row.
with new_company as (
  insert into public.companies (business_name, industry, status)
  select 'Semper CrossFit', 'Fitness', 'active'
  where not exists (
    select 1 from public.companies
    where business_name = 'Semper CrossFit' and suitedash_company_id is null
  )
  returning id
), target_company as (
  select id from new_company
  union all
  select id from public.companies
  where business_name = 'Semper CrossFit' and suitedash_company_id is null
  limit 1
)
insert into public.contacts (
  company_id,
  suitedash_contact_id,
  email,
  full_name,
  role_title,
  permissions,
  bootstrap_token_hash
)
select
  id,
  '8500999',
  'atgsemper@gmail.com',
  'Abel Torres',
  'Semper CrossFit',
  '{"portal":["strategist","social_command_center","design_studio"]}'::jsonb,
  '0a22ae6b7cafae165c8018db3772201fe6e92e4a86afcf2e21e9833a9006f3fd'
from target_company
on conflict (suitedash_contact_id) do update set
  company_id = excluded.company_id,
  email = excluded.email,
  full_name = excluded.full_name,
  role_title = excluded.role_title,
  permissions = excluded.permissions,
  bootstrap_token_hash = excluded.bootstrap_token_hash,
  updated_at = now();

commit;