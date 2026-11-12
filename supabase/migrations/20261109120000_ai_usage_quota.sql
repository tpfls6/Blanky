-- Per-user daily AI usage and quota (P0 free launch).
-- Written by the parse-schedule / plan-tasks Edge Functions through service-role RPCs only.
-- Holds counts, tokens and estimated cost: no input text.
-- NOT APPLIED automatically: apply before deploying the Edge Functions that call consume_ai_call,
-- otherwise those functions fail closed (AI assist off, rule parsing still works).

create table if not exists public.ai_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  calls integer not null default 0 check (calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_usage_daily enable row level security;

-- Users may read their own usage; there are no insert/update/delete policies.
drop policy if exists "ai_usage_daily_owner_read" on public.ai_usage_daily;
create policy "ai_usage_daily_owner_read" on public.ai_usage_daily
  for select to authenticated using (user_id = auth.uid());

revoke all on table public.ai_usage_daily from anon, authenticated;
grant select on table public.ai_usage_daily to authenticated;

-- Atomically takes one call from today's budget. The row lock taken by UPDATE serialises
-- concurrent requests, so parallel calls cannot overshoot the limit.
create or replace function public.consume_ai_call(
  p_user_id uuid,
  p_usage_date date,
  p_call_limit integer,
  p_token_limit bigint
) returns table (allowed boolean, calls integer, tokens bigint)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_calls integer;
  v_tokens bigint;
begin
  if p_user_id is null or p_usage_date is null or p_call_limit is null or p_call_limit < 0 or p_token_limit is null or p_token_limit < 0 then
    raise exception 'invalid quota arguments';
  end if;

  insert into public.ai_usage_daily (user_id, usage_date)
  values (p_user_id, p_usage_date)
  on conflict (user_id, usage_date) do nothing;

  update public.ai_usage_daily as usage
     set calls = usage.calls + 1,
         updated_at = now()
   where usage.user_id = p_user_id
     and usage.usage_date = p_usage_date
     and usage.calls < p_call_limit
     and (p_token_limit = 0 or usage.input_tokens + usage.output_tokens < p_token_limit)
  returning usage.calls, usage.input_tokens + usage.output_tokens into v_calls, v_tokens;

  if found then
    return query select true, v_calls, v_tokens;
    return;
  end if;

  return query
    select false, usage.calls, usage.input_tokens + usage.output_tokens
      from public.ai_usage_daily as usage
     where usage.user_id = p_user_id and usage.usage_date = p_usage_date;
end;
$$;

-- Adds measured tokens and estimated cost; negative values are ignored so totals only grow.
create or replace function public.record_ai_usage(
  p_user_id uuid,
  p_usage_date date,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_micro_usd bigint
) returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage_daily
     set input_tokens = input_tokens + greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = output_tokens + greatest(coalesce(p_output_tokens, 0), 0),
         cost_micro_usd = cost_micro_usd + greatest(coalesce(p_cost_micro_usd, 0), 0),
         updated_at = now()
   where user_id = p_user_id and usage_date = p_usage_date;
$$;

revoke all on function public.consume_ai_call(uuid, date, integer, bigint) from public, anon, authenticated;
revoke all on function public.record_ai_usage(uuid, date, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.consume_ai_call(uuid, date, integer, bigint) to service_role;
grant execute on function public.record_ai_usage(uuid, date, bigint, bigint, bigint) to service_role;
