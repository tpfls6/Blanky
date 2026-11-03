import type { ScheduleAnalysis } from '../../../packages/types/src/ai.ts'
import type { WorkItem } from '../../types/work.ts'
import type { AgentPlan } from './agent.ts'
import type { AutoSaveInput, AutoSaveReview } from './autoSave.ts'

export type ChatStatus = 'working' | 'saved' | 'review' | 'failed' | 'confirm' | 'done'
export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  status?: ChatStatus
  /** Snapshots; chips show the live item when it still exists. */
  items?: WorkItem[]
  before?: WorkItem
  undoIds?: string[]
  preview?: AgentPlan
  choices?: string[]
  /** Ambiguous or conflicting analysis items waiting for confirmation. */
  review?: { analysis: ScheduleAnalysis; input: string; rows: AutoSaveReview[] }
  /** The exact save request, ids included, so a retry is idempotent. */
  retry?: AutoSaveInput[]
  /** A delete asked for in chat runs only after the user confirms it here. */
  remove?: WorkItem
}

const LIMIT = 200

export function loadChat(storage: Pick<Storage, 'getItem'>, key: string): ChatMessage[] {
  try {
    const rows = JSON.parse(storage.getItem(key) ?? '[]')
    if (!Array.isArray(rows)) return []
    return rows.filter((row): row is ChatMessage => row && typeof row.id === 'string' && (row.role === 'user' || row.role === 'assistant') && typeof row.text === 'string')
      // A save cut off by a reload is unknown, not lost: its ids make the retry safe.
      .map(row => row.status === 'working' ? { ...row, status: row.retry?.length ? 'failed' : 'done', text: row.retry?.length ? '저장이 끝나기 전에 중단되었어요. 다시 시도하면 중복 없이 이어서 저장해요.' : row.text } : row)
  } catch {
    return []
  }
}

export function saveChat(storage: Pick<Storage, 'setItem'>, key: string, messages: readonly ChatMessage[]): void {
  try { storage.setItem(key, JSON.stringify(messages.slice(-LIMIT))) } catch { /* a full storage keeps the visible conversation */ }
}
