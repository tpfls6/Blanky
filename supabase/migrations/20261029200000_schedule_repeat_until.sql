-- Optional end date for a recurring series. Null keeps the existing "repeat forever" behavior.
alter table public.schedules add column if not exists repeat_until date;
alter table public.schedules drop constraint if exists schedules_repeat_until_valid;
alter table public.schedules add constraint schedules_repeat_until_valid check (
  repeat_until is null or (repeat_rule <> 'none' and repeat_until >= date)
);
