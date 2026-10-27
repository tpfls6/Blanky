-- One active private draft per user; optimistic revisions prevent silent cross-device overwrites.
begin;
create table public.planner_drafts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null check(revision>0),
 payload jsonb,
 updated_at timestamptz not null default now(),
 constraint planner_draft_size check(payload is null or octet_length(payload::text)<=2000000)
);
alter table public.planner_drafts enable row level security;
create policy planner_draft_owner_read on public.planner_drafts for select to authenticated using(user_id=auth.uid());
revoke all on public.planner_drafts from anon,authenticated;
grant select on public.planner_drafts to authenticated;
grant all on public.planner_drafts to service_role;
create function public.write_planner_draft(p_user_id uuid,p_expected_revision bigint,p_payload jsonb) returns setof public.planner_drafts
language plpgsql security invoker set search_path='' as $$
declare current_revision bigint;
begin
 if p_expected_revision<0 or p_expected_revision is null then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('blanky-draft:'||p_user_id::text,0));
 select revision into current_revision from public.planner_drafts where user_id=p_user_id for update;
 if coalesce(current_revision,0)<>p_expected_revision then raise exception 'DRAFT_CONFLICT'; end if;
 return query insert into public.planner_drafts(user_id,revision,payload,updated_at)
 values(p_user_id,coalesce(current_revision,0)+1,p_payload,clock_timestamp())
 on conflict(user_id) do update set revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at returning *;
end $$;
revoke all on function public.write_planner_draft(uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.write_planner_draft(uuid,bigint,jsonb) to service_role;
commit;
