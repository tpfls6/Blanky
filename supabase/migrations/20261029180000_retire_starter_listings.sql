-- Retire the workout, links and project starter listings from the store.
-- Archive (not delete) so any existing installs and version history stay valid.
begin;

update public.template_listings
  set status = 'archived', updated_at = now()
  where creator_id is null
    and id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000005'
    );

notify pgrst, 'reload schema';
commit;
