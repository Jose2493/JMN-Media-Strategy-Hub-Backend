begin;
-- Unapplied Phase 1 migration: metadata only, curated by trusted JMN tooling.
create table public.social_approved_assets (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 title text not null check(char_length(title) between 1 and 160),
 kind text not null check(kind in ('IMAGE','REELS')),
 original_filename text not null check(char_length(original_filename) between 1 and 180),
 original_ext text not null check(original_ext in ('jpg','jpeg','png','mp4','mov')),
 original_sha256 text not null check(original_sha256 ~ '^[a-f0-9]{64}$'),
 original_bytes bigint not null check(original_bytes>0),
 master_path text not null unique,
 review_path text not null unique,
 poster_path text not null unique,
 publishing_path text not null unique,
 caption text not null default '' check(char_length(caption)<=2200),
 project_label text check(char_length(project_label)<=160),
 status text not null default 'IN_REVIEW' check(status in ('IN_REVIEW','APPROVED')),
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 approved_by uuid references public.contacts(id),
 check((status='IN_REVIEW' and approved_at is null and approved_by is null) or (status='APPROVED' and approved_at is not null and approved_by is not null)),
 check(master_path = company_id::text || '/' || id::text || '/master.' || original_ext),
 check(review_path = company_id::text || '/' || id::text || '/review.' || case kind when 'IMAGE' then 'jpg' else 'mp4' end),
 check(poster_path = company_id::text || '/' || id::text || '/poster.jpg'),
 check(publishing_path = company_id::text || '/' || id::text || '/social.' || case kind when 'IMAGE' then 'jpg' else 'mp4' end)
);
alter table public.social_approved_assets enable row level security;
revoke all on public.social_approved_assets from anon,authenticated;
grant select,insert,update,delete on public.social_approved_assets to service_role;
create index social_approved_assets_company on public.social_approved_assets(company_id,created_at desc);
-- Separate private media bucket: masters are never used as review previews.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('jmn-content','jmn-content',false,524288000,array['image/jpeg','image/png','video/mp4','video/quicktime'])
on conflict(id) do update set public=false;
-- A restrictive rule also blocks access if another permissive bucket policy exists.
-- Service-role generated signed URLs continue to work; browser DB/storage roles do not.
create policy jmn_content_service_only on storage.objects as restrictive
for all to anon,authenticated
using(bucket_id <> 'jmn-content') with check(bucket_id <> 'jmn-content');
notify pgrst,'reload schema';
commit;
