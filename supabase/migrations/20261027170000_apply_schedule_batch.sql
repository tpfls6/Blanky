-- Atomic local deletes for AI apply. Google API stays outside this transaction.
begin;

create table public.schedule_batch_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  status text not null check (status in ('applied')),
  deleted_ids uuid[] not null,
  google_status text not null check (google_status in ('idle', 'pending', 'failed')),
  created_at timestamptz not null default now()
);

create table public.google_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid references public.schedule_batch_jobs(id) on delete cascade,
  schedule_id uuid not null,
  google_event_id text,
  action text not null check (action in ('delete_google')),
  status text not null check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, schedule_id, action)
);

alter table public.schedule_batch_jobs enable row level security;
alter table public.google_sync_jobs enable row level security;

create policy schedule_batch_jobs_select on public.schedule_batch_jobs
  for select to authenticated using (user_id = auth.uid());
create policy google_sync_jobs_select on public.google_sync_jobs
  for select to authenticated using (user_id = auth.uid());

grant select on public.schedule_batch_jobs, public.google_sync_jobs to authenticated;
revoke insert, update, delete on public.schedule_batch_jobs, public.google_sync_jobs from public, anon, authenticated;
grant all on public.schedule_batch_jobs, public.google_sync_jobs to postgres, service_role;

create function public.apply_schedule_batch(p_key uuid, p_deletes uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request_hash text;
  existing public.schedule_batch_jobs;
  sid uuid;
  stored public.schedules;
  cal_type text;
  link_origin text;
  google_event text;
  deleted uuid[] := '{}';
  pending_n integer := 0;
  remaining integer;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_key is null or p_deletes is null or cardinality(p_deletes) < 1 or cardinality(p_deletes) > 200 then
    raise exception 'INVALID_INPUT';
  end if;
  if (select count(distinct x) from unnest(p_deletes) as x) <> cardinality(p_deletes) then
    raise exception 'INVALID_INPUT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('blanky-batch:' || uid::text, 0));

  request_hash := md5(array_to_string(array(select unnest(p_deletes)::text order by 1), ','));

  select * into existing from public.schedule_batch_jobs where id = p_key;
  if found then
    if existing.user_id is distinct from uid or existing.request_hash is distinct from request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'status', 'unchanged',
      'deletedIds', to_jsonb(existing.deleted_ids),
      'google', existing.google_status
    );
  end if;

  foreach sid in array p_deletes loop
    select * into stored from public.schedules where id = sid;
    if not found then raise exception 'NOT_FOUND'; end if;
    if stored.user_id is distinct from uid then raise exception 'FORBIDDEN'; end if;
    select type into cal_type from public.calendars where id = stored.calendar_id;
    if stored.change_source = 'calendar_sync' or cal_type = 'external' then
      raise exception 'GOOGLE_PROTECTED';
    end if;
    select origin into link_origin from public.google_calendar_event_links where schedule_id = sid;
    if found and link_origin = 'google' then raise exception 'GOOGLE_PROTECTED'; end if;
  end loop;

  foreach sid in array p_deletes loop
    delete from public.schedules where id = sid and user_id = uid;
    if not found then raise exception 'NOT_FOUND'; end if;
    deleted := array_append(deleted, sid);
  end loop;

  select count(*) into remaining from public.schedules where id = any (p_deletes) and user_id = uid;
  if remaining <> 0 then raise exception 'BATCH_INCOMPLETE'; end if;

  foreach sid in array p_deletes loop
    select origin, google_event_id into link_origin, google_event
    from public.google_calendar_event_links where schedule_id = sid;
    if found and link_origin = 'blanky' then
      pending_n := pending_n + 1;
    end if;
  end loop;

  insert into public.schedule_batch_jobs(id, user_id, request_hash, status, deleted_ids, google_status)
  values (
    p_key,
    uid,
    request_hash,
    'applied',
    deleted,
    case when pending_n > 0 then 'pending' else 'idle' end
  );

  foreach sid in array p_deletes loop
    select origin, google_event_id into link_origin, google_event
    from public.google_calendar_event_links where schedule_id = sid;
    if found and link_origin = 'blanky' then
      insert into public.google_sync_jobs(user_id, batch_id, schedule_id, google_event_id, action, status)
      values (uid, p_key, sid, google_event, 'delete_google', 'pending')
      on conflict (user_id, schedule_id, action) do nothing;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'applied',
    'deletedIds', to_jsonb(deleted),
    'google', case when pending_n > 0 then 'pending' else 'idle' end
  );
end;
$$;

create function public.retry_google_sync_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  job public.google_sync_jobs;
  done_n integer := 0;
  pending_n integer := 0;
  failed_n integer := 0;
  next_status text;
begin
  if uid is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('blanky-batch:' || uid::text, 0));
  for job in select * from public.google_sync_jobs where user_id = uid and status = 'pending' loop
    if not exists (
      select 1 from public.google_calendar_event_links
      where schedule_id = job.schedule_id
        and google_event_id is not distinct from job.google_event_id
    ) then
      next_status := 'done';
      done_n := done_n + 1;
    elsif job.attempts >= 4 then
      next_status := 'failed';
      failed_n := failed_n + 1;
    else
      next_status := 'pending';
      pending_n := pending_n + 1;
    end if;
    update public.google_sync_jobs
      set status = next_status,
          attempts = job.attempts + 1,
          last_error = case when next_status = 'pending' then 'GOOGLE_PENDING' when next_status = 'failed' then 'GOOGLE_RETRY_EXHAUSTED' else null end
      where id = job.id;
  end loop;

  update public.schedule_batch_jobs b
    set google_status = case
      when exists (select 1 from public.google_sync_jobs j where j.batch_id = b.id and j.status = 'failed') then 'failed'
      when exists (select 1 from public.google_sync_jobs j where j.batch_id = b.id and j.status = 'pending') then 'pending'
      else 'idle'
    end
    where b.user_id = uid and b.google_status <> 'idle';

  return jsonb_build_object('done', done_n, 'pending', pending_n, 'failed', failed_n);
end;
$$;

revoke all on function public.apply_schedule_batch(uuid, uuid[]) from public, anon;
revoke all on function public.retry_google_sync_jobs() from public, anon;
grant execute on function public.apply_schedule_batch(uuid, uuid[]) to authenticated;
grant execute on function public.retry_google_sync_jobs() to authenticated;

commit;
