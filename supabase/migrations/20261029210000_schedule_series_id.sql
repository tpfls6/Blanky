-- Rows split off a recurring series ("this occurrence only" / "from this one on") point at the
-- original row so the app can show them as one series. No foreign key: the original may be deleted
-- while its later parts live on. Null for every row that was never split.
alter table public.schedules add column if not exists series_id text;
create index if not exists schedules_series_id_idx on public.schedules (user_id, series_id) where series_id is not null;
