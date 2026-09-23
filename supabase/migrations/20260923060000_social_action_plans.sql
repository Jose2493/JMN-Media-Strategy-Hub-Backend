begin;
create table if not exists public.social_action_plans (
  company_id uuid not null references public.companies(id),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  version integer not null default 1,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(company_id, account_id)
);
alter table public.social_action_plans enable row level security;
revoke all on public.social_action_plans from anon, authenticated;
grant select, insert, update, delete on public.social_action_plans to service_role;

-- Serialize by owned account, including the first insert. Conversation creation
-- and plan persistence commit together, so retries cannot create orphan chats.
create or replace function public.save_social_action_plan(
 p_company uuid, p_account uuid, p_contact uuid, p_version integer,
 p_state jsonb, p_conversation uuid default null, p_context jsonb default null
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare current_version integer; campaign uuid;
begin
 perform 1 from public.social_accounts where id=p_account and company_id=p_company and platform='instagram' for update;
 if not found then raise exception 'Account unavailable' using errcode='P0002'; end if;
 select version into current_version from public.social_action_plans where company_id=p_company and account_id=p_account for update;
 if coalesce(current_version,0) <> p_version then raise exception 'Plan changed' using errcode='40001'; end if;
 if p_conversation is not null then
   insert into public.strategist_campaigns(company_id,created_by,name,objective)
   values(p_company,p_contact,'Social · '||left(p_state->'move'->>'title',85),p_state->'goal'->>'objective') returning id into campaign;
   insert into public.conversations(id,company_id,contact_id,channel) values(p_conversation,p_company,p_contact,'portal_ai_strategist');
   insert into public.strategist_threads(conversation_id,company_id,campaign_id,title,social_context)
   values(p_conversation,p_company,campaign,left(p_state->'move'->>'title',120),p_context);
 end if;
 insert into public.social_action_plans(company_id,account_id,version,state)
 values(p_company,p_account,p_version+1,p_state)
 on conflict(company_id,account_id) do update set version=excluded.version,state=excluded.state,updated_at=now();
 return jsonb_build_object('version',p_version+1,'state',p_state);
end $$;
revoke all on function public.save_social_action_plan(uuid,uuid,uuid,integer,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_social_action_plan(uuid,uuid,uuid,integer,jsonb,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
