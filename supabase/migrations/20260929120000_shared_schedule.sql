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
