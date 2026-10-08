create table public.themes (
 id uuid primary key default gen_random_uuid(), creator_id uuid references auth.users(id) on delete cascade,
 creator_name text not null default 'Creator', name text not null check (length(trim(name)) between 1 and 100), description text not null default '', thumbnail_url text not null default '', category text not null default '', tags text[] not null default '{}',
 visibility text not null default 'private' check(visibility in ('private','public')), pricing_type text not null default 'free' check(pricing_type in ('free','paid')), price integer not null default 0 check(price >= 0 and ((pricing_type = 'free' and price = 0) or (pricing_type = 'paid' and price > 0))),
 theme_config jsonb not null check(jsonb_typeof(theme_config)='object'), download_count integer not null default 0, rating_average numeric not null default 0, rating_count integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_themes (user_id uuid references auth.users(id) on delete cascade, theme_id uuid references public.themes(id) on delete cascade, acquired_type text not null default 'free' check(acquired_type in ('free','purchase')), created_at timestamptz not null default now(), primary key(user_id,theme_id));
create table public.user_theme_settings (user_id uuid primary key references auth.users(id) on delete cascade, active_theme_id uuid references public.themes(id) on delete set null, updated_at timestamptz not null default now());
create table public.theme_reviews (id uuid primary key default gen_random_uuid(),theme_id uuid not null references public.themes(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,rating integer not null check(rating between 1 and 5),content text not null default '',created_at timestamptz not null default now(),unique(theme_id,user_id));
create index themes_store_idx on public.themes(visibility,created_at desc);
alter table public.themes enable row level security;
alter table public.user_themes enable row level security;
alter table public.user_theme_settings enable row level security;
alter table public.theme_reviews enable row level security;
create policy themes_read on public.themes for select to authenticated using(visibility='public' or creator_id=auth.uid());
create policy themes_create on public.themes for insert to authenticated with check(creator_id=auth.uid() and download_count=0 and rating_count=0 and rating_average=0);
create policy themes_update on public.themes for update to authenticated using(creator_id=auth.uid()) with check(creator_id=auth.uid());
create policy themes_delete on public.themes for delete to authenticated using(creator_id=auth.uid());
create policy owned_read on public.user_themes for select to authenticated using(user_id=auth.uid());
create policy owned_remove on public.user_themes for delete to authenticated using(user_id=auth.uid());
create policy settings_owner on public.user_theme_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and (active_theme_id is null or exists(select 1 from public.themes t where t.id=active_theme_id and (t.creator_id=auth.uid() or t.creator_id is null or exists(select 1 from public.user_themes u where u.theme_id=t.id and u.user_id=auth.uid())))));
create policy reviews_read on public.theme_reviews for select to authenticated using(exists(select 1 from public.themes t where t.id=theme_id and t.visibility='public'));
-- Reviews are reserved for a later verified-purchase implementation; no client writes yet.
create function public.install_theme(p_theme_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 perform 1 from public.themes where id=p_theme_id and visibility='public' and pricing_type='free' for update;
 if not found then raise exception 'Theme unavailable or payment required'; end if;
 insert into public.user_themes(user_id,theme_id) values(auth.uid(),p_theme_id) on conflict do nothing;
 if found then update public.themes set download_count=download_count+1 where id=p_theme_id; end if;
end $$;
revoke all on function public.install_theme(uuid) from public,anon;
grant execute on function public.install_theme(uuid) to authenticated;
create function public.protect_theme_metadata() returns trigger language plpgsql as $$
begin
 if current_user in ('authenticated','anon') then
  if new.creator_id is distinct from old.creator_id or new.download_count<>old.download_count or new.rating_count<>old.rating_count or new.rating_average<>old.rating_average then raise exception 'Protected theme metadata'; end if;
 end if;
 new.updated_at=now(); return new;
end $$;
create trigger protect_theme_metadata before update on public.themes for each row execute function public.protect_theme_metadata();

insert into public.themes(id,creator_name,name,description,visibility,theme_config) values ('00000000-0000-4000-8000-000000000001','Blanky','Blanky Default','Blanky 기본 제공 테마','public','{"colors":{"background":"#ffffff","surface":"#ffffff","primary":"#3a62b0","accent":"#c15e80","textPrimary":"#171717","textSecondary":"#737373","border":"#ebebeb"},"calendar":{"background":"#ffffff","todayColor":"#3a62b0","selectedColor":"#3a62b0","weekdayColor":"#171717","weekendColor":"#c15e80","hoverColor":"#f6f6f5"},"schedule":{"background":"#f1f4fb","textColor":"#171717","borderColor":"#ebebeb","borderRadius":6,"opacity":1,"shadow":"none"},"task":{"background":"#ffffff","checkboxColor":"#3a62b0","checkboxStyle":"square","completedStyle":"strike","completedLineColor":"#737373"},"card":{"background":"#ffffff","borderColor":"#ebebeb","borderRadius":8,"shadow":"none","opacity":1},"sidebar":{"background":"#ffffff","selectedBackground":"#f1f4fb","textColor":"#737373","iconColor":"#737373","hoverColor":"#f6f6f5"},"typography":{"headingFont":"system-ui","bodyFont":"system-ui"},"iconPack":"default"}'::jsonb);
insert into public.themes(id,creator_name,name,description,visibility,theme_config) values ('00000000-0000-4000-8000-000000000002','Blanky','Soft Pink','Blanky 기본 제공 테마','public','{"colors":{"background":"#fff8fb","surface":"#fff4f8","primary":"#c15e80","accent":"#c15e80","textPrimary":"#171717","textSecondary":"#737373","border":"#ebebeb"},"calendar":{"background":"#ffffff","todayColor":"#c15e80","selectedColor":"#c15e80","weekdayColor":"#171717","weekendColor":"#c15e80","hoverColor":"#f6f6f5"},"schedule":{"background":"#fce8f0","textColor":"#171717","borderColor":"#ebebeb","borderRadius":6,"opacity":1,"shadow":"none"},"task":{"background":"#ffffff","checkboxColor":"#c15e80","checkboxStyle":"square","completedStyle":"strike","completedLineColor":"#737373"},"card":{"background":"#ffffff","borderColor":"#ebebeb","borderRadius":8,"shadow":"none","opacity":1},"sidebar":{"background":"#ffffff","selectedBackground":"#fce8f0","textColor":"#737373","iconColor":"#737373","hoverColor":"#f6f6f5"},"typography":{"headingFont":"system-ui","bodyFont":"system-ui"},"iconPack":"default"}'::jsonb);
insert into public.themes(id,creator_name,name,description,visibility,theme_config) values ('00000000-0000-4000-8000-000000000003','Blanky','Ocean Blue','Blanky 기본 제공 테마','public','{"colors":{"background":"#f3faff","surface":"#ffffff","primary":"#167c9c","accent":"#36a5ad","textPrimary":"#171717","textSecondary":"#737373","border":"#ebebeb"},"calendar":{"background":"#ffffff","todayColor":"#167c9c","selectedColor":"#167c9c","weekdayColor":"#171717","weekendColor":"#c15e80","hoverColor":"#f6f6f5"},"schedule":{"background":"#e2f3fa","textColor":"#171717","borderColor":"#ebebeb","borderRadius":6,"opacity":1,"shadow":"none"},"task":{"background":"#ffffff","checkboxColor":"#167c9c","checkboxStyle":"square","completedStyle":"strike","completedLineColor":"#737373"},"card":{"background":"#ffffff","borderColor":"#ebebeb","borderRadius":8,"shadow":"none","opacity":1},"sidebar":{"background":"#ffffff","selectedBackground":"#e2f3fa","textColor":"#737373","iconColor":"#737373","hoverColor":"#f6f6f5"},"typography":{"headingFont":"system-ui","bodyFont":"system-ui"},"iconPack":"default"}'::jsonb);
insert into public.themes(id,creator_name,name,description,visibility,theme_config) values ('00000000-0000-4000-8000-000000000004','Blanky','Dark','Blanky 기본 제공 테마','public','{"colors":{"background":"#141414","surface":"#1c1c1c","primary":"#8aabed","accent":"#c15e80","textPrimary":"#f5f5f5","textSecondary":"#a3a3a3","border":"#2e2e2e"},"calendar":{"background":"#1c1c1c","todayColor":"#8aabed","selectedColor":"#8aabed","weekdayColor":"#f5f5f5","weekendColor":"#c15e80","hoverColor":"#242424"},"schedule":{"background":"#24304a","textColor":"#f5f5f5","borderColor":"#2e2e2e","borderRadius":6,"opacity":1,"shadow":"none"},"task":{"background":"#1c1c1c","checkboxColor":"#8aabed","checkboxStyle":"square","completedStyle":"strike","completedLineColor":"#737373"},"card":{"background":"#1c1c1c","borderColor":"#2e2e2e","borderRadius":8,"shadow":"none","opacity":1},"sidebar":{"background":"#1c1c1c","selectedBackground":"#24304a","textColor":"#a3a3a3","iconColor":"#a3a3a3","hoverColor":"#242424"},"typography":{"headingFont":"system-ui","bodyFont":"system-ui"},"iconPack":"default"}'::jsonb);
create index themes_creator_idx on public.themes(creator_id);
create function public.clear_uninstalled_theme() returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.user_theme_settings set active_theme_id=null,updated_at=now() where user_id=old.user_id and active_theme_id=old.theme_id;
 return old;
end $$;
create trigger clear_uninstalled_theme after delete on public.user_themes for each row execute function public.clear_uninstalled_theme();
