-- Reading Library: metadata is shared, personal relationships are owner-scoped.
begin;
create table public.books (
 id uuid primary key default gen_random_uuid(), external_source text not null, external_id text not null,
 isbn10 text, isbn13 text, title text not null check(length(trim(title)) > 0), author text not null default '',
 publisher text, published_date text, description text, cover_url text, page_count integer check(page_count >= 0),
 created_at timestamptz not null default now(), unique(external_source, external_id)
);
create unique index books_isbn13_unique on public.books(isbn13) where isbn13 is not null;
create unique index books_isbn10_unique on public.books(isbn10) where isbn10 is not null;
create table public.user_books (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 book_id uuid not null references public.books, reading_status text not null default 'want' check(reading_status in ('want','reading','done','stopped')),
 rating numeric check(rating between 1 and 5 and rating * 2 = trunc(rating * 2)),
 current_page integer not null default 0 check(current_page >= 0), total_pages integer check(total_pages >= 0),
 progress numeric not null default 0 check(progress between 0 and 100), started_at date, finished_at date,
 review text not null default '', tags text[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,book_id), unique(id,user_id)
);
create table public.reading_shelves (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), description text not null default '',
 icon text not null default '📚', color text not null default 'primary' check(color in ('primary','accent','textSecondary')),
 sort_order integer not null default 0 check(sort_order >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.reading_shelf_books (
 shelf_id uuid not null, user_book_id uuid not null, user_id uuid not null references auth.users on delete cascade,
 created_at timestamptz not null default now(), primary key(shelf_id,user_book_id),
 foreign key(shelf_id,user_id) references public.reading_shelves(id,user_id) on delete cascade,
 foreign key(user_book_id,user_id) references public.user_books(id,user_id) on delete cascade
);
create table public.reading_highlights (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 user_book_id uuid not null, content text not null check(length(trim(content)) > 0), page_number integer check(page_number > 0),
 note text not null default '', tags text[] not null default '{}',
 source_type text not null default 'manual' check(source_type in ('manual','web','pdf','kindle')), source_url text, source_title text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(user_book_id,user_id) references public.user_books(id,user_id) on delete cascade
);
create table public.reading_notes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 user_book_id uuid not null, content text not null check(length(trim(content)) > 0), tags text[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(user_book_id,user_id) references public.user_books(id,user_id) on delete cascade
);
create index user_books_owner_recent on public.user_books(user_id,created_at desc);
create index reading_shelves_owner_order on public.reading_shelves(user_id,sort_order);
create index reading_memberships_book on public.reading_shelf_books(user_book_id);
create index reading_highlights_book on public.reading_highlights(user_book_id,created_at desc);
create index reading_notes_book on public.reading_notes(user_book_id,created_at desc);
create function public.reading_touch_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['user_books','reading_shelves','reading_highlights','reading_notes'] loop
 execute format('create trigger reading_touch before update on public.%I for each row execute function public.reading_touch_updated_at()',t);
 end loop;
 foreach t in array array['user_books','reading_shelves','reading_shelf_books','reading_highlights','reading_notes'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy reading_owner on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t);
 execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 end loop;
end $$;
alter table public.books enable row level security;
create policy books_read on public.books for select to authenticated using(true);
grant select on public.books to authenticated;
revoke insert, update, delete on public.books from anon, authenticated;
-- Atomic deduplication and membership creation. No caller-supplied owner is accepted.
create function public.add_reading_book(p_book jsonb, p_status text default 'want', p_shelves uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare owner_id uuid := auth.uid(); metadata_id uuid; library_id uuid;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 if p_status not in ('want','reading','done','stopped') then raise exception 'Invalid status'; end if;
 if exists(select 1 from unnest(p_shelves) s where not exists(select 1 from reading_shelves rs where rs.id=s and rs.user_id=owner_id)) then raise exception 'Shelf not owned'; end if;
 -- serialize catalog inserts across providers and ISBNs (small MVP catalog).
 perform pg_advisory_xact_lock(713018);
 select id into metadata_id from books where
 (isbn13 is not null and isbn13 = nullif(p_book->>'isbn13','')) or
 (isbn10 is not null and isbn10 = nullif(p_book->>'isbn10','')) or
 (external_source=p_book->>'external_source' and external_id=p_book->>'external_id') limit 1;
 if metadata_id is null then
 insert into books(external_source,external_id,isbn10,isbn13,title,author,publisher,published_date,description,cover_url,page_count)
 values(p_book->>'external_source',p_book->>'external_id',nullif(p_book->>'isbn10',''),nullif(p_book->>'isbn13',''),p_book->>'title',coalesce(p_book->>'author',''),p_book->>'publisher',p_book->>'published_date',p_book->>'description',p_book->>'cover_url',(p_book->>'page_count')::integer) returning id into metadata_id;
 end if;
 insert into user_books(user_id,book_id,reading_status,total_pages,progress)
 values(owner_id,metadata_id,p_status,(select page_count from books where id=metadata_id),case when p_status='done' then 100 else 0 end)
 on conflict(user_id,book_id) do nothing;
 select id into library_id from user_books where user_id=owner_id and book_id=metadata_id;
 insert into reading_shelf_books(shelf_id,user_book_id,user_id) select distinct s,library_id,owner_id from unnest(p_shelves) s on conflict do nothing;
 return library_id;
end $$;
revoke all on function public.add_reading_book(jsonb,text,uuid[]) from public;
grant execute on function public.add_reading_book(jsonb,text,uuid[]) to authenticated;
commit;
