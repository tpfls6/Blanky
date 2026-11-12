-- Phase 2: shared calendars. Membership replaces the owner-only schedule rules.
-- Personal and external calendars keep their owner path; only type 'shared' accepts other members.
begin;

-- Membership ---------------------------------------------------------------------------------
create table public.calendar_members (
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  -- Per-user display and notification choices; they never change what other members see.
  hidden boolean not null default false,
  notify boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (calendar_id, user_id)
);
create index calendar_members_user_idx on public.calendar_members(user_id);
alter table public.calendar_members enable row level security;

insert into public.calendar_members(calendar_id, user_id, role)
select id, owner_user_id, 'owner' from public.calendars
on conflict do nothing;

-- Definer helpers so policies never recurse into calendar_members' own RLS.
create function public.calendar_role(p_calendar uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.calendar_members m
  where m.calendar_id = p_calendar and m.user_id = auth.uid();
$$;

create function public.can_read_calendar(p_calendar uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.calendars c
    where c.id = p_calendar and (
      (c.type <> 'shared' and c.owner_user_id = auth.uid())
      or exists (select 1 from public.calendar_members m where m.calendar_id = c.id and m.user_id = auth.uid())
    )
  );
$$;

create function public.can_write_calendar(p_calendar uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.calendars c
    where c.id = p_calendar and (
      (c.type <> 'shared' and c.owner_user_id = auth.uid())
      or (c.type = 'shared' and exists (
        select 1 from public.calendar_members m
        where m.calendar_id = c.id and m.user_id = auth.uid() and m.role in ('owner', 'editor')))
    )
  );
$$;
revoke all on function public.calendar_role(uuid), public.can_read_calendar(uuid), public.can_write_calendar(uuid) from public, anon;
grant execute on function public.calendar_role(uuid), public.can_read_calendar(uuid), public.can_write_calendar(uuid) to authenticated;

create policy calendar_members_select on public.calendar_members for select to authenticated
  using (public.can_read_calendar(calendar_id));
-- Members change only their own display and notification choices; roles go through RPCs.
create policy calendar_members_update_self on public.calendar_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.calendar_members from anon, authenticated;
grant select on public.calendar_members to authenticated;
grant update (hidden, notify) on public.calendar_members to authenticated;

-- Calendars ----------------------------------------------------------------------------------
drop policy calendars_select on public.calendars;
drop policy calendars_insert on public.calendars;
drop policy calendars_update on public.calendars;
drop policy calendars_delete on public.calendars;
-- owner_user_id is always an owner member; reading it directly also covers INSERT ... RETURNING,
-- which is checked before the trigger below adds the owner's membership row.
create policy calendars_select on public.calendars for select to authenticated
  using (owner_user_id = auth.uid() or public.can_read_calendar(id));
create policy calendars_insert on public.calendars for insert to authenticated
  with check (owner_user_id = auth.uid() and type in ('personal', 'shared') and not is_default_personal);
create policy calendars_update on public.calendars for update to authenticated
  using ((type <> 'shared' and owner_user_id = auth.uid()) or public.calendar_role(id) = 'owner')
  with check (type in ('personal', 'shared'));
create policy calendars_delete on public.calendars for delete to authenticated
  using (not is_default_personal and ((type <> 'shared' and owner_user_id = auth.uid()) or public.calendar_role(id) = 'owner'));

-- Ownership moves only through transfer_calendar_ownership or account deletion (blanky.owner_change).
create or replace function public.guard_personal_calendar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.type <> old.type or new.is_default_personal <> old.is_default_personal
     or (new.owner_user_id <> old.owner_user_id
         and not (old.type = 'shared' and current_setting('blanky.owner_change', true) = 'on'))) then
    raise exception 'Calendar identity cannot be changed' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  if length(trim(new.name)) > 80 or length(new.description) > 500 then
    raise exception 'Calendar text too long' using errcode = '22001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.add_calendar_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.calendar_members(calendar_id, user_id, role)
  values (new.id, new.owner_user_id, 'owner') on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.add_calendar_owner_member() from public, anon, authenticated;
create trigger add_calendar_owner_member after insert on public.calendars
for each row execute function public.add_calendar_owner_member();

-- Schedules ----------------------------------------------------------------------------------
-- Owner-only composite FK is replaced by membership checks; deleting a shared calendar removes its schedules.
alter table public.schedules drop constraint schedules_calendar_owner_fk;
alter table public.schedules add constraint schedules_calendar_fk
  foreign key (calendar_id) references public.calendars(id) on delete cascade;
alter table public.schedules add column updated_by_user_id uuid references auth.users(id) on delete set null;
update public.schedules set updated_by_user_id = created_by_user_id;

-- Personal calendars still refuse deletion while they hold schedules (account deletion excepted).
create function public.guard_nonempty_personal_calendar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.type = 'personal' and exists (select 1 from auth.users where id = old.owner_user_id)
     and exists (select 1 from public.schedules where calendar_id = old.id) then
    raise exception 'Calendar still has schedules' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_nonempty_personal_calendar() from public, anon, authenticated;
create trigger guard_nonempty_personal_calendar before delete on public.calendars
for each row execute function public.guard_nonempty_personal_calendar();

drop policy "schedules_owner" on public.schedules;
create policy schedules_select on public.schedules for select to authenticated
  using (public.can_read_calendar(calendar_id));
create policy schedules_insert on public.schedules for insert to authenticated
  with check (user_id = auth.uid() and public.can_write_calendar(calendar_id));
create policy schedules_update on public.schedules for update to authenticated
  using (public.can_write_calendar(calendar_id)) with check (public.can_write_calendar(calendar_id));
create policy schedules_delete on public.schedules for delete to authenticated
  using (public.can_write_calendar(calendar_id));

create or replace function public.assign_schedule_calendar() returns trigger
language plpgsql set search_path = '' as $$
declare
  target public.calendars;
  source_type text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.user_id <> auth.uid() then
      raise exception 'Invalid schedule owner' using errcode = '42501';
    end if;
    -- Old clients omit calendar_id. Defaults are resolved on the server.
    if new.calendar_id is null then
      select id into new.calendar_id from public.calendars
      where owner_user_id = new.user_id and is_default_personal;
    end if;
    new.created_by_user_id := coalesce(auth.uid(), new.user_id);
    new.updated_by_user_id := new.created_by_user_id;
    return new;
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id and auth.uid() is not null then
    raise exception 'Schedule author cannot be changed' using errcode = '42501';
  end if;
  -- Server jobs (Google binding, account deletion) run without auth.uid() and set rows directly.
  if auth.uid() is null then return new; end if;
  if new.user_id <> old.user_id then
    raise exception 'Schedule author cannot be changed' using errcode = '42501';
  end if;
  if new.calendar_id <> old.calendar_id then
    select type into source_type from public.calendars where id = old.calendar_id;
    if source_type = 'external' then
      raise exception 'Google schedules stay in their calendar' using errcode = '42501';
    end if;
    -- A row moved into a personal calendar belongs to that calendar's owner, never to the old author.
    select * into target from public.calendars where id = new.calendar_id;
    if target.type <> 'shared' then new.user_id := target.owner_user_id; end if;
  end if;
  new.updated_by_user_id := auth.uid();
  return new;
end;
$$;

-- History of shared rows is written for the person who made the change, so a removed
-- author stops receiving copies of later edits.
create or replace function public.record_schedule_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_data public.schedules;
  owner_id uuid;
begin
  if TG_OP = 'DELETE' then row_data := OLD; else row_data := NEW; end if;
  owner_id := row_data.user_id;
  if exists (select 1 from public.calendars where id = row_data.calendar_id and type = 'shared') then
    owner_id := auth.uid();
  end if;
  if owner_id is null or not exists (select 1 from auth.users where id = owner_id) then return row_data; end if;
  insert into public.schedule_changes(schedule_id, user_id, action, entity_type, before_data, after_data, source)
  values (row_data.id, owner_id,
    case when TG_OP = 'INSERT' then 'created' when TG_OP = 'DELETE' then 'deleted'
      when NEW.status = 'done' and OLD.status <> 'done' then 'completed' else 'updated' end,
    row_data.kind,
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end,
    case when TG_OP = 'DELETE' then 'manual' else NEW.change_source end);
  return row_data;
end;
$$;
revoke all on function public.record_schedule_activity() from public, anon, authenticated;

-- The planner works on the user's own calendars only; shared rows stay out of its snapshot.
create or replace function public.planner_revision(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$
select md5(jsonb_build_object(
 'schedules',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.schedules s join public.calendars c on c.id=s.calendar_id
   where s.user_id=p_user_id and c.type<>'shared'),'[]'::jsonb),
 'calendars',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.calendars c where c.owner_user_id=p_user_id and c.type<>'shared'),'[]'::jsonb),
 'preferences',coalesce((select jsonb_agg(to_jsonb(p) order by p.user_id) from public.user_preferences p where p.user_id=p_user_id),'[]'::jsonb)
)::text);
$$;
create or replace function public.planner_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('blanky-planner:'||uid::text,0));
 return jsonb_build_object('revision',public.planner_revision(uid),
  'rows',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.schedules s join public.calendars c on c.id=s.calendar_id
    where s.user_id=uid and c.type<>'shared'),'[]'::jsonb),
  'calendars',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.calendars c where c.owner_user_id=uid and c.type<>'shared'),'[]'::jsonb));
end $$;

-- AI batch deletes follow the same membership rule as direct deletes.
create or replace function public.apply_schedule_batch(p_key uuid, p_deletes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request_hash text;
  existing public.schedule_batch_jobs;
  sid uuid;
  stored public.schedules;
  cal_type text;
  link_origin text;
  google_event text;
  deleted uuid[] := '{}';
  pending_n integer := 0;
  remaining integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_key is null or p_deletes is null or cardinality(p_deletes) < 1 or cardinality(p_deletes) > 200 then
    raise exception 'INVALID_INPUT';
  end if;
  if (select count(distinct x) from unnest(p_deletes) as x) <> cardinality(p_deletes) then
    raise exception 'INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('blanky-batch:' || uid::text, 0));

  request_hash := md5(array_to_string(array(select unnest(p_deletes)::text order by 1), ','));

  select * into existing from public.schedule_batch_jobs where id = p_key;
  if found then
    if existing.user_id is distinct from uid or existing.request_hash is distinct from request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'status', 'unchanged',
      'deletedIds', to_jsonb(existing.deleted_ids),
      'google', existing.google_status
    );
  end if;

  foreach sid in array p_deletes loop
    select * into stored from public.schedules where id = sid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if stored.user_id is distinct from uid then raise exception 'FORBIDDEN'; end if;
    -- A demoted or departed member keeps authorship but loses write access.
    if not public.can_write_calendar(stored.calendar_id) then raise exception 'FORBIDDEN'; end if;
    select type into cal_type from public.calendars where id = stored.calendar_id;
    if stored.change_source = 'calendar_sync' or cal_type = 'external' then
      raise exception 'GOOGLE_PROTECTED';
    end if;
    select origin into link_origin from public.google_calendar_event_links where schedule_id = sid;
    if found and link_origin = 'google' then raise exception 'GOOGLE_PROTECTED'; end if;
  end loop;

  foreach sid in array p_deletes loop
    delete from public.schedules where id = sid and user_id = uid;
    if not found then raise exception 'NOT_FOUND'; end if;
    deleted := array_append(deleted, sid);
  end loop;

  select count(*) into remaining from public.schedules where id = any (p_deletes) and user_id = uid;
  if remaining <> 0 then raise exception 'BATCH_INCOMPLETE'; end if;

  foreach sid in array p_deletes loop
    select origin, google_event_id into link_origin, google_event
    from public.google_calendar_event_links where schedule_id = sid;
    if found and link_origin = 'blanky' then
      pending_n := pending_n + 1;
    end if;
  end loop;

  insert into public.schedule_batch_jobs(id, user_id, request_hash, status, deleted_ids, google_status)
  values (
    p_key,
    uid,
    request_hash,
    'applied',
    deleted,
    case when pending_n > 0 then 'pending' else 'idle' end
  );

  foreach sid in array p_deletes loop
    select origin, google_event_id into link_origin, google_event
    from public.google_calendar_event_links where schedule_id = sid;
    if found and link_origin = 'blanky' then
      insert into public.google_sync_jobs(user_id, batch_id, schedule_id, google_event_id, action, status)
      values (uid, p_key, sid, google_event, 'delete_google', 'pending')
      on conflict (user_id, schedule_id, action) do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'applied',
    'deletedIds', to_jsonb(deleted),
    'google', case when pending_n > 0 then 'pending' else 'idle' end
  );
end;
$$;

-- Invitations --------------------------------------------------------------------------------
create table public.calendar_invitations (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  kind text not null check (kind in ('email', 'link')),
  email text check (email is null or (email = lower(trim(email)) and email like '%_@_%')),
  role text not null check (role in ('editor', 'viewer')),
  -- Only a SHA-256 of the link token is stored; the token itself is shown once at creation.
  token_hash text unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invitee_user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((kind = 'email') = (email is not null)),
  check ((kind = 'link') = (token_hash is not null))
);
create unique index calendar_invitations_pending_email_idx on public.calendar_invitations(calendar_id, email)
  where kind = 'email' and status = 'pending';
create index calendar_invitations_email_idx on public.calendar_invitations(email) where status = 'pending';
alter table public.calendar_invitations enable row level security;
-- Owners list their calendar's invitations; invitees read theirs through my_calendar_invitations().
create policy calendar_invitations_owner_read on public.calendar_invitations for select to authenticated
  using (public.calendar_role(calendar_id) = 'owner');
revoke all on public.calendar_invitations from anon, authenticated;
grant select (id, calendar_id, kind, email, role, status, invited_by, invitee_user_id, expires_at, created_at, responded_at)
  on public.calendar_invitations to authenticated;

-- Notifications ------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'invite_received', 'invite_accepted', 'invite_declined',
    'schedule_created', 'schedule_updated', 'schedule_deleted',
    'member_removed', 'role_changed', 'ownership_transferred')),
  calendar_id uuid references public.calendars(id) on delete cascade,
  schedule_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  -- One unread row per key: repeated edits of one schedule raise count instead of stacking.
  dedupe_key text not null,
  count integer not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index notifications_unread_key_idx on public.notifications(user_id, dedupe_key) where read_at is null;
create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create function public.user_label(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(u.email, '@', 1), '알 수 없는 사용자')
  from auth.users u where u.id = p_user;
$$;
revoke all on function public.user_label(uuid) from public, anon, authenticated;

create function public.notify_user(p_user uuid, p_type text, p_calendar uuid, p_schedule uuid,
  p_actor uuid, p_data jsonb, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_user is not distinct from p_actor then return; end if;
  if exists (select 1 from public.user_preferences where user_id = p_user and not notifications_enabled) then return; end if;
  if p_type like 'schedule_%' and exists (select 1 from public.calendar_members
     where calendar_id = p_calendar and user_id = p_user and not notify) then return; end if;
  insert into public.notifications(user_id, type, calendar_id, schedule_id, actor_user_id, data, dedupe_key)
  values (p_user, p_type, p_calendar, p_schedule, p_actor,
    p_data || jsonb_build_object('actorName', public.user_label(p_actor)), p_key)
  on conflict (user_id, dedupe_key) where read_at is null do update
    set type = excluded.type, data = excluded.data, actor_user_id = excluded.actor_user_id,
        count = public.notifications.count + 1, created_at = now();
end;
$$;
revoke all on function public.notify_user(uuid, text, uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;

create function public.notify_calendar_members(p_calendar uuid, p_type text, p_schedule uuid, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cal public.calendars;
  member uuid;
begin
  select * into cal from public.calendars where id = p_calendar;
  if not found or cal.type <> 'shared' or auth.uid() is null then return; end if;
  for member in select user_id from public.calendar_members where calendar_id = p_calendar loop
    perform public.notify_user(member, p_type, p_calendar, p_schedule, auth.uid(),
      jsonb_build_object('title', p_title, 'calendarName', cal.name, 'calendarColor', cal.color),
      'schedule:' || p_schedule::text);
  end loop;
end;
$$;
revoke all on function public.notify_calendar_members(uuid, text, uuid, text) from public, anon, authenticated;

create function public.notify_schedule_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    perform public.notify_calendar_members(new.calendar_id, 'schedule_created', new.id, new.title);
  elsif TG_OP = 'DELETE' then
    perform public.notify_calendar_members(old.calendar_id, 'schedule_deleted', old.id, old.title);
  elsif new.calendar_id <> old.calendar_id then
    perform public.notify_calendar_members(old.calendar_id, 'schedule_deleted', old.id, old.title);
    perform public.notify_calendar_members(new.calendar_id, 'schedule_created', new.id, new.title);
  elsif (to_jsonb(new) - array['updated_at', 'updated_by_user_id', 'change_source', 'planner_approval_hash'])
        is distinct from (to_jsonb(old) - array['updated_at', 'updated_by_user_id', 'change_source', 'planner_approval_hash']) then
    perform public.notify_calendar_members(new.calendar_id, 'schedule_updated', new.id, new.title);
  end if;
  return null;
end;
$$;
revoke all on function public.notify_schedule_change() from public, anon, authenticated;
create trigger notify_schedule_change after insert or update or delete on public.schedules
for each row execute function public.notify_schedule_change();

-- Membership RPCs ----------------------------------------------------------------------------
create function public.require_calendar_owner(p_calendar uuid) returns public.calendars
language plpgsql security definer set search_path = '' as $$
declare cal public.calendars;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Row lock serializes concurrent role changes so the last-owner rule cannot be raced.
  select * into cal from public.calendars where id = p_calendar for update;
  if not found or cal.type <> 'shared' then raise exception 'CALENDAR_NOT_FOUND' using errcode = 'P0002'; end if;
  if public.calendar_role(p_calendar) is distinct from 'owner' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return cal;
end;
$$;
revoke all on function public.require_calendar_owner(uuid) from public, anon, authenticated;

create function public.calendar_member_list(p_calendar uuid)
returns table(user_id uuid, role text, display_name text, email text, joined_at timestamptz, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_read_calendar(p_calendar) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return query
    select m.user_id, m.role, public.user_label(m.user_id), u.email::text, m.joined_at, m.user_id = auth.uid()
    from public.calendar_members m join auth.users u on u.id = m.user_id
    where m.calendar_id = p_calendar
    order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end, m.joined_at;
end;
$$;

create function public.invite_calendar_member(p_calendar uuid, p_email text, p_role text, p_days integer default 7)
returns public.calendar_invitations
language plpgsql security definer set search_path = '' as $$
declare
  cal public.calendars;
  addr text := lower(trim(coalesce(p_email, '')));
  invitee uuid;
  result public.calendar_invitations;
begin
  cal := public.require_calendar_owner(p_calendar);
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(addr) > 320 then raise exception 'INVALID_EMAIL' using errcode = '22023'; end if;
  if p_role not in ('editor', 'viewer') or p_days not between 1 and 30 then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  select id into invitee from auth.users where lower(email) = addr;
  if invitee is not null and exists (select 1 from public.calendar_members where calendar_id = p_calendar and user_id = invitee) then
    raise exception 'ALREADY_MEMBER' using errcode = '23505';
  end if;
  insert into public.calendar_invitations(calendar_id, kind, email, role, invited_by, invitee_user_id, expires_at)
  values (p_calendar, 'email', addr, p_role, auth.uid(), invitee, now() + make_interval(days => p_days))
  on conflict (calendar_id, email) where kind = 'email' and status = 'pending' do update
    set role = excluded.role, expires_at = excluded.expires_at, invited_by = excluded.invited_by, created_at = now()
  returning * into result;
  if invitee is not null then
    perform public.notify_user(invitee, 'invite_received', p_calendar, null, auth.uid(),
      jsonb_build_object('calendarName', cal.name, 'calendarColor', cal.color, 'role', p_role, 'invitationId', result.id),
      'invite:' || result.id::text);
  end if;
  return result;
end;
$$;

-- Issues a new link and revokes the previous one, so a leaked link can be cut off by reissuing.
create function public.create_calendar_invite_link(p_calendar uuid, p_role text, p_days integer default 7)
returns table(id uuid, token text, role text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  raw text := encode(extensions.gen_random_bytes(32), 'hex');
  row_id uuid;
  expiry timestamptz := now() + make_interval(days => p_days);
begin
  perform public.require_calendar_owner(p_calendar);
  if p_role not in ('editor', 'viewer') or p_days not between 1 and 30 then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  update public.calendar_invitations i set status = 'revoked', responded_at = now()
  where i.calendar_id = p_calendar and i.kind = 'link' and i.status = 'pending';
  insert into public.calendar_invitations(calendar_id, kind, role, token_hash, invited_by, expires_at)
  values (p_calendar, 'link', p_role, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), auth.uid(), expiry)
  returning calendar_invitations.id into row_id;
  return query select row_id, raw, p_role, expiry;
end;
$$;

create function public.revoke_calendar_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  select calendar_id into target from public.calendar_invitations where id = p_invitation;
  if target is null then raise exception 'NOT_FOUND' using errcode = 'P0002'; end if;
  perform public.require_calendar_owner(target);
  update public.calendar_invitations set status = 'revoked', responded_at = now()
  where id = p_invitation and status = 'pending';
  delete from public.notifications where dedupe_key = 'invite:' || p_invitation::text and read_at is null;
end;
$$;

create function public.invite_link_preview(p_token text)
returns table(calendar_id uuid, calendar_name text, calendar_color text, role text, inviter_name text,
  state text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare inv public.calendar_invitations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into inv from public.calendar_invitations i
  where i.kind = 'link' and i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  if not found then
    return query select null::uuid, null::text, null::text, null::text, null::text, 'invalid'::text, null::timestamptz;
    return;
  end if;
  return query select c.id, c.name, c.color, inv.role, public.user_label(inv.invited_by),
    case when exists (select 1 from public.calendar_members m where m.calendar_id = c.id and m.user_id = auth.uid()) then 'member'
         when inv.status <> 'pending' then 'revoked'
         when inv.expires_at <= now() then 'expired'
         else 'pending' end,
    inv.expires_at
  from public.calendars c where c.id = inv.calendar_id;
end;
$$;

create function public.join_calendar_member(p_calendar uuid, p_role text, p_inviter uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cal public.calendars;
  owner_id uuid;
begin
  select * into cal from public.calendars where id = p_calendar for update;
  insert into public.calendar_members(calendar_id, user_id, role, invited_by)
  values (p_calendar, auth.uid(), p_role, p_inviter) on conflict do nothing;
  -- Accepting by link also settles any email invitation for the same calendar.
  update public.calendar_invitations set status = 'accepted', responded_at = now(), invitee_user_id = auth.uid()
  where calendar_id = p_calendar and kind = 'email' and status = 'pending'
    and email = (select lower(email) from auth.users where id = auth.uid());
  for owner_id in select user_id from public.calendar_members where calendar_id = p_calendar and role = 'owner' loop
    perform public.notify_user(owner_id, 'invite_accepted', p_calendar, null, auth.uid(),
      jsonb_build_object('calendarName', cal.name, 'calendarColor', cal.color, 'role', p_role),
      'invite-accepted:' || p_calendar::text || ':' || auth.uid()::text);
  end loop;
end;
$$;
revoke all on function public.join_calendar_member(uuid, text, uuid) from public, anon, authenticated;

create function public.accept_calendar_invite_link(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.calendar_invitations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into inv from public.calendar_invitations
  where kind = 'link' and token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if not found then raise exception 'INVITE_INVALID' using errcode = 'P0002'; end if;
  if exists (select 1 from public.calendar_members where calendar_id = inv.calendar_id and user_id = auth.uid()) then
    return inv.calendar_id;
  end if;
  if inv.status <> 'pending' then raise exception 'INVITE_REVOKED' using errcode = '22023'; end if;
  if inv.expires_at <= now() then raise exception 'INVITE_EXPIRED' using errcode = '22023'; end if;
  perform public.join_calendar_member(inv.calendar_id, inv.role, inv.invited_by);
  return inv.calendar_id;
end;
$$;

-- Email invitations reach an account only through a confirmed address.
create function public.my_confirmed_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;
revoke all on function public.my_confirmed_email() from public, anon, authenticated;

create function public.claim_calendar_invitations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  addr text := public.my_confirmed_email();
  inv record;
  claimed integer := 0;
begin
  if auth.uid() is null or addr is null then return 0; end if;
  for inv in
    select i.id, i.calendar_id, i.role, i.invited_by, c.name, c.color from public.calendar_invitations i
    join public.calendars c on c.id = i.calendar_id
    where i.kind = 'email' and i.status = 'pending' and i.email = addr and i.expires_at > now()
      and i.invitee_user_id is null
  loop
    update public.calendar_invitations set invitee_user_id = auth.uid() where id = inv.id;
    perform public.notify_user(auth.uid(), 'invite_received', inv.calendar_id, null, inv.invited_by,
      jsonb_build_object('calendarName', inv.name, 'calendarColor', inv.color, 'role', inv.role, 'invitationId', inv.id),
      'invite:' || inv.id::text);
    claimed := claimed + 1;
  end loop;
  return claimed;
end;
$$;

create function public.my_calendar_invitations()
returns table(id uuid, calendar_id uuid, calendar_name text, calendar_color text, role text,
  inviter_name text, expires_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select i.id, i.calendar_id, c.name, c.color, i.role, public.user_label(i.invited_by), i.expires_at, i.created_at
  from public.calendar_invitations i join public.calendars c on c.id = i.calendar_id
  where i.kind = 'email' and i.status = 'pending' and i.expires_at > now()
    and i.email = public.my_confirmed_email()
    and not exists (select 1 from public.calendar_members m where m.calendar_id = i.calendar_id and m.user_id = auth.uid())
  order by i.created_at desc;
$$;

create function public.respond_calendar_invitation(p_invitation uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.calendar_invitations;
  cal public.calendars;
  owner_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into inv from public.calendar_invitations where id = p_invitation and kind = 'email' for update;
  if not found or inv.email is distinct from public.my_confirmed_email() then
    raise exception 'INVITE_INVALID' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then raise exception 'INVITE_REVOKED' using errcode = '22023'; end if;
  if inv.expires_at <= now() then raise exception 'INVITE_EXPIRED' using errcode = '22023'; end if;
  delete from public.notifications where user_id = auth.uid() and dedupe_key = 'invite:' || inv.id::text;
  if p_accept then
    perform public.join_calendar_member(inv.calendar_id, inv.role, inv.invited_by);
  else
    update public.calendar_invitations set status = 'declined', responded_at = now(), invitee_user_id = auth.uid()
    where id = inv.id;
    select * into cal from public.calendars where id = inv.calendar_id;
    for owner_id in select user_id from public.calendar_members where calendar_id = inv.calendar_id and role = 'owner' loop
      perform public.notify_user(owner_id, 'invite_declined', inv.calendar_id, null, auth.uid(),
        jsonb_build_object('calendarName', cal.name, 'calendarColor', cal.color, 'email', inv.email),
        'invite-declined:' || inv.id::text);
    end loop;
  end if;
  return inv.calendar_id;
end;
$$;

create function public.set_calendar_member_role(p_calendar uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cal public.calendars;
  previous text;
begin
  cal := public.require_calendar_owner(p_calendar);
  if p_role not in ('owner', 'editor', 'viewer') then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  select role into previous from public.calendar_members where calendar_id = p_calendar and user_id = p_user;
  if previous is null then raise exception 'NOT_MEMBER' using errcode = 'P0002'; end if;
  if previous = 'owner' and p_role <> 'owner' and (select count(*) from public.calendar_members
     where calendar_id = p_calendar and role = 'owner') <= 1 then
    raise exception 'LAST_OWNER' using errcode = '42501';
  end if;
  update public.calendar_members set role = p_role, updated_at = now() where calendar_id = p_calendar and user_id = p_user;
  if p_user = cal.owner_user_id and p_role <> 'owner' then
    perform set_config('blanky.owner_change', 'on', true);
    update public.calendars set owner_user_id = (select user_id from public.calendar_members
      where calendar_id = p_calendar and role = 'owner' order by joined_at limit 1) where id = p_calendar;
    perform set_config('blanky.owner_change', 'off', true);
  end if;
  if previous <> p_role then
    perform public.notify_user(p_user, 'role_changed', p_calendar, null, auth.uid(),
      jsonb_build_object('calendarName', cal.name, 'calendarColor', cal.color, 'role', p_role),
      'role:' || p_calendar::text);
  end if;
end;
$$;

create function public.transfer_calendar_ownership(p_calendar uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare cal public.calendars;
begin
  cal := public.require_calendar_owner(p_calendar);
  if p_user = auth.uid() then raise exception 'INVALID_INPUT' using errcode = '22023'; end if;
  if not exists (select 1 from public.calendar_members where calendar_id = p_calendar and user_id = p_user) then
    raise exception 'NOT_MEMBER' using errcode = 'P0002';
  end if;
  update public.calendar_members set role = 'owner', updated_at = now() where calendar_id = p_calendar and user_id = p_user;
  update public.calendar_members set role = 'editor', updated_at = now() where calendar_id = p_calendar and user_id = auth.uid();
  perform set_config('blanky.owner_change', 'on', true);
  update public.calendars set owner_user_id = p_user where id = p_calendar;
  perform set_config('blanky.owner_change', 'off', true);
  perform public.notify_user(p_user, 'ownership_transferred', p_calendar, null, auth.uid(),
    jsonb_build_object('calendarName', cal.name, 'calendarColor', cal.color, 'role', 'owner'),
    'owner:' || p_calendar::text);
end;
$$;

-- Owners remove others; anyone may leave. The last owner must transfer or delete the calendar first.
create function public.remove_calendar_member(p_calendar uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cal public.calendars;
  target_role text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into cal from public.calendars where id = p_calendar for update;
  if not found or cal.type <> 'shared' then raise exception 'CALENDAR_NOT_FOUND' using errcode = 'P0002'; end if;
  if p_user <> auth.uid() and public.calendar_role(p_calendar) is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select role into target_role from public.calendar_members where calendar_id = p_calendar and user_id = p_user;
  if target_role is null then raise exception 'NOT_MEMBER' using errcode = 'P0002'; end if;
  if target_role = 'owner' and (select count(*) from public.calendar_members
     where calendar_id = p_calendar and role = 'owner') <= 1 then
    raise exception 'LAST_OWNER' using errcode = '42501';
  end if;
  delete from public.calendar_members where calendar_id = p_calendar and user_id = p_user;
  if p_user = cal.owner_user_id then
    perform set_config('blanky.owner_change', 'on', true);
    update public.calendars set owner_user_id = (select user_id from public.calendar_members
      where calendar_id = p_calendar and role = 'owner' order by joined_at limit 1) where id = p_calendar;
    perform set_config('blanky.owner_change', 'off', true);
  end if;
  -- Unread notices about this calendar would otherwise keep showing its titles.
  delete from public.notifications where user_id = p_user and calendar_id = p_calendar;
  if p_user <> auth.uid() then
    perform public.notify_user(p_user, 'member_removed', null, null, auth.uid(),
      jsonb_build_object('calendarName', cal.name, 'calendarColor', cal.color),
      'removed:' || p_calendar::text);
  end if;
end;
$$;

revoke all on function
  public.calendar_member_list(uuid), public.invite_calendar_member(uuid, text, text, integer),
  public.create_calendar_invite_link(uuid, text, integer), public.revoke_calendar_invitation(uuid),
  public.invite_link_preview(text), public.accept_calendar_invite_link(text), public.claim_calendar_invitations(),
  public.my_calendar_invitations(), public.respond_calendar_invitation(uuid, boolean),
  public.set_calendar_member_role(uuid, uuid, text), public.transfer_calendar_ownership(uuid, uuid),
  public.remove_calendar_member(uuid, uuid)
from public, anon;
grant execute on function
  public.calendar_member_list(uuid), public.invite_calendar_member(uuid, text, text, integer),
  public.create_calendar_invite_link(uuid, text, integer), public.revoke_calendar_invitation(uuid),
  public.invite_link_preview(text), public.accept_calendar_invite_link(text), public.claim_calendar_invitations(),
  public.my_calendar_invitations(), public.respond_calendar_invitation(uuid, boolean),
  public.set_calendar_member_role(uuid, uuid, text), public.transfer_calendar_ownership(uuid, uuid),
  public.remove_calendar_member(uuid, uuid)
to authenticated;

-- Account deletion: shared calendars outlive a departing owner, and their rows outlive their author.
create function public.release_shared_calendars() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cal public.calendars;
  heir uuid;
begin
  perform set_config('blanky.owner_change', 'on', true);
  for cal in select c.* from public.calendars c join public.calendar_members m on m.calendar_id = c.id
    where c.type = 'shared' and m.user_id = old.id loop
    select user_id into heir from public.calendar_members
    where calendar_id = cal.id and user_id <> old.id
    order by case role when 'owner' then 0 when 'editor' then 1 else 2 end, joined_at limit 1;
    if heir is null then continue; end if;  -- Sole member: the calendar goes with the account.
    if not exists (select 1 from public.calendar_members where calendar_id = cal.id and user_id <> old.id and role = 'owner') then
      update public.calendar_members set role = 'owner', updated_at = now() where calendar_id = cal.id and user_id = heir;
    else
      select user_id into heir from public.calendar_members
      where calendar_id = cal.id and user_id <> old.id and role = 'owner' order by joined_at limit 1;
    end if;
    if cal.owner_user_id = old.id then update public.calendars set owner_user_id = heir where id = cal.id; end if;
    update public.schedules set user_id = heir where calendar_id = cal.id and user_id = old.id;
  end loop;
  perform set_config('blanky.owner_change', 'off', true);
  return old;
end;
$$;
revoke all on function public.release_shared_calendars() from public, anon, authenticated;
create trigger release_shared_calendars before delete on auth.users
for each row execute function public.release_shared_calendars();

-- Realtime -----------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
alter publication supabase_realtime add table public.schedules, public.calendars, public.calendar_members,
  public.calendar_invitations, public.notifications;

commit;
