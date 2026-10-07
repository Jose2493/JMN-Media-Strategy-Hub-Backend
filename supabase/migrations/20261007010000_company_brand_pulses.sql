-- Review-only: do not apply to staging or production without acceptance approval.
begin;
create table public.company_brand_pulses (
  company_id uuid not null references public.companies(id),
  pulse_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  answer_id text,
  answered_at timestamptz,
  answered_by uuid references public.contacts(id),
  primary key (company_id, pulse_date),
  constraint brand_pulse_answer_complete check (
    (answer_id is null and answered_at is null and answered_by is null)
    or (answer_id is not null and answered_at is not null and answered_by is not null)
  ),
  constraint brand_pulse_answer_time check (answered_at >= created_at),
  constraint brand_pulse_answer_id check (answer_id is null or char_length(answer_id) between 1 and 40)
);
alter table public.company_brand_pulses enable row level security;
revoke all on public.company_brand_pulses from public, anon, authenticated;
grant select, insert, update on public.company_brand_pulses to service_role;
notify pgrst, 'reload schema';
commit;
