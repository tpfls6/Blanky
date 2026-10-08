import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.generated.ts'
import { AppError } from './errors.ts'
import { createRecordRepository } from './recordRepository.ts'
import type { CustomRecord } from '../../types/src/record.ts'

export type DiaryRecord = {
  id: string; date: string; body: string; title?: string; mood?: string; weather?: string
  tags: string[]; isFavorite?: boolean; createdAt: string; updatedAt: string
}
export const DIARY_TYPE_MARKER = 'blanky:system:diary:v1'
export async function diaryRecordId(userId: string, id: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id
  // Legacy browser IDs (including diary-seed) must never reach a UUID DB filter.
  // Account + source ID gives a stable mapping even if a migration is retried.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(DIARY_TYPE_MARKER + '\0' + userId + '\0' + id))
  const bytes = new Uint8Array(digest).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}
export function diaryTitle(entry: Pick<DiaryRecord, 'title' | 'body'>): string {
  return entry.title?.trim() || entry.body.trim().split(/[\n.!?。]/)[0].slice(0, 48) || '제목 없는 기록'
}
export function mapDiaryRecord(record: CustomRecord): DiaryRecord {
  const v = record.values
  const string = (key: string) => typeof v[key] === 'string' ? v[key] as string : undefined
  return { id: record.id, title: string('manualTitle') ?? record.title, body: string('body') ?? '',
    date: string('date') ?? record.createdAt.slice(0, 10), mood: string('mood'), weather: string('weather'),
    tags: Array.isArray(v.tags) ? v.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    isFavorite: v.isFavorite === true, createdAt: string('createdAt') ?? record.createdAt, updatedAt: record.updatedAt }
}
function missing(error: unknown, code: string): boolean { return error instanceof AppError && error.code === code }
export function createDiaryRepository(client: SupabaseClient<Database>, userId: string) {
  const records = createRecordRepository(client)
  // Stable per-account UUID prevents duplicate system templates across tabs/devices.
  const typeId = userId.slice(0, -12) + (BigInt('0x' + userId.slice(-12)) ^ 0xd1a000000001n).toString(16).padStart(12, '0')
  let typeReady: Promise<string> | null = null
  const ensureType = () => {
    if (!typeReady) typeReady = (async () => {
      try {
        const type = await records.getCustomRecordType(typeId)
        if (type.description !== DIARY_TYPE_MARKER) throw new Error('다이어리 템플릿 ID 충돌')
      } catch (error) {
        if (!missing(error, 'CUSTOM_RECORD_TYPE_NOT_FOUND')) throw error
        try { await records.createCustomRecordType(userId, { id: typeId, name: 'Diary', description: DIARY_TYPE_MARKER, icon: 'BookOpen', color: '', blocks: [] }) }
        catch (createError) {
          const existing = await records.getCustomRecordType(typeId).catch(() => { throw createError })
          if (existing.description !== DIARY_TYPE_MARKER) throw createError
        }
      }
      return typeId
    })().catch(error => { typeReady = null; throw error })
    return typeReady
  }
  return {
    async getDiaryRecords() {
      // Reading an empty diary does not create a template or empty record.
      try {
        const type = await records.getCustomRecordType(typeId)
        if (type.description !== DIARY_TYPE_MARKER) throw new Error('다이어리 템플릿 ID 충돌')
      }
      catch (error) { if (missing(error, 'CUSTOM_RECORD_TYPE_NOT_FOUND')) return []; throw error }
      return (await records.getCustomRecords(typeId)).map(mapDiaryRecord)
    },
    async saveDiaryRecord(inputEntry: DiaryRecord) {
      const entry = { ...inputEntry, id: await diaryRecordId(userId, inputEntry.id) }
      if (!entry.title?.trim() && !entry.body.trim()) {
        try { await records.getCustomRecord(entry.id) }
        catch (error) { if (missing(error, 'CUSTOM_RECORD_NOT_FOUND')) throw new AppError('INVALID_INPUT', '내용을 입력해 주세요.'); throw error }
      }
      const recordTypeId = await ensureType()
      const input = { id: entry.id, recordTypeId, title: diaryTitle(entry), values: {
        kind: DIARY_TYPE_MARKER, manualTitle: entry.title ?? '', body: entry.body, date: entry.date,
        mood: entry.mood ?? '', weather: entry.weather ?? '', tags: entry.tags,
        isFavorite: entry.isFavorite ?? false, createdAt: entry.createdAt, weatherSource: 'manual',
      } }
      try {
        const existing = await records.getCustomRecord(entry.id)
        if (existing.recordTypeId !== recordTypeId) throw new AppError('INVALID_INPUT', '다른 기록 유형입니다.')
        return mapDiaryRecord(await records.updateCustomRecord(entry.id, input))
      } catch (error) {
        if (!missing(error, 'CUSTOM_RECORD_NOT_FOUND')) throw error
        if (!entry.title?.trim() && !entry.body.trim()) throw new AppError('INVALID_INPUT', '내용을 입력해 주세요.')
        try { return mapDiaryRecord(await records.createCustomRecord(userId, input)) }
        catch (createError) {
          const existing = await records.getCustomRecord(entry.id).catch(() => { throw createError })
          if (existing.recordTypeId !== recordTypeId) throw createError
          return mapDiaryRecord(await records.updateCustomRecord(entry.id, input))
        }
      }
    },
    async deleteDiaryRecord(sourceId: string) {
      const id = await diaryRecordId(userId, sourceId)
      const record = await records.getCustomRecord(id)
      if (record.recordTypeId !== typeId) throw new AppError('INVALID_INPUT', '다른 기록 유형입니다.')
      await records.deleteCustomRecord(id)
    },
  }
}
