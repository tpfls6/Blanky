-- Extend the existing schedule store and history, including tasks.
alter table public.schedules
  add column kind text not null default 'event' check (kind in ('event', 'task')),
  add column due_date date,
  add column end_date date,
  add column all_day boolean not null default false,
  add column repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly', 'monthly')),
  add column change_source text not null default 'manual' check (change_source in ('manual', 'ai_chat'));
update public.schedules set all_day = true where start_time is null;
alter table public.schedule_changes
  add column entity_type text not null default 'event',
  add column before_data jsonb,
  add column after_data jsonb,
  add column source text not null default 'manual';

create function public.record_schedule_activity() returns trigger
language plpgsql security invoker set search_path = public as $$
declare row_data public.schedules;
begin
  if TG_OP = 'DELETE' then row_data := OLD; else row_data := NEW; end if;
  insert into public.schedule_changes(schedule_id, user_id, action, entity_type, before_data, after_data, source)
  values (row_data.id, row_data.user_id,
    case when TG_OP = 'INSERT' then 'created' when TG_OP = 'DELETE' then 'deleted'
      when NEW.status = 'done' and OLD.status <> 'done' then 'completed' else 'updated' end,
    row_data.kind,
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) else null end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) else null end,
    case when TG_OP = 'DELETE' then 'manual' else NEW.change_source end);
  return row_data;
end;
$$;
create trigger record_schedule_activity after insert or update or delete on public.schedules
for each row execute function public.record_schedule_activity();
