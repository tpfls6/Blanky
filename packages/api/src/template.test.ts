import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { createTemplateRepository } from './templateRepository.ts'

test('template install and publish go through guarded RPCs', async () => {
  const calls: unknown[] = []
  const client = {
    from(table: string) {
      calls.push(table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
            order: () => ({ data: [], error: null }),
          }),
          order: () => ({ range: async () => ({ data: [], error: null }) }),
        }),
      }
    },
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args])
      return { data: name === 'install_template' ? { pageId: 'p1', replayed: false } : 'listing', error: null }
    },
  } as unknown as SupabaseClient<Database>
  const repo = createTemplateRepository(client)
  const installed = await repo.install('listing', 'req', { page: { id: 'p1' }, collections: [], records: [] })
  assert.equal(installed.pageId, 'p1')
  assert.deepEqual(calls.at(-1), ['install_template', { p_listing_id: 'listing', p_request_id: 'req', p_payload: { page: { id: 'p1' }, collections: [], records: [] } }])
  await repo.publish({
    sourcePageId: 'page',
    name: '영화 기록',
    description: '',
    category: 'media',
    tags: ['영화'],
    thumbnailUrl: 'https://images.example.com/a.png',
    gallery: [],
    language: 'ko',
    guide: '',
    sampleIds: [],
  })
  const last = calls.at(-1) as [string, Record<string, unknown>]
  assert.equal(last[0], 'publish_template')
  assert.equal(last[1].p_source_page_id, 'page')
})
