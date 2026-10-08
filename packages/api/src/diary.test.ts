import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { createDiaryRepository, diaryTitle, mapDiaryRecord, DIARY_TYPE_MARKER, diaryRecordId } from './diaryRepository.ts'
const owner = '12345678-1234-4567-8901-123456789abc'
function fixture() {
  const tables: Record<string, Record<string, unknown>[]> = { custom_record_types: [], custom_records: [] }
  const writes: string[] = []
  let fail = false
  const client = { from(table: string) {
    let action = 'read', payload: Record<string, unknown> = {}
    const filters: [string, unknown][] = []
    const execute = (single = false) => {
      if (fail) return { data: null, error: { code: 'PGRST301', message: 'JWT expired' } }
      const rows = tables[table].filter(row => filters.every(([key, value]) => row[key] === value))
      let result = rows
      if (action === 'insert') {
        writes.push(table + ':insert')
        if (tables[table].some(row => row.id === payload.id)) return { data: null, error: { code: '23505' } }
        const row = { created_at: '2026-10-07T04:00:00Z', ...payload }
        tables[table].push(row); result = [row]
      } else if (action === 'update') { writes.push(table + ':update'); for (const row of rows) Object.assign(row, payload) }
      else if (action === 'delete') { writes.push(table + ':delete'); tables[table] = tables[table].filter(row => !rows.includes(row)) }
      return { data: single ? result[0] ?? null : result, error: null }
    }
    const chain = {
      select() { return chain }, eq(key: string, value: unknown) { filters.push([key, value]); return chain }, order() { return chain },
      insert(value: Record<string, unknown>) { action = 'insert'; payload = value; return chain },
      update(value: Record<string, unknown>) { action = 'update'; payload = value; return chain },
      delete() { action = 'delete'; return chain }, maybeSingle: async () => execute(true), single: async () => execute(true),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve(execute()).then(resolve) },
    }
    return chain
  } } as unknown as SupabaseClient<Database>
  return { repo: createDiaryRepository(client, owner), tables, writes, deny: () => { fail = true } }
}
const entry = { id: '12345678-1234-4567-8901-000000000002', date: '2026-10-01', title: '', body: '오늘 프로젝트 회의를 했다. 좋은 하루였다.', tags: ['프로젝트'], mood: 'happy', weather: 'cloudy', isFavorite: true, createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z' }
test('empty diary reads never create database records or templates', async () => {
  const f = fixture(); assert.deepEqual(await f.repo.getDiaryRecords(), []); assert.equal(f.writes.length, 0)
})
test('auto title follows first sentence and preserves explicit titles', () => {
  assert.equal(diaryTitle(entry), '오늘 프로젝트 회의를 했다'); assert.equal(diaryTitle({ body: '내용', title: '직접 작성' }), '직접 작성')
  assert.equal(diaryTitle({ body: '가'.repeat(80) }).length, 48)
})
test('legacy records retain their timestamps and metadata through save/read/update', async () => {
  const f = fixture(); const saved = await f.repo.saveDiaryRecord(entry)
  assert.equal(saved.createdAt, entry.createdAt); assert.equal(saved.title, ''); assert.equal(saved.mood, 'happy'); assert.equal(saved.weather, 'cloudy')
  assert.equal(f.tables.custom_record_types[0].description, DIARY_TYPE_MARKER)
  assert.equal(f.tables.custom_records[0].user_id, owner)
  assert.equal(f.tables.custom_records[0].title, '오늘 프로젝트 회의를 했다')
  await f.repo.saveDiaryRecord({ ...saved, body: '수정한 기록', isFavorite: false, weather: 'rain', tags: ['학교'] })
  const rows = await f.repo.getDiaryRecords(); assert.equal(rows.length, 1); assert.equal(rows[0].body, '수정한 기록'); assert.equal(rows[0].isFavorite, false); assert.equal(rows[0].weather, 'rain'); assert.deepEqual(rows[0].tags, ['학교'])
})
test('failed reads never fall back to creating records', async () => {
  const f = fixture(); f.deny(); await assert.rejects(f.repo.saveDiaryRecord(entry), { code: 'UNAUTHORIZED' }); assert.equal(f.writes.length, 0)
})
test('blank new records are rejected but an existing record can be cleared', async () => {
  const f = fixture(); await assert.rejects(f.repo.saveDiaryRecord({ ...entry, body: '' }), { code: 'INVALID_INPUT' }); assert.equal(f.tables.custom_records.length, 0)
  await f.repo.saveDiaryRecord(entry); const cleared = await f.repo.saveDiaryRecord({ ...entry, body: '' }); assert.equal(cleared.body, '')
})
test('deletion targets the diary record and rejects unrelated record types', async () => {
  const f = fixture(); await f.repo.saveDiaryRecord(entry)
  f.tables.custom_records.push({ id: '12345678-1234-4567-8901-000000000003', user_id: owner, record_type_id: 'other-type', created_at: entry.createdAt, updated_at: entry.updatedAt })
  await assert.rejects(f.repo.deleteDiaryRecord('12345678-1234-4567-8901-000000000003'), { code: 'INVALID_INPUT' })
  await f.repo.deleteDiaryRecord(entry.id); assert.equal(f.tables.custom_records.length, 1); assert.equal(f.tables.custom_records[0].id, '12345678-1234-4567-8901-000000000003')
})
test('mapper ignores malformed optional values', () => {
  const mapped = mapDiaryRecord({ id: 'id', userId: owner, recordTypeId: 'type', title: 'old title', templateVersion: 1, createdAt: entry.createdAt, updatedAt: entry.updatedAt, values: { tags: ['학교', 42], mood: 7, isFavorite: 'true' } })
  assert.deepEqual(mapped.tags, ['학교']); assert.equal(mapped.mood, undefined); assert.equal(mapped.isFavorite, false); assert.equal(mapped.title, 'old title')
})

test('legacy IDs become stable per-account UUIDs without changing valid IDs', async () => {
  assert.equal(await diaryRecordId(owner, entry.id), entry.id)
  const mapped = await diaryRecordId(owner, 'diary-seed')
  assert.match(mapped, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(await diaryRecordId(owner, 'diary-seed'), mapped)
  assert.notEqual(await diaryRecordId('87654321-4321-4567-8901-123456789abc', 'diary-seed'), mapped)
})
test('seed migration retries update one record and deletion accepts its legacy ID', async () => {
  const f = fixture()
  const saved = await f.repo.saveDiaryRecord({ ...entry, id: 'diary-seed' })
  assert.notEqual(saved.id, 'diary-seed')
  assert.equal(saved.body, entry.body); assert.equal(saved.createdAt, entry.createdAt)
  await f.repo.saveDiaryRecord({ ...entry, id: 'diary-seed', body: '수정한 샘플 기록' })
  assert.equal(f.tables.custom_records.length, 1)
  assert.equal(f.tables.custom_records[0].id, saved.id)
  await f.repo.deleteDiaryRecord('diary-seed'); assert.equal(f.tables.custom_records.length, 0)
})
