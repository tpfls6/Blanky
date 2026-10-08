-- Phase 1: additive migration. Keep legacy user_id and wall-clock schedule fields.
begin;

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '내 캘린더' check (length(trim(name)) > 0),
  description text not null default '',
  color text not null default '#3A62B0',
  icon text not null default 'Calendar',
  type text not null default 'personal' check (type in ('personal', 'shared', 'external')),
  is_default_personal boolean not null default false,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default_personal or type = 'personal'),
  unique (id, owner_user_id)
);
create unique index calendars_default_personal_owner_idx
  on public.calendars(owner_user_id) where is_default_personal;
alter table public.calendars enable row level security;
-- Shared/external creation is deliberately disabled until membership RLS lands.
create policy calendars_select on public.calendars for select to authenticated
  using (owner_user_id = auth.uid());
create policy calendars_insert on public.calendars for insert to authenticated
  with check (owner_user_id = auth.uid() and type = 'personal' and not is_default_personal);
create policy calendars_update on public.calendars for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid() and type = 'personal');
create policy calendars_delete on public.calendars for delete to authenticated
  using (owner_user_id = auth.uid() and not is_default_personal);
grant select, insert, update, delete on public.calendars to authenticated;

create function public.guard_personal_calendar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.owner_user_id <> old.owner_user_id or new.type <> old.type
     or new.is_default_personal <> old.is_default_personal) then
    raise exception 'Calendar identity cannot be changed' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger guard_personal_calendar before insert or update on public.calendars
for each row execute function public.guard_personal_calendar();

create function public.create_user_personal_calendar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.calendars(owner_user_id, is_default_personal)
  values (new.id, true) on conflict (owner_user_id) where is_default_personal do nothing;
  return new;
end;
$$;
revoke all on function public.create_user_personal_calendar() from public, anon, authenticated;
create trigger create_user_personal_calendar after insert on auth.users
for each row execute function public.create_user_personal_calendar();

-- Freeze writes while backfilling and validating; failures roll the entire migration back.
lock table public.schedules in access exclusive mode;
alter table public.schedules add column calendar_id uuid;
alter table public.schedules add column created_by_user_id uuid references auth.users(id) on delete set null;
insert into public.calendars(owner_user_id, is_default_personal, timezone)
select u.id, true, coalesce(p.timezone, 'Asia/Seoul') from auth.users u
left join public.user_preferences p on p.user_id = u.id
on conflict (owner_user_id) where is_default_personal do nothing;
update public.schedules s set calendar_id = c.id, created_by_user_id = s.user_id
from public.calendars c where c.owner_user_id = s.user_id and c.is_default_personal;
do $$ begin
  if exists (select 1 from public.schedules where calendar_id is null or created_by_user_id is null) then
    raise exception 'Personal calendar backfill incomplete';
  end if;
end $$;
alter table public.schedules alter column calendar_id set not null;
-- Phase 2 replaces this owner constraint with membership authorization.
alter table public.schedules add constraint schedules_calendar_owner_fk
  foreign key (calendar_id, user_id) references public.calendars(id, owner_user_id) on delete no action;
create index schedules_calendar_date_idx on public.schedules(calendar_id, date);

create function public.assign_schedule_calendar() returns trigger
language plpgsql set search_path = '' as $$
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
  elsif new.user_id <> old.user_id or new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Schedule author cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger assign_schedule_calendar before insert or update on public.schedules
for each row execute function public.assign_schedule_calendar();
commit;
