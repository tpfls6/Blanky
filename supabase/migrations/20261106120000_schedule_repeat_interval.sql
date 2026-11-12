-- Custom repeats ("every 3 days", "every other week"): the rule fires every `repeat_interval` days, weeks or months,
-- counted from the row's `date`. Existing rows default to 1, which is the previous behavior.
alter table public.schedules add column if not exists repeat_interval smallint not null default 1;
alter table public.schedules drop constraint if exists schedules_repeat_interval_valid;
alter table public.schedules add constraint schedules_repeat_interval_valid check (
  repeat_interval between 1 and 99 and (repeat_rule <> 'none' or repeat_interval = 1)
);
