begin;
-- Private beta only. No subscriptions, payment methods, trial or public plan records.
-- No seed data: enrollment requires verified existing company/contact/project IDs.
create table public.founding_partner_workspaces (
  contact_id uuid primary key references public.contacts(id),
  company_id uuid not null references public.companies(id),
  partner_key text not null check (partner_key in ('semper','riany')),
  workspace_kind text not null check (workspace_kind in ('company','project')),
  project_id uuid references public.projects(id),
  display_name text not null check (char_length(display_name) between 1 and 100),
  category text not null default '' check (char_length(category) <= 100),
  strategy_focus text not null default '' check (char_length(strategy_focus) <= 240),
  media_available boolean not null default false,
  active boolean not null default true,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(contact_id,company_id),
  check ((partner_key='semper' and workspace_kind='company' and project_id is null)
      or (partner_key='riany' and workspace_kind='project' and project_id is not null))
);
-- One compact, replaceable feedback response per member; not a survey system.
create table public.founding_partner_feedback (
  contact_id uuid primary key,
  company_id uuid not null,
  rating smallint check (rating between 1 and 5),
  kind text not null check (kind in ('feedback','issue')),
  note text not null default '' check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  foreign key(contact_id,company_id) references public.founding_partner_workspaces(contact_id,company_id),
  check (rating is not null or char_length(trim(note)) > 0)
);
alter table public.founding_partner_workspaces enable row level security;
alter table public.founding_partner_feedback enable row level security;
revoke all on public.founding_partner_workspaces, public.founding_partner_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.founding_partner_workspaces, public.founding_partner_feedback to service_role;
notify pgrst, 'reload schema';
commit;
