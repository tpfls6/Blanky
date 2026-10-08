-- Blanky initial setup for an empty public application schema.
-- Run once in the configured Supabase project SQL Editor. No DROP or data reset.
-- All migrations are applied atomically; existing Blanky tables abort this script.
begin;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name in ('categories','schedules','schedule_changes','user_preferences','device_push_tokens','custom_record_types','custom_records','calendars','classification_feedback','user_classification_rules')) then
    raise exception 'Existing Blanky tables found. Apply only missing migrations instead of this initial setup script.';
  end if;
end;
$$;

-- Migration: 20260929120000_shared_schedule.sql
-- Shared schedule schema for the web app and a future React Native client.
-- Apply with the Supabase CLI: supabase db push

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now()
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  date date not null,
  start_time time,
  end_time time,
  duration_minutes integer,
  category_id uuid references public.categories (id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  source_text text,
  ai_confidence double precision,
  ai_model text,
  ai_parsed_at timestamptz,
  reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_changes (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'completed', 'deleted')),
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  day_start_time time not null default '09:00',
  day_end_time time not null default '22:00',
  default_duration_minutes integer not null default 30,
  locale text not null default 'ko',
  notifications_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  token text not null,
  created_at timestamptz not null default now(),
  unique (user_id, platform, token)
);

create index schedules_user_date_idx on public.schedules (user_id, date);
create index schedule_changes_user_created_idx on public.schedule_changes (user_id, created_at desc);

alter table public.categories enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_changes enable row level security;
alter table public.user_preferences enable row level security;
alter table public.device_push_tokens enable row level security;

create policy "categories_owner" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "schedules_owner" on public.schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "schedule_changes_owner" on public.schedule_changes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_preferences_owner" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "device_push_tokens_owner" on public.device_push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Migration: 20261001120000_custom_records.sql
-- Custom record page templates. schema is the block tree (jsonb).
-- Apply with the Supabase CLI: supabase db push

create table public.custom_record_types (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default 'StickyNote',
  color text not null,
  description text not null default '',
  schema_version integer not null default 1,
  version integer not null default 1,
  schema jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.custom_records (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  record_type_id uuid not null references public.custom_record_types (id) on delete cascade,
  title text not null default '',
  template_version integer not null default 1,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custom_record_types_user_idx on public.custom_record_types (user_id, updated_at desc);
create index custom_records_type_idx on public.custom_records (record_type_id, created_at desc);

alter table public.custom_record_types enable row level security;
alter table public.custom_records enable row level security;

create policy "custom_record_types_owner" on public.custom_record_types
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "custom_records_owner" on public.custom_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Migration: 20261001143000_category_tree_learning.sql
-- Category tree, preference fields, and classification learning.
-- values stays jsonb. Add an expression index when a field is filtered often.

alter table public.categories
  add column parent_id uuid references public.categories (id) on delete cascade,
  add column icon text,
  add column sort_order integer not null default 0,
  add column updated_at timestamptz not null default now();

create index categories_user_parent_idx on public.categories (user_id, parent_id, sort_order);

alter table public.user_preferences
  add column theme text not null default 'light',
  add column accent text not null default 'blue',
  add column schedule_default_view text not null default 'all',
  add column week_starts_on smallint not null default 0 check (week_starts_on in (0, 1)),
  add column auto_classification boolean not null default true,
  add column auto_save_after_classification boolean not null default false,
  add column settings jsonb not null default '{}'::jsonb;

alter table public.custom_record_types
  alter column id set default gen_random_uuid();

alter table public.custom_records
  alter column id set default gen_random_uuid();

alter table public.custom_record_types
  add constraint custom_record_types_schema_object check (jsonb_typeof(schema) = 'object');

comment on column public.custom_records.values is
  'Dynamic field values. Add an expression index when a field is filtered often.';

create table public.classification_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  input_text text not null,
  predicted_type text check (predicted_type is null or predicted_type in ('event', 'task')),
  corrected_type text check (corrected_type is null or corrected_type in ('event', 'task')),
  predicted_category_id uuid,
  corrected_category_id uuid,
  field_corrections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index classification_feedback_user_idx
  on public.classification_feedback (user_id, created_at desc);

create table public.user_classification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pattern text not null,
  target_type text check (target_type is null or target_type in ('event', 'task')),
  category_id uuid references public.categories (id) on delete set null,
  weight double precision not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pattern)
);

alter table public.classification_feedback enable row level security;
alter table public.user_classification_rules enable row level security;

create policy "classification_feedback_owner" on public.classification_feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_classification_rules_owner" on public.user_classification_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- Migration: 20261001160000_personal_calendars.sql
-- Phase 1: additive migration. Keep legacy user_id and wall-clock schedule fields.

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


-- Migration: 20261007120000_ai_activity.sql
-- Extend the existing schedule store and history, including tasks.
alter table public.schedules
  add column kind text not null default 'event' check (kind in ('event', 'task')),
  add column due_date date,
  add column end_date date,
  add column all_day boolean not null default false,
  add column repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly', 'monthly')),
  add column change_source text not null default 'manual' check (change_source in ('manual', 'ai_chat'));
update public.schedules set all_day = true where start_time is null;
alter table public.schedule_changes
  add column entity_type text not null default 'event',
  add column before_data jsonb,
  add column after_data jsonb,
  add column source text not null default 'manual';

create function public.record_schedule_activity() returns trigger
language plpgsql security invoker set search_path = public as $$
declare row_data public.schedules;
begin
  if TG_OP = 'DELETE' then row_data := OLD; else row_data := NEW; end if;
  insert into public.schedule_changes(schedule_id, user_id, action, entity_type, before_data, after_data, source)
  values (row_data.id, row_data.user_id,
    case when TG_OP = 'INSERT' then 'created' when TG_OP = 'DELETE' then 'deleted'
      when NEW.status = 'done' and OLD.status <> 'done' then 'completed' else 'updated' end,
    row_data.kind,
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end,
    case when TG_OP = 'DELETE' then 'manual' else NEW.change_source end);
  return row_data;
end;
$$;
create trigger record_schedule_activity after insert or update or delete on public.schedules
for each row execute function public.record_schedule_activity();


grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories, public.schedules, public.schedule_changes, public.user_preferences, public.device_push_tokens, public.custom_record_types, public.custom_records, public.calendars, public.classification_feedback, public.user_classification_rules to authenticated;
notify pgrst, 'reload schema';
commit;
