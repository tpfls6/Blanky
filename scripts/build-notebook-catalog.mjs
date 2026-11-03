// Produce the reviewed catalog SQL from the same snapshots shown by the app.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { officialListings } from '../src/features/marketplace/official.ts'
import { coerceSnapshot } from '../src/features/marketplace/sanitize.ts'

const listings = officialListings().filter(row => row.snapshot.blocks.some(block => block.props.recordLayout))
assert.equal(listings.length, 4)
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
let sql = '-- Official movie, finance, travel and study notebooks. Preserve existing installed snapshots and user pages.\nbegin;\n'
for (const listing of listings) {
  const snapshot = coerceSnapshot(JSON.parse(JSON.stringify(listing.snapshot)))
  assert.ok(snapshot, listing.name)
  const version = ['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004'].includes(listing.id) ? 2 : 1
  sql += `
insert into public.template_listings (id,creator_name,name,description,category,tags,language,status)
values (${literal(listing.id)},'Blanky',${literal(listing.name)},${literal(listing.description)},${literal(listing.category)},array[${listing.tags.map(literal).join(',')}],'ko','published')
on conflict (id) do update set name=excluded.name,description=excluded.description,category=excluded.category,tags=excluded.tags
where template_listings.creator_id is null;
insert into public.template_versions (listing_id,version,snapshot)
select ${literal(listing.id)},${version},${literal(JSON.stringify(snapshot))}::jsonb
where exists (select 1 from public.template_listings where id=${literal(listing.id)} and creator_id is null)
on conflict (listing_id,version) do nothing;
update public.template_listings l set current_version=${version},current_version_id=v.id,updated_at=now()
from public.template_versions v where l.id=${literal(listing.id)} and l.creator_id is null and v.listing_id=l.id and v.version=${version} and l.current_version<=${version};
`
}
sql += "\nnotify pgrst, 'reload schema';\ncommit;\n"
writeFileSync('supabase/migrations/20261029160000_notebook_templates.sql', sql)
console.log('Prepared four official notebook snapshots; movie/study version history is preserved.')
