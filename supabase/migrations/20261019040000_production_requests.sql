begin;
-- Private review queue only; no contracts, payments or content mutations.
create table public.production_requests (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 contact_id uuid not null references public.contacts(id),
 conversation_id uuid references public.conversations(id),
 request_key uuid not null,
 mode text not null check(mode in ('on_location','remote')),
 goal text not null check(char_length(trim(goal)) between 1 and 600),
 location text not null check(char_length(trim(location)) between 1 and 200),
 deliverables text not null check(char_length(trim(deliverables)) between 1 and 600),
 timeline text not null check(char_length(trim(timeline)) between 1 and 200),
 budget text not null check(char_length(trim(budget)) between 1 and 160),
 status text not null default 'pending_review' check(status in ('pending_review','reviewed')),
 created_at timestamptz not null default now(),
 unique(contact_id,request_key)
);
create index production_requests_review_queue on public.production_requests(status,created_at);
alter table public.production_requests enable row level security;
revoke all on public.production_requests from public,anon,authenticated;
grant select,insert,update on public.production_requests to service_role;
notify pgrst,'reload schema';
commit;
