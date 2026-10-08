import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { createScheduleRepository } from './scheduleRepository.ts'
import { mapDbError } from './errors.ts'

const snapshot = { id: 'entity', user_id: 'owner', calendar_id: 'calendar', title: '발표자료', date: '2026-10-09',
  priority: 'medium', status: 'todo', created_at: '2026-10-07T00:00:00Z', updated_at: '2026-10-07T00:00:00Z', kind: 'task', due_date: '2026-10-09' }
test('schema and network errors provide distinct actionable messages', () => {
  assert.equal(mapDbError({ code: 'PGRST205' }).code, 'SCHEMA_MISSING')
  assert.equal(mapDbError({ code: 'PGRST204' }).code, 'SCHEMA_OUTDATED')
  assert.equal(mapDbError({ code: '42703' }).code, 'SCHEMA_OUTDATED')
  assert.equal(mapDbError({ message: 'TypeError: Failed to fetch' }).code, 'NETWORK_ERROR')
})
test('existing history repository maps source and deleted task snapshots', async () => {
  const query = { select() { return this }, eq() { return this }, async order() {
    return { data: [{ id: 'change', schedule_id: 'entity', user_id: 'owner', action: 'deleted', entity_type: 'task', source: 'ai_chat',
      before_data: snapshot, after_data: null, created_at: snapshot.created_at }], error: null }
  } }
  const repo = createScheduleRepository({ from: () => query } as unknown as SupabaseClient<Database>)
  const [change] = await repo.listChanges()
  assert.equal(change.source, 'ai_chat')
  assert.equal(change.entityType, 'task')
  assert.equal(change.beforeData?.title, '발표자료')
  assert.equal(change.beforeData?.dueDate, '2026-10-09')
  assert.equal(change.afterData, null)
})
test('task CRUD sends task fields and AI source through existing repository', async () => {
  let sent: Record<string, unknown> = {}
  const query = { insert(value: Record<string, unknown>) { sent = value; return this }, select() { return this },
    async single() { return { data: snapshot, error: null } } }
  const repo = createScheduleRepository({ from: () => query } as unknown as SupabaseClient<Database>)
  const saved = await repo.create('owner', { title: '발표자료', date: '2026-10-09', kind: 'task', dueDate: '2026-10-09', changeSource: 'ai_chat' })
  assert.equal(sent.kind, 'task')
  assert.equal(sent.due_date, '2026-10-09')
  assert.equal(sent.change_source, 'ai_chat')
  assert.equal(saved.kind, 'task')
})
