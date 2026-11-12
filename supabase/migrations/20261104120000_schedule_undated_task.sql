-- A task saved without a date. `date` keeps the day it was saved (the column stays not null),
-- but undated tasks are listed only as to-dos, never on a calendar day.
alter table public.schedules add column if not exists undated boolean not null default false;
alter table public.schedules drop constraint if exists schedules_undated_task;
alter table public.schedules add constraint schedules_undated_task check (
  not undated or (kind = 'task' and repeat_rule = 'none' and start_time is null and due_date is null)
);
