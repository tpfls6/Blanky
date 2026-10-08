import { createDiaryRepository, diaryTitle } from '@blanky/api'
import type { DiaryEntry } from '../../types/records.ts'
import { getCurrentUserId } from '../auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'
export { diaryTitle }
const syncedKey = (userId: string) => 'blanky.diary.synced.' + userId
export function hasSyncedDiary(userId: string, id: string): boolean {
  try { return (JSON.parse(localStorage.getItem(syncedKey(userId)) ?? '[]') as string[]).includes(id) } catch { return false }
}
function markSynced(userId: string, ids: string[]) {
  const previous = JSON.parse(localStorage.getItem(syncedKey(userId)) ?? '[]') as string[]
  localStorage.setItem(syncedKey(userId), JSON.stringify([...new Set([...previous, ...ids])]))
}
async function repository(userId: string) {
  if (await getCurrentUserId() !== userId) throw new Error('사용자가 변경되었습니다.')
  return createDiaryRepository(getSupabaseClient(), userId)
}
export async function getDiaryRecords(userId: string): Promise<DiaryEntry[]> {
  if (!isSupabaseConfigured) return []
  const entries = await (await repository(userId)).getDiaryRecords()
  markSynced(userId, entries.map(entry => entry.id))
  return entries
}
export async function saveDiaryRecord(userId: string, entry: DiaryEntry): Promise<DiaryEntry> {
  if (!isSupabaseConfigured) return entry
  const saved = await (await repository(userId)).saveDiaryRecord(entry)
  markSynced(userId, [entry.id, saved.id])
  return saved
}
export async function deleteDiaryRecord(userId: string, id: string): Promise<void> {
  if (isSupabaseConfigured) await (await repository(userId)).deleteDiaryRecord(id)
}
// Keep pending edits through refresh/navigation, independently of acknowledged server saves.
const draftKey = (userId: string) => 'blanky.diary.draft.' + userId
export function readDiaryDraft(userId: string): DiaryEntry | null {
  try {
    const entry = JSON.parse(localStorage.getItem(draftKey(userId)) ?? 'null') as DiaryEntry | null
    return entry && typeof entry.id === 'string' && typeof entry.body === 'string' && typeof entry.date === 'string' && Array.isArray(entry.tags) ? entry : null
  } catch { return null }
}
export function storeDiaryDraft(userId: string, entry: DiaryEntry | null) {
  if (entry) localStorage.setItem(draftKey(userId), JSON.stringify(entry))
  else localStorage.removeItem(draftKey(userId))
}

export function clearSavedDiaryDraft(userId: string, savedDraft: DiaryEntry) {
  const stored = readDiaryDraft(userId)
  // A previous page instance must not clear edits made after returning to the page.
  if (stored && JSON.stringify(stored) === JSON.stringify(savedDraft)) storeDiaryDraft(userId, null)
}
