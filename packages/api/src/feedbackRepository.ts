import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClassificationFeedback, ClassificationKind } from '../../types/src/feedback.ts'
import { rulesFromFeedback } from '../../parse/src/learn.ts'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { isRecord, readNullableString, readString } from './guards.ts'
import { asJson, asRecord } from './json.ts'

export type FeedbackInput = {
  inputText: string
  predictedType: ClassificationKind | null
  correctedType: ClassificationKind | null
  predictedCategoryId: string | null
  correctedCategoryId: string | null
  fieldCorrections?: Record<string, { predicted: string | null; corrected: string | null }>
}

function readKind(value: unknown): ClassificationKind | null {
  return value === 'event' || value === 'task' ? value : null
}

export function mapFeedbackRow(value: unknown): ClassificationFeedback {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '수정 기록을 읽지 못했습니다.')
  const id = readString(value.id)
  const userId = readString(value.user_id)
  const inputText = readString(value.input_text)
  const createdAt = readString(value.created_at)
  if (!id || !userId || inputText === null || !createdAt) {
    throw new AppError('REQUEST_FAILED', '수정 기록을 읽지 못했습니다.')
  }
  const raw = asRecord(value.field_corrections)
  const fieldCorrections: ClassificationFeedback['fieldCorrections'] = {}
  for (const [key, item] of Object.entries(raw)) {
    if (!isRecord(item)) continue
    fieldCorrections[key] = {
      predicted: readNullableString(item.predicted),
      corrected: readNullableString(item.corrected),
    }
  }
  return {
    id,
    userId,
    inputText,
    predictedType: readKind(value.predicted_type),
    correctedType: readKind(value.corrected_type),
    predictedCategoryId: readNullableString(value.predicted_category_id),
    correctedCategoryId: readNullableString(value.corrected_category_id),
    fieldCorrections,
    createdAt,
  }
}

async function promoteRules(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client
    .from('classification_feedback')
    .select('input_text, corrected_type, corrected_category_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw mapDbError(error)
  const rules = rulesFromFeedback(
    (data ?? []).map((row) => ({
      inputText: row.input_text,
      correctedType: row.corrected_type,
      correctedCategoryId: row.corrected_category_id,
    })),
  )
  if (rules.length === 0) return
  const updatedAt = new Date().toISOString()
  const { error: upsertError } = await client.from('user_classification_rules').upsert(
    rules.map((rule) => ({
      user_id: userId,
      pattern: rule.pattern,
      target_type: rule.targetType,
      category_id: rule.categoryId,
      weight: rule.weight,
      updated_at: updatedAt,
    })),
    { onConflict: 'user_id,pattern' },
  )
  if (upsertError) throw mapDbError(upsertError)
}

export type FeedbackRepository = {
  save: (userId: string, input: FeedbackInput) => Promise<ClassificationFeedback>
  list: () => Promise<ClassificationFeedback[]>
}

export function createFeedbackRepository(client: SupabaseClient<Database>): FeedbackRepository {
  return {
    async save(userId, input) {
      const text = input.inputText.trim()
      if (!text) throw new AppError('INVALID_INPUT', '입력 내용을 확인해주세요.')
      const { data, error } = await client
        .from('classification_feedback')
        .insert({
          user_id: userId,
          input_text: text,
          predicted_type: input.predictedType,
          corrected_type: input.correctedType,
          predicted_category_id: input.predictedCategoryId,
          corrected_category_id: input.correctedCategoryId,
          field_corrections: asJson(input.fieldCorrections ?? {}),
        })
        .select('*')
        .single()
      if (error) throw mapDbError(error)
      await promoteRules(client, userId)
      return mapFeedbackRow(data)
    },

    async list() {
      const { data, error } = await client
        .from('classification_feedback')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapFeedbackRow)
    },
  }
}
