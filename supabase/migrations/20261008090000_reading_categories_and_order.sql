begin;
alter table public.books add column if not exists categories text[] not null default '{}';
alter table public.books add column if not exists categories_fetched_at timestamptz;
grant update(categories,categories_fetched_at) on public.books to service_role;
create index if not exists books_categories_idx on public.books using gin(categories);
create or replace function public.add_reading_book(p_book jsonb, p_status text default 'want', p_shelves uuid[] default '{}') returns uuid
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
 insert into books(external_source,external_id,isbn10,isbn13,title,author,publisher,published_date,description,cover_url,page_count,categories,categories_fetched_at)
 values(p_book->>'external_source',p_book->>'external_id',nullif(p_book->>'isbn10',''),nullif(p_book->>'isbn13',''),p_book->>'title',coalesce(p_book->>'author',''),p_book->>'publisher',p_book->>'published_date',p_book->>'description',p_book->>'cover_url',(p_book->>'page_count')::integer, array(select jsonb_array_elements_text(coalesce(p_book->'categories','[]'::jsonb))),case when p_book ? 'categories' then now() else null end) returning id into metadata_id;
 end if;
 insert into user_books(user_id,book_id,reading_status,total_pages,progress)
 values(owner_id,metadata_id,p_status,(select page_count from books where id=metadata_id),case when p_status='done' then 100 else 0 end)
 on conflict(user_id,book_id) do nothing;
 select id into library_id from user_books where user_id=owner_id and book_id=metadata_id;
 insert into reading_shelf_books(shelf_id,user_book_id,user_id) select distinct s,library_id,owner_id from unnest(p_shelves) s on conflict do nothing;
 return library_id;
end $$;

-- Invoker permissions retain RLS. Only an exact permutation of this user's shelves is accepted.
create or replace function public.reorder_reading_shelves(p_ids uuid[]) returns void
language plpgsql security invoker set search_path=public as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text,713019));
 if p_ids is null or cardinality(p_ids) <> (select count(*) from reading_shelves where user_id=owner_id)
 or cardinality(p_ids) <> (select count(distinct requested.id) from unnest(p_ids) as requested(id))
 or exists(select 1 from unnest(p_ids) as requested(id) where not exists(select 1 from reading_shelves s where s.id=requested.id and s.user_id=owner_id))
 then raise exception 'Shelf order must contain exactly your shelves'; end if;
 update reading_shelves s set sort_order=ordered.position-1
 from unnest(p_ids) with ordinality as ordered(id,position)
 where s.id=ordered.id and s.user_id=owner_id;
end $$;
revoke all on function public.reorder_reading_shelves(uuid[]) from public;
grant execute on function public.reorder_reading_shelves(uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
