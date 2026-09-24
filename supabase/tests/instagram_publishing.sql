begin;
set local lock_timeout='5s';
do $$
declare a uuid; c uuid; u uuid; j uuid:=gen_random_uuid(); claimed uuid; n integer;
begin
 if has_function_privilege('anon','public.claim_social_publish_job()','EXECUTE') or has_function_privilege('authenticated','public.claim_social_publish_job()','EXECUTE') then raise exception 'Public worker access'; end if;
 if has_table_privilege('authenticated','public.social_publish_jobs','SELECT') then raise exception 'Public jobs access'; end if;
 if not exists(select 1 from pg_class where oid='public.social_publish_jobs'::regclass and relrowsecurity) then raise exception 'Missing RLS'; end if;
 select s.id,s.company_id,ct.id into a,c,u from public.social_accounts s join public.contacts ct on ct.company_id=s.company_id where s.platform='instagram' limit 1;
 if a is null then raise exception 'No account fixture'; end if;
 -- Defer existing jobs only inside this rollback-only transaction.
 update social_publish_jobs set next_attempt_at=now()+interval '1 day';
 insert into social_publish_jobs(id,company_id,account_id,created_by,kind,storage_path,status,scheduled_at)
 values(j,c,a,u,'IMAGE','test/'||j||'.jpg','scheduled',now()-interval '1 minute');
 select id into claimed from claim_social_publish_job();
 if claimed is distinct from j then raise exception 'Due job was not claimed'; end if;
 select count(*) into n from claim_social_publish_job();
 if n<>0 then raise exception 'Live lease was claimed twice'; end if;
 update social_publish_jobs set status='publishing',locked_until=now()-interval '1 second' where id=j;
 perform claim_social_publish_job();
 if not exists(select 1 from social_publish_jobs where id=j and status='uncertain') then raise exception 'Ambiguous publication retried'; end if;
 if not exists(select 1 from storage.buckets where id='social-publishing' and not public) then raise exception 'Private bucket missing'; end if;
end $$;
rollback;
