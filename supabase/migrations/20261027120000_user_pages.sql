-- User-built pages. blocks is the document tree. Widget blocks store type only.
-- Apply with the Supabase CLI: supabase db push

create table public.user_pages (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  icon text not null default 'StickyNote',
  sort integer not null default 0,
  kind text not null default 'page' check (kind in ('page', 'template')),
  schema_version integer not null default 1,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_pages_user_idx on public.user_pages (user_id, kind, sort, updated_at desc);

alter table public.user_pages enable row level security;

create policy "user_pages_owner" on public.user_pages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
