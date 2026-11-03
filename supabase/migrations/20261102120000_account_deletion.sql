-- Account deletion: any user can be removed, and a departing creator never takes other users' data along.
begin;

-- Account deletion cascades the bound calendar and its connection together; only a live owner is guarded.
-- Definer: the trigger also fires on client calendar deletes, and clients cannot read either table.
create or replace function public.guard_bound_external_calendar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users where id = old.owner_user_id)
     and exists (select 1 from public.google_calendar_connections where blanky_calendar_id = old.id) then
    raise exception 'Bound Google Calendar cannot be deleted' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.guard_bound_external_calendar() from public, anon, authenticated;

-- During account deletion the owner row is already gone, so its history has nowhere to live.
-- Definer: the Auth server role and clients cannot read auth.users or write history for a deleted owner.
create or replace function public.record_schedule_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data public.schedules;
begin
  if TG_OP = 'DELETE' then row_data := OLD; else row_data := NEW; end if;
  if not exists (select 1 from auth.users where id = row_data.user_id) then return row_data; end if;
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
revoke all on function public.record_schedule_activity() from public, anon, authenticated;

-- Creator content other users depend on outlives the creator; release_creator_content removes the rest.
alter table public.themes drop constraint themes_creator_id_fkey,
  add constraint themes_creator_id_fkey foreign key (creator_id) references auth.users(id) on delete set null;
alter table public.template_listings drop constraint template_listings_creator_id_fkey,
  add constraint template_listings_creator_id_fkey foreign key (creator_id) references auth.users(id) on delete set null;

create function public.release_creator_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.themes t where t.creator_id = old.id
    and not exists (select 1 from public.user_themes u where u.theme_id = t.id and u.user_id <> old.id)
    and not exists (select 1 from public.user_theme_settings s where s.active_theme_id = t.id and s.user_id <> old.id)
    and not exists (select 1 from public.theme_reviews r where r.theme_id = t.id and r.user_id <> old.id);
  -- Kept themes leave the store. Installers still read them through themes_installed_read.
  update public.themes set visibility = 'private' where creator_id = old.id;
  delete from public.template_listings l where l.creator_id = old.id
    and not exists (select 1 from public.template_installs i where i.listing_id = l.id and i.user_id <> old.id)
    and not exists (select 1 from public.template_favorites f where f.listing_id = l.id and f.user_id <> old.id)
    and not exists (select 1 from public.template_reports r where r.listing_id = l.id and r.reporter_id <> old.id);
  update public.template_listings set status = 'archived' where creator_id = old.id;
  return old;
end;
$$;
revoke all on function public.release_creator_content() from public, anon, authenticated;
create trigger release_creator_content before delete on auth.users
for each row execute function public.release_creator_content();

-- A kept theme has no creator, but its files stay under the departed creator's folder.
-- Uploads into that folder stay impossible: theme_object_insert requires the theme's creator to be the uploader.
create or replace function public.can_read_theme_object(object_name text) returns boolean language sql stable security invoker set search_path=public as $$
 select (split_part(object_name,'/',1)=auth.uid()::text) or exists(
 select 1 from public.themes t where t.id::text=split_part(object_name,'/',2)
 and coalesce(t.creator_id::text,split_part(object_name,'/',1))=split_part(object_name,'/',1)
 and (t.visibility='public' or t.creator_id=auth.uid() or exists(select 1 from public.user_themes u where u.theme_id=t.id and u.user_id=auth.uid())));
$$;
-- Also qualifies objects.name: unqualified, it resolved to themes.name and the package clause never matched.
drop policy theme_object_read on storage.objects;
create policy theme_object_read on storage.objects for select to authenticated
 using(bucket_id in ('theme-assets','theme-previews','theme-packages') and public.can_read_theme_object(objects.name)
 and (bucket_id<>'theme-packages' or exists(select 1 from public.themes t
 where t.id::text=split_part(objects.name,'/',2)
 and coalesce(t.creator_id::text,split_part(objects.name,'/',1))=split_part(objects.name,'/',1)
 and (t.creator_id=auth.uid() or (t.visibility='public' and t.pricing_type='free')
 or exists(select 1 from public.user_themes u where u.theme_id=t.id and u.user_id=auth.uid())))));

-- A missing creator meant a built-in theme; kept themes are private, so only public ones count as built in.
drop policy settings_owner on public.user_theme_settings;
create policy settings_owner on public.user_theme_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (active_theme_id is null or exists(select 1 from public.themes t where t.id=active_theme_id and (t.creator_id=auth.uid() or (t.creator_id is null and t.visibility='public') or exists(select 1 from public.user_themes u where u.theme_id=t.id and u.user_id=auth.uid())))));

-- Storage rows cannot be deleted in SQL. delete-account removes these through the Storage API.
-- Empty while the user exists, so it can never list a live account's files.
create function public.account_storage_leftovers(p_user_id uuid) returns table(bucket_id text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where not exists (select 1 from auth.users u where u.id = p_user_id)
    and (o.owner_id = p_user_id::text or split_part(o.name, '/', 1) = p_user_id::text)
    and not (o.bucket_id in ('theme-assets', 'theme-previews', 'theme-packages')
      and exists (select 1 from public.themes t where t.id::text = split_part(o.name, '/', 2)));
$$;
revoke all on function public.account_storage_leftovers(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_leftovers(uuid) to service_role;

commit;
