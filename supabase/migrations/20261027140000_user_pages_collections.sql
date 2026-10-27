alter table public.user_pages
  add column if not exists collections jsonb not null default '[]'::jsonb;
