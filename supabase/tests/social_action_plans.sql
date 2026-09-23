-- Exercise the deployed contract in a rollback-only transaction. No customer
-- messages, goals, or test conversations survive this verification.
begin;
set local lock_timeout = '5s';
do $$
declare a uuid; c uuid; u uuid; v integer; result jsonb; thread uuid := gen_random_uuid();
sample jsonb := '{"goal":{"objective":"Schema verification"},"move":{"title":"Schema verification"}}'::jsonb;
begin
 if has_function_privilege('anon','public.save_social_action_plan(uuid,uuid,uuid,integer,jsonb,uuid,jsonb)','EXECUTE') then raise exception 'Anonymous execute unexpectedly allowed'; end if;
 if has_function_privilege('authenticated','public.save_social_action_plan(uuid,uuid,uuid,integer,jsonb,uuid,jsonb)','EXECUTE') then raise exception 'Client execute unexpectedly allowed'; end if;
 if not exists(select 1 from pg_class where oid='public.social_action_plans'::regclass and relrowsecurity) then raise exception 'RLS must be enabled'; end if;
 select s.id,s.company_id,ct.id into a,c,u from public.social_accounts s join public.contacts ct on ct.company_id=s.company_id where s.platform='instagram' limit 1;
 if a is null then raise exception 'No account/contact fixture available for contract verification'; end if;
 select coalesce((select version from public.social_action_plans where company_id=c and account_id=a),0) into v;
 result:=public.save_social_action_plan(c,a,u,v,sample,thread,'{"kind":"social_action"}');
 if (result->>'version')::integer <> v+1 then raise exception 'Version did not advance'; end if;
 if not exists(select 1 from public.strategist_threads where conversation_id=thread and company_id=c) then raise exception 'Thread missing'; end if;
 if not exists(select 1 from public.conversations where id=thread and company_id=c and channel='portal_ai_strategist') then raise exception 'Conversation missing'; end if;
 begin
  perform public.save_social_action_plan(c,a,u,v,sample,null,null);
  raise exception 'Stale version was accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.save_social_action_plan(gen_random_uuid(),a,u,0,sample,null,null);
  raise exception 'Foreign account was accepted';
 exception when no_data_found then null; end;
end $$;
rollback;
