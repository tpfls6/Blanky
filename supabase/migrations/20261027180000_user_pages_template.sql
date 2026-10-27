alter table public.user_pages
  add column if not exists template text check (template is null or template in ('diary', 'reading', 'memo'));

alter table public.user_pages
  add column if not exists field_labels jsonb not null default '{}'::jsonb;
