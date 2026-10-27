-- Additive: existing weekly schedules keep their anchor weekday. Existing RLS/history triggers remain.
alter table public.schedules add column if not exists repeat_days integer[] not null default '{}';
alter table public.schedules add constraint schedules_repeat_days_valid check (
  cardinality(repeat_days) <= 7
  and repeat_days <@ array[1,2,3,4,5,6,7]
  and array_position(repeat_days, null) is null
  and (repeat_rule = 'weekly' or cardinality(repeat_days) = 0)
);
