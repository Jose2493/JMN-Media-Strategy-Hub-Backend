begin;
create table if not exists public.strategist_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  created_by uuid not null references public.contacts(id),
  name text not null check (char_length(name) between 1 and 100),
  objective text not null default '' check (char_length(objective) <= 1000),
  created_at timestamptz not null default now(),
  unique (id, company_id)
);
create table if not exists public.strategist_threads (
  conversation_id uuid primary key references public.conversations(id),
  company_id uuid not null references public.companies(id),
  campaign_id uuid,
  title text not null check (char_length(title) between 1 and 120),
  social_context jsonb,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, company_id) references public.strategist_campaigns(id, company_id)
);
create index if not exists strategist_campaigns_company_idx on public.strategist_campaigns(company_id, created_at desc);
create index if not exists strategist_threads_company_idx on public.strategist_threads(company_id, campaign_id);
alter table public.strategist_campaigns enable row level security;
alter table public.strategist_threads enable row level security;
revoke all on public.strategist_campaigns, public.strategist_threads from anon, authenticated;
grant select, insert, update, delete on public.strategist_campaigns, public.strategist_threads to service_role;
notify pgrst, 'reload schema';
commit;
