import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { mapParsedSchedule } from './ai.ts'
import { mapCategoryRow } from './categoryRepository.ts'
import { AppError, mapDbError } from './errors.ts'
import { mapCustomRecordRow, mapCustomRecordTypeRow } from './recordRepository.ts'

const TABLES = [
  'categories',
  'schedules',
  'schedule_changes',
  'user_preferences',
  'device_push_tokens',
  'custom_record_types',
  'custom_records',
  'user_pages',
  'classification_feedback',
  'user_classification_rules',
]

test('owner policies cover select insert update delete', () => {
  const sql = readdirSync('supabase/migrations')
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(`supabase/migrations/${name}`, 'utf8'))
    .join('\n')
  for (const table of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(sql, new RegExp(`on public\\.${table}[\\s\\S]*?auth\\.uid\\(\\) = user_id[\\s\\S]*?with check \\(auth\\.uid\\(\\) = user_id\\)`))
  }
})

test('mappers use camelCase and hide database columns', () => {
  const category = mapCategoryRow({
    id: 'school',
    user_id: 'user',
    name: '학교',
    parent_id: null,
    icon: 'Folder',
    color: '#3A62B0',
    sort_order: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  })
  assert.equal(category.parentId, null)
  assert.equal(category.sortOrder, 1)
  assert.equal('user_id' in category, false)

  const recordType = mapCustomRecordTypeRow({
    id: 'workout',
    user_id: 'user',
    name: '운동',
    description: '',
    icon: 'Dumbbell',
    color: '#3C8664',
    schema_version: 1,
    version: 2,
    schema: { blocks: [{ id: 'title' }] },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  })
  assert.equal(recordType.schemaVersion, 1)
  assert.deepEqual(recordType.blocks, [{ id: 'title' }])

  const record = mapCustomRecordRow({
    id: 'row',
    user_id: 'user',
    record_type_id: 'workout',
    title: '스쿼트',
    template_version: 2,
    values: { weight: 40 },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  })
  assert.equal(record.recordTypeId, 'workout')
  assert.equal(record.values.weight, 40)
})

test('parse response and database errors stay mapped', () => {
  const parsed = mapParsedSchedule({
    type: 'event',
    confidence: 0.91,
    source: 'rule',
    draft: {
      title: '회의',
      date: '2026-10-02',
      startTime: '15:00',
      endTime: '17:00',
      dueDate: null,
      categoryId: null,
    },
  })
  assert.equal(parsed.draft.startTime, '15:00')
  assert.throws(() => mapParsedSchedule({ error: { code: 'INVALID_INPUT', message: '입력 내용을 확인해주세요.' } }), (error: unknown) => {
    assert.ok(error instanceof AppError)
    assert.equal(error.code, 'INVALID_INPUT')
    assert.equal(error.message.includes('stack'), false)
    return true
  })
  const missing = mapDbError({ code: 'PGRST116', message: 'row not found' }, 'CATEGORY_NOT_FOUND')
  assert.equal(missing.code, 'CATEGORY_NOT_FOUND')
  assert.equal(missing.message.includes('row not found'), false)
  const denied = mapDbError({ code: 'PGRST301', message: 'JWT expired' })
  assert.equal(denied.code, 'UNAUTHORIZED')
})
