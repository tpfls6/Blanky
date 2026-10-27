-- Reject malformed transport payloads, including accidental {} in place of a clear tombstone.
begin;
alter table public.planner_drafts add constraint planner_draft_shape check(
 payload is null or (
  jsonb_typeof(payload)='object' and payload ?& array['input','plan','edits','saved'] and
  jsonb_typeof(payload->'input')='string' and jsonb_typeof(payload->'plan')='object' and
  jsonb_typeof(payload->'edits')='array' and jsonb_typeof(payload->'saved')='array'
 )
);
commit;
