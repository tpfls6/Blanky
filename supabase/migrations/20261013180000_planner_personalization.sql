-- Additive phase 5 metadata. Existing schedules and preferences remain intact.
begin;
alter table public.schedules add column planner_metadata jsonb;
create or replace function public.lock_planner_owner() returns trigger language plpgsql set search_path='' as $$
declare owner_id uuid;
begin
  if TG_TABLE_NAME='calendars' then
    if TG_OP='DELETE' then owner_id:=OLD.owner_user_id; else owner_id:=NEW.owner_user_id; end if;
  else
    if TG_OP='DELETE' then owner_id:=OLD.user_id; else owner_id:=NEW.user_id; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('blanky-planner:'||owner_id::text,0));
  if TG_TABLE_NAME='schedules' and TG_OP<>'DELETE' then
    if TG_OP='INSERT' and NEW.planner_approval_key is not null and coalesce(auth.role(),'')<>'service_role' then raise exception 'PLANNER_SERVER_ONLY'; end if;
    if TG_OP='UPDATE' then
      if NEW.planner_approval_key is distinct from OLD.planner_approval_key then raise exception 'PLANNER_KEY_IMMUTABLE'; end if;
      if coalesce(auth.role(),'')<>'service_role' then
        if NEW.planner_metadata is distinct from OLD.planner_metadata or NEW.planner_approval_hash is distinct from OLD.planner_approval_hash then raise exception 'PLANNER_SERVER_ONLY'; end if;
        if (to_jsonb(NEW)-'updated_at') is distinct from (to_jsonb(OLD)-'updated_at') then NEW.planner_approval_hash:=null; end if;
      end if;
    end if;
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
create or replace function public.approve_planner(p_user_id uuid,p_revision text,p_rows jsonb) returns setof public.schedules
language plpgsql security invoker set search_path='' as $$
declare item jsonb; stored public.schedules; cid uuid; zone text; start_local timestamp; end_local timestamp; complete boolean:=true;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>200 then raise exception 'INVALID_INPUT'; end if;
 if (select count(distinct value->>'key') from jsonb_array_elements(p_rows))<>jsonb_array_length(p_rows) then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('blanky-planner:'||p_user_id::text,0));
 for item in select value from jsonb_array_elements(p_rows) loop
  select * into stored from public.schedules where user_id=p_user_id and planner_approval_key=item->>'key';
  if item->>'targetId' is not null then
   if not found or stored.id is distinct from (item->>'targetId')::uuid or stored.status='done' then raise exception 'SCHEDULE_CONFLICT'; end if;
   if stored.planner_approval_hash is distinct from md5(item::text) then
    if stored.updated_at is distinct from (item->>'expectedUpdatedAt')::timestamptz then raise exception 'SCHEDULE_CONFLICT'; end if;
    complete:=false;
   end if;
  elsif found then
   if stored.planner_approval_hash is distinct from md5(item::text) then raise exception 'APPROVAL_CHANGED'; end if;
  else complete:=false; end if;
 end loop;
 if not complete and public.planner_revision(p_user_id) is distinct from p_revision then raise exception 'SCHEDULE_CONFLICT'; end if;
 select id,timezone into cid,zone from public.calendars where owner_user_id=p_user_id and is_default_personal;
 if cid is null then raise exception 'CALENDAR_REQUIRED'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  select * into stored from public.schedules where user_id=p_user_id and planner_approval_key=item->>'key';
  if item->>'targetId' is not null and stored.planner_approval_hash is distinct from md5(item::text) then
   select timezone into zone from public.calendars where id=stored.calendar_id and owner_user_id=p_user_id;
   if zone is null then raise exception 'CALENDAR_REQUIRED'; end if;
   start_local:=(item->>'startAt')::timestamptz at time zone zone;
   end_local:=(item->>'endAt')::timestamptz at time zone zone;
   if (item->>'endAt')::timestamptz<=(item->>'startAt')::timestamptz or length(trim(item->>'title'))<1 then raise exception 'INVALID_INPUT'; end if;
   update public.schedules set title=trim(item->>'title'),date=start_local::date,start_time=start_local::time,end_time=end_local::time,
    end_date=case when end_local::date>start_local::date then end_local::date else null end,
    duration_minutes=(item->>'durationMinutes')::integer,priority=item->>'priority',change_source='ai_chat',
    planner_approval_hash=md5(item::text),planner_metadata=coalesce(item->'metadata',planner_metadata)
    where id=(item->>'targetId')::uuid and user_id=p_user_id returning * into stored;
  elsif not found then
   if length(item->>'key')>300 or length(trim(item->>'title'))<1 then raise exception 'INVALID_INPUT'; end if;
   if item->>'categoryId' is not null and not exists(select 1 from public.categories where id=(item->>'categoryId')::uuid and user_id=p_user_id) then raise exception 'CATEGORY_NOT_FOUND'; end if;
   start_local:=(item->>'startAt')::timestamptz at time zone zone;
   end_local:=(item->>'endAt')::timestamptz at time zone zone;
   if (item->>'endAt')::timestamptz<=(item->>'startAt')::timestamptz then raise exception 'INVALID_INPUT'; end if;
   insert into public.schedules(user_id,calendar_id,kind,title,date,start_time,end_time,end_date,due_date,duration_minutes,priority,category_id,source_text,change_source,planner_approval_key,planner_approval_hash,planner_metadata)
   values(p_user_id,cid,item->>'kind',trim(item->>'title'),start_local::date,start_local::time,end_local::time,
    case when end_local::date>start_local::date then end_local::date else null end,
    (item->>'dueDate')::date,(item->>'durationMinutes')::integer,item->>'priority',(item->>'categoryId')::uuid,item->>'sourceText','ai_chat',item->>'key',md5(item::text),item->'metadata') returning * into stored;
  end if;
  return next stored;
 end loop;
end $$;

commit;
