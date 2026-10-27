-- Custom template marketplace. Listings are public snapshots. Pages stay private.
-- Apply with the Supabase CLI: supabase db push

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table public.template_listings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references auth.users (id) on delete cascade,
  creator_name text not null default 'Creator',
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 2000),
  thumbnail_url text not null default '',
  gallery text[] not null default '{}',
  category text not null default 'free',
  tags text[] not null default '{}',
  language text not null default 'ko' check (language in ('ko', 'en')),
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'rejected', 'unlisted', 'archived')),
  current_version integer not null default 1,
  current_version_id uuid,
  source_page_id uuid,
  install_count integer not null default 0,
  reject_reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.template_listings (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (listing_id, version)
);

create table public.template_installs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.template_listings (id) on delete cascade,
  version_id uuid not null references public.template_versions (id) on delete restrict,
  page_id uuid not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create table public.template_favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.template_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.template_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.template_listings (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (length(trim(reason)) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

create index template_listings_store_idx on public.template_listings (status, language, created_at desc);
create index template_listings_popular_idx on public.template_listings (status, install_count desc, created_at desc);
create index template_listings_category_idx on public.template_listings (status, category, created_at desc);
create index template_listings_creator_idx on public.template_listings (creator_id, updated_at desc);
create index template_listings_search_idx on public.template_listings using gin (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '')));
create index template_installs_user_idx on public.template_installs (user_id, created_at desc);
create index template_installs_listing_idx on public.template_installs (listing_id, user_id);

alter table public.app_admins enable row level security;
alter table public.template_listings enable row level security;
alter table public.template_versions enable row level security;
alter table public.template_installs enable row level security;
alter table public.template_favorites enable row level security;
alter table public.template_reports enable row level security;

create function public.is_blanky_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create function public.template_visible(p_status text, p_creator uuid) returns boolean language sql stable as $$
  select
    p_status in ('published', 'unlisted')
    or p_creator = auth.uid()
    or public.is_blanky_admin();
$$;

create policy listings_read on public.template_listings for select to authenticated
  using (status = 'published' or creator_id = auth.uid() or public.is_blanky_admin());

create policy listings_insert on public.template_listings for insert to authenticated
  with check (creator_id = auth.uid() and install_count = 0 and current_version = 1);

create policy listings_update on public.template_listings for update to authenticated
  using (creator_id = auth.uid() or public.is_blanky_admin())
  with check (creator_id = auth.uid() or public.is_blanky_admin());

create policy versions_read on public.template_versions for select to authenticated
  using (exists (
    select 1 from public.template_listings l
    where l.id = listing_id and public.template_visible(l.status, l.creator_id)
  ));

create policy installs_owner on public.template_installs for select to authenticated
  using (user_id = auth.uid());

create policy favorites_owner on public.template_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reports_insert on public.template_reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy reports_read on public.template_reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_blanky_admin());

create function public.assert_safe_template_text(p text) returns void language plpgsql as $$
begin
  if p ~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})|(sk-[A-Za-z0-9]{20,})|(Bearer\s+[A-Za-z0-9._-]{12,})|(eyJ[A-Za-z0-9_-]{20,})|(javascript:)|(data:text/html)' then
    raise exception 'Unsafe template content';
  end if;
end $$;

create function public.assert_https_url(p text) returns void language plpgsql as $$
begin
  if p is null or p = '' then return; end if;
  if p !~* '^https://[A-Za-z0-9]' or char_length(p) > 500 then
    raise exception 'HTTPS URL required';
  end if;
end $$;

create function public.protect_listing_metadata() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_blanky_admin() then
    if new.creator_id is distinct from old.creator_id or new.install_count <> old.install_count then
      raise exception 'Protected listing metadata';
    end if;
    if old.status = 'published' and new.status = 'published' and new.current_version_id is distinct from old.current_version_id then
      null;
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;

create trigger protect_listing_metadata before update on public.template_listings
  for each row execute function public.protect_listing_metadata();

create function public.publish_template(
  p_source_page_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_tags text[],
  p_thumbnail_url text,
  p_gallery text[],
  p_language text,
  p_guide text,
  p_sample_ids uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_page public.user_pages;
  v_samples jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_listing_id uuid;
  v_version_id uuid;
  v_status text := 'pending_review';
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.assert_https_url(p_thumbnail_url);
  perform public.assert_safe_template_text(coalesce(p_name, '') || ' ' || coalesce(p_description, '') || ' ' || coalesce(p_guide, ''));
  if p_language is distinct from 'en' and p_language is distinct from 'ko' then p_language := 'ko'; end if;
  select * into v_page from public.user_pages where id = p_source_page_id and user_id = auth.uid();
  if not found then raise exception 'Page not found'; end if;
  if p_sample_ids is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'collectionId', r.record_type_id,
      'title', r.title,
      'values', r.values
    )), '[]'::jsonb) into v_samples
    from public.custom_records r
    where r.user_id = auth.uid()
      and r.id = any(p_sample_ids)
      and r.record_type_id in (
        select (c->>'id')::uuid from jsonb_array_elements(coalesce(v_page.collections, '[]'::jsonb)) c
      );
  end if;
  v_snapshot := jsonb_build_object(
    'version', 1,
    'title', v_page.name,
    'icon', v_page.icon,
    'description', coalesce(v_page.description, ''),
    'blocks', v_page.blocks,
    'collections', coalesce(v_page.collections, '[]'::jsonb),
    'samples', v_samples,
    'guide', coalesce(p_guide, '')
  );
  if octet_length(v_snapshot::text) > 200000 then raise exception 'Template too large'; end if;
  perform public.assert_safe_template_text(v_snapshot::text);
  insert into public.template_listings (
    creator_id, creator_name, name, description, thumbnail_url, gallery, category, tags, language, status, source_page_id
  ) values (
    auth.uid(),
    coalesce((select raw_user_meta_data->>'name' from auth.users where id = auth.uid()), 'Creator'),
    trim(p_name),
    coalesce(p_description, ''),
    coalesce(p_thumbnail_url, ''),
    coalesce(p_gallery, '{}'),
    coalesce(nullif(p_category, ''), 'free'),
    coalesce(p_tags, '{}'),
    p_language,
    v_status,
    p_source_page_id
  ) returning id into v_listing_id;
  insert into public.template_versions (listing_id, version, snapshot)
  values (v_listing_id, 1, v_snapshot)
  returning id into v_version_id;
  update public.template_listings set current_version_id = v_version_id where id = v_listing_id;
  return v_listing_id;
end $$;

create function public.publish_template_version(p_listing_id uuid, p_source_page_id uuid, p_guide text, p_sample_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_page public.user_pages;
  v_listing public.template_listings;
  v_samples jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_listing from public.template_listings where id = p_listing_id and creator_id = auth.uid() for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status = 'archived' then raise exception 'Listing archived'; end if;
  select * into v_page from public.user_pages where id = p_source_page_id and user_id = auth.uid();
  if not found then raise exception 'Page not found'; end if;
  if p_sample_ids is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'collectionId', r.record_type_id,
      'title', r.title,
      'values', r.values
    )), '[]'::jsonb) into v_samples
    from public.custom_records r
    where r.user_id = auth.uid() and r.id = any(p_sample_ids);
  end if;
  v_snapshot := jsonb_build_object(
    'version', 1,
    'title', v_page.name,
    'icon', v_page.icon,
    'description', coalesce(v_page.description, ''),
    'blocks', v_page.blocks,
    'collections', coalesce(v_page.collections, '[]'::jsonb),
    'samples', v_samples,
    'guide', coalesce(p_guide, '')
  );
  if octet_length(v_snapshot::text) > 200000 then raise exception 'Template too large'; end if;
  perform public.assert_safe_template_text(v_snapshot::text);
  v_version := v_listing.current_version + 1;
  insert into public.template_versions (listing_id, version, snapshot) values (p_listing_id, v_version, v_snapshot);
  update public.template_listings
    set current_version = v_version,
        current_version_id = (select id from public.template_versions where listing_id = p_listing_id and version = v_version),
        status = case when status in ('published', 'unlisted') then status else 'pending_review' end
    where id = p_listing_id;
  return v_version;
end $$;

create function public.review_template(p_listing_id uuid, p_status text, p_reason text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_blanky_admin() then raise exception 'Admin required'; end if;
  if p_status not in ('published', 'rejected', 'unlisted', 'archived') then raise exception 'Invalid status'; end if;
  update public.template_listings
    set status = p_status, reject_reason = coalesce(p_reason, '')
    where id = p_listing_id;
  if not found then raise exception 'Listing not found'; end if;
end $$;

create function public.install_template(p_listing_id uuid, p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_listing public.template_listings;
  v_existing public.template_installs;
  v_page jsonb;
  v_collections jsonb;
  v_records jsonb;
  v_page_id uuid;
  v_sort integer;
  v_first boolean;
  rec jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request id required'; end if;
  select * into v_listing from public.template_listings where id = p_listing_id for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_listing.status not in ('published', 'unlisted') and v_listing.creator_id is distinct from auth.uid() then
    raise exception 'Listing unavailable';
  end if;
  select * into v_existing from public.template_installs where user_id = auth.uid() and request_id = p_request_id;
  if found then
    return jsonb_build_object('pageId', v_existing.page_id, 'replayed', true);
  end if;
  if octet_length(coalesce(p_payload, '{}')::text) > 200000 then raise exception 'Template too large'; end if;
  perform public.assert_safe_template_text(coalesce(p_payload::text, ''));
  v_page := coalesce(p_payload->'page', '{}'::jsonb);
  v_collections := coalesce(p_payload->'collections', '[]'::jsonb);
  v_records := coalesce(p_payload->'records', '[]'::jsonb);
  if jsonb_typeof(v_collections) <> 'array' or jsonb_array_length(v_collections) > 12 then raise exception 'Invalid collections'; end if;
  if jsonb_typeof(v_records) <> 'array' or jsonb_array_length(v_records) > 20 then raise exception 'Invalid records'; end if;
  v_page_id := coalesce((v_page->>'id')::uuid, gen_random_uuid());
  select coalesce(max(sort), -1) + 1 into v_sort from public.user_pages where user_id = auth.uid() and kind = 'page';
  insert into public.user_pages (id, user_id, name, icon, description, sort, kind, schema_version, blocks, collections)
  values (
    v_page_id,
    auth.uid(),
    coalesce(nullif(trim(v_page->>'name'), ''), v_listing.name),
    coalesce(nullif(v_page->>'icon', ''), 'StickyNote'),
    coalesce(v_page->>'description', v_listing.description),
    v_sort,
    'page',
    1,
    coalesce(v_page->'blocks', '[]'::jsonb),
    v_collections
  )
  on conflict (id) do nothing;
  if exists (select 1 from public.user_pages where id = v_page_id and user_id is distinct from auth.uid()) then
    raise exception 'Page conflict';
  end if;
  for rec in select value from jsonb_array_elements(v_collections)
  loop
    insert into public.custom_record_types (id, user_id, name, icon, color, description, schema_version, version, schema)
    values (
      (rec->>'id')::uuid,
      auth.uid(),
      coalesce(rec->>'name', '컬렉션'),
      coalesce(rec->>'icon', 'StickyNote'),
      coalesce(rec->>'color', '#3A62B0'),
      coalesce(rec->>'description', ''),
      1,
      1,
      jsonb_build_object('blocks', coalesce(rec->'blocks', '[]'::jsonb))
    )
    on conflict (id) do nothing;
  end loop;
  for rec in select value from jsonb_array_elements(v_records)
  loop
    insert into public.custom_records (id, user_id, record_type_id, title, template_version, values)
    values (
      coalesce((rec->>'id')::uuid, gen_random_uuid()),
      auth.uid(),
      (rec->>'typeId')::uuid,
      coalesce(rec->>'title', ''),
      1,
      coalesce(rec->'values', '{}'::jsonb)
    )
    on conflict (id) do nothing;
  end loop;
  select not exists (
    select 1 from public.template_installs where user_id = auth.uid() and listing_id = p_listing_id
  ) into v_first;
  insert into public.template_installs (user_id, listing_id, version_id, page_id, request_id)
  values (auth.uid(), p_listing_id, v_listing.current_version_id, v_page_id, p_request_id);
  if v_first then
    update public.template_listings set install_count = install_count + 1 where id = p_listing_id;
  end if;
  return jsonb_build_object('pageId', v_page_id, 'replayed', false);
end $$;

create function public.report_template(p_listing_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.template_listings where id = p_listing_id and status in ('published', 'unlisted')) then
    raise exception 'Listing unavailable';
  end if;
  insert into public.template_reports (listing_id, reporter_id, reason)
  values (p_listing_id, auth.uid(), trim(p_reason))
  on conflict (listing_id, reporter_id) do nothing;
end $$;

revoke all on function public.is_blanky_admin() from public, anon;
revoke all on function public.publish_template(uuid, text, text, text, text[], text, text[], text, text, uuid[]) from public, anon;
revoke all on function public.publish_template_version(uuid, uuid, text, uuid[]) from public, anon;
revoke all on function public.review_template(uuid, text, text) from public, anon;
revoke all on function public.install_template(uuid, uuid, jsonb) from public, anon;
revoke all on function public.report_template(uuid, text) from public, anon;
grant execute on function public.is_blanky_admin() to authenticated;
grant execute on function public.publish_template(uuid, text, text, text, text[], text, text[], text, text, uuid[]) to authenticated;
grant execute on function public.publish_template_version(uuid, uuid, text, uuid[]) to authenticated;
grant execute on function public.review_template(uuid, text, text) to authenticated;
grant execute on function public.install_template(uuid, uuid, jsonb) to authenticated;
grant execute on function public.report_template(uuid, text) to authenticated;

insert into public.template_listings (id, creator_name, name, description, category, tags, language, status, current_version)
values
  ('10000000-0000-4000-8000-000000000001', 'Blanky', '운동 관리', '운동 기록 테이블과 카드', 'fitness', '{운동,습관,기록}', 'ko', 'published', 1),
  ('10000000-0000-4000-8000-000000000002', 'Blanky', '영화 기록', '본 영화와 감상', 'media', '{영화,드라마,리뷰}', 'ko', 'published', 1),
  ('10000000-0000-4000-8000-000000000003', 'Blanky', '링크 모음', '자주 여는 사이트', 'links', '{북마크,링크}', 'ko', 'published', 1),
  ('10000000-0000-4000-8000-000000000004', 'Blanky', '공부 관리', '공부 시간과 내용', 'study', '{공부,플래너}', 'ko', 'published', 1),
  ('10000000-0000-4000-8000-000000000005', 'Blanky', '프로젝트 관리', '상태별 작업', 'project', '{프로젝트,칸반}', 'ko', 'published', 1);

insert into public.template_versions (id, listing_id, version, snapshot)
select id, id, 1, jsonb_build_object('version', 1, 'title', name, 'icon', 'StickyNote', 'description', description, 'blocks', '[]'::jsonb, 'collections', '[]'::jsonb, 'samples', '[]'::jsonb, 'guide', '')
from public.template_listings
where creator_id is null;

update public.template_listings l
  set current_version_id = v.id
  from public.template_versions v
  where v.listing_id = l.id and l.creator_id is null;
