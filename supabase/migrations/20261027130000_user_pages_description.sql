alter table public.user_pages
  add column if not exists description text not null default '';
