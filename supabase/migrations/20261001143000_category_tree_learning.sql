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
