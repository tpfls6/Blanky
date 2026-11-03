import { createClient } from '@supabase/supabase-js'
import { projectKeys } from './planner-test-user.mjs'
process.loadEnvFile('.env')
const admin = createClient(process.env.VITE_SUPABASE_URL, projectKeys(), { auth: { persistSession: false } })
const { data, error } = await admin.from('template_listings').select('id,name,status,creator_id,current_version,install_count,thumbnail_url').is('creator_id', null).order('id')
if (error) throw error
console.table(data)
const v = await admin.from('template_versions').select('listing_id,version,snapshot->blocks').in('listing_id', data.map(r=>r.id))
for (const r of v.data) console.log(r.listing_id.slice(-2), r.version, JSON.stringify(r.blocks).includes('recordLayout'))
const inst = await admin.from('template_installs').select('listing_id', { count: 'exact' })
console.log('installs', inst.count, [...new Set(inst.data.map(r=>r.listing_id.slice(-2)))])
