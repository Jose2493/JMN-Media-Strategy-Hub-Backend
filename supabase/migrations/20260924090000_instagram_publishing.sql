begin;
create table if not exists public.social_publish_jobs (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 account_id uuid not null references public.social_accounts(id) on delete cascade,
 created_by uuid not null references public.contacts(id),
 kind text not null check(kind in ('IMAGE','REELS')),
 storage_path text not null unique,
 caption text not null default '' check(char_length(caption)<=2200),
 status text not null default 'draft' check(status in ('draft','scheduled','processing','publishing','published','failed','uncertain','cancelled')),
 scheduled_at timestamptz,
 timezone text not null default 'UTC',
 container_id text,
 media_id text,
 error_code text,
 attempts integer not null default 0,
 lease uuid,
 locked_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 published_at timestamptz
);
alter table public.social_publish_jobs enable row level security;
revoke all on public.social_publish_jobs from anon,authenticated;
grant select,insert,update,delete on public.social_publish_jobs to service_role;
create index if not exists social_publish_due on public.social_publish_jobs(next_attempt_at,scheduled_at) where status in ('scheduled','processing');
create table if not exists public.social_publish_worker (id boolean primary key default true check(id), last_seen timestamptz not null);
alter table public.social_publish_worker enable row level security;
revoke all on public.social_publish_worker from anon,authenticated;
grant select,insert,update on public.social_publish_worker to service_role;
-- Row locks and a lease fence prevent overlapping cron invocations publishing twice.
create or replace function public.claim_social_publish_job() returns setof public.social_publish_jobs
language plpgsql security invoker set search_path=public as $$
begin
 insert into social_publish_worker(id,last_seen) values(true,now()) on conflict(id) do update set last_seen=now();
 update social_publish_jobs set status='uncertain',error_code='CONFIRMATION_REQUIRED',updated_at=now()
 where status='publishing' and locked_until<now();
 return query with candidate as (
 select id from social_publish_jobs where status in ('scheduled','processing') and scheduled_at<=now()
 and next_attempt_at<=now() and (locked_until is null or locked_until<now())
 order by scheduled_at for update skip locked limit 1
 ) update social_publish_jobs j set status='processing',lease=gen_random_uuid(),locked_until=now()+interval '90 seconds',
 attempts=attempts+1,updated_at=now() from candidate c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_social_publish_job() from public,anon,authenticated;
grant execute on function public.claim_social_publish_job() to service_role;
-- A fixed private bucket. Signed upload URLs grant access to one random object only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('social-publishing','social-publishing',false,104857600,array['image/jpeg','video/mp4'])
on conflict(id) do nothing;
notify pgrst,'reload schema';
commit;
