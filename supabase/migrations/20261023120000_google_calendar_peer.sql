-- Google Calendar is a peer store. Mapping lives here, not on schedules.
begin;

alter table public.schedules drop constraint schedules_change_source_check;
alter table public.schedules add constraint schedules_change_source_check
  check (change_source in ('manual', 'ai_chat', 'calendar_sync'));

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null check (status in ('awaiting_consent', 'connected', 'ready', 'needs_reauth')),
  oauth_state_hash text,
  origin text,
  google_sub text,
  account_email text,
  refresh_token text,
  access_token text,
  access_token_expires_at timestamptz,
  google_calendar_id text,
  blanky_calendar_id uuid references public.calendars(id) on delete restrict,
  calendar_summary text,
  calendar_timezone text,
  next_sync_token text,
  auto_sync boolean not null default false,
  last_sync jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'awaiting_consent'
    or (
      oauth_state_hash is not null
      and origin is not null
      and refresh_token is null
      and access_token is null
      and access_token_expires_at is null
      and google_sub is null
      and google_calendar_id is null
      and blanky_calendar_id is null
    )
  ),
  check (
    status not in ('connected', 'ready')
    or (
      google_sub is not null
      and account_email is not null
      and refresh_token is not null
      and access_token is not null
      and access_token_expires_at is not null
    )
  ),
  check (
    status not in ('ready', 'needs_reauth')
    or (
      google_sub is not null
      and account_email is not null
      and google_calendar_id is not null
      and blanky_calendar_id is not null
      and calendar_summary is not null
      and calendar_timezone is not null
    )
  ),
  check (
    status <> 'needs_reauth'
    or (refresh_token is null and access_token is null and access_token_expires_at is null)
  ),
  unique (oauth_state_hash)
);

-- schedule_id is not a foreign key so a UI delete can leave an orphan for delete_google.
create table public.google_calendar_event_links (
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  schedule_id uuid not null,
  google_event_id text not null,
  etag text not null,
  applied_blanky_updated_at timestamptz not null,
  origin text not null check (origin in ('blanky', 'google')),
  recurrence_mirror text not null default 'mirrored' check (recurrence_mirror = 'mirrored'),
  primary key (connection_id, google_event_id),
  unique (schedule_id)
);

create function public.guard_bound_external_calendar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.google_calendar_connections
    where blanky_calendar_id = old.id
  ) then
    raise exception 'Bound Google Calendar cannot be deleted' using errcode = '23503';
  end if;
  return old;
end;
$$;

create trigger guard_bound_external_calendar before delete on public.calendars
for each row execute function public.guard_bound_external_calendar();

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_event_links enable row level security;

grant all on table public.google_calendar_connections to postgres, service_role;
grant all on table public.google_calendar_event_links to postgres, service_role;
revoke all on table public.google_calendar_connections from public, anon, authenticated;
revoke all on table public.google_calendar_event_links from public, anon, authenticated;

commit;
