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
