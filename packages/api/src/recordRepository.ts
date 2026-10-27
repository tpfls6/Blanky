import type { SupabaseClient } from '@supabase/supabase-js'
import type { CustomRecord, CustomRecordType } from '../../types/src/record.ts'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { isRecord, readNumber, readString } from './guards.ts'
import { asJson, asRecord } from './json.ts'

export type CustomRecordTypeInput = {
  id?: string
  name: string
  description?: string
  icon?: string
  color: string
  schemaVersion?: number
  version?: number
  blocks: unknown[]
}

export type CustomRecordInput = {
  id?: string
  recordTypeId: string
  title?: string
  values?: Record<string, unknown>
  templateVersion?: number
}

function blocksFromSchema(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.blocks)) return []
  return value.blocks
}

export function mapCustomRecordTypeRow(value: unknown): CustomRecordType {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '기록 템플릿 응답을 읽지 못했습니다.')
  const id = readString(value.id)
  const userId = readString(value.user_id)
  const name = readString(value.name)
  const createdAt = readString(value.created_at)
  const updatedAt = readString(value.updated_at)
  if (!id || !userId || !name || !createdAt || !updatedAt) {
    throw new AppError('REQUEST_FAILED', '기록 템플릿 응답을 읽지 못했습니다.')
  }
  return {
    id,
    userId,
    name,
    description: readString(value.description) ?? '',
    icon: readString(value.icon) ?? 'StickyNote',
    color: readString(value.color) ?? '',
    schemaVersion: readNumber(value.schema_version) ?? 1,
    version: readNumber(value.version) ?? 1,
    blocks: blocksFromSchema(value.schema),
    createdAt,
    updatedAt,
  }
}

export function mapCustomRecordRow(value: unknown): CustomRecord {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '기록 응답을 읽지 못했습니다.')
  const id = readString(value.id)
  const userId = readString(value.user_id)
  const recordTypeId = readString(value.record_type_id)
  const createdAt = readString(value.created_at)
  const updatedAt = readString(value.updated_at)
  if (!id || !userId || !recordTypeId || !createdAt || !updatedAt) {
    throw new AppError('REQUEST_FAILED', '기록 응답을 읽지 못했습니다.')
  }
  return {
    id,
    userId,
    recordTypeId,
    title: readString(value.title) ?? '',
    values: asRecord(value.values),
    templateVersion: readNumber(value.template_version) ?? 1,
    createdAt,
    updatedAt,
  }
}

function now() {
  return new Date().toISOString()
}

export type RecordRepository = {
  getCustomRecordTypes: () => Promise<CustomRecordType[]>
  getCustomRecordType: (id: string) => Promise<CustomRecordType>
  createCustomRecordType: (userId: string, input: CustomRecordTypeInput) => Promise<CustomRecordType>
  updateCustomRecordType: (id: string, input: Partial<CustomRecordTypeInput>) => Promise<CustomRecordType>
  deleteCustomRecordType: (id: string) => Promise<void>
  getCustomRecords: (typeId: string) => Promise<CustomRecord[]>
  getAllCustomRecords: () => Promise<CustomRecord[]>
  getCustomRecord: (id: string) => Promise<CustomRecord>
  createCustomRecord: (userId: string, input: CustomRecordInput) => Promise<CustomRecord>
  updateCustomRecord: (id: string, input: Partial<CustomRecordInput>) => Promise<CustomRecord>
  deleteCustomRecord: (id: string) => Promise<void>
}

export function createRecordRepository(client: SupabaseClient<Database>): RecordRepository {
  return {
    async getCustomRecordTypes() {
      const { data, error } = await client
        .from('custom_record_types')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapCustomRecordTypeRow)
    },

    async getCustomRecordType(id) {
      const { data, error } = await client.from('custom_record_types').select('*').eq('id', id).maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) throw new AppError('CUSTOM_RECORD_TYPE_NOT_FOUND', '기록 템플릿을 찾지 못했습니다.')
      return mapCustomRecordTypeRow(data)
    },

    async createCustomRecordType(userId, input) {
      const name = input.name.trim()
      if (!name) throw new AppError('INVALID_INPUT', '템플릿 이름을 입력해 주세요.')
      const { data, error } = await client
        .from('custom_record_types')
        .insert({
          ...(input.id ? { id: input.id } : {}),
          user_id: userId,
          name,
          description: input.description ?? '',
          icon: input.icon ?? 'StickyNote',
          color: input.color,
          schema_version: input.schemaVersion ?? 1,
          version: input.version ?? 1,
          schema: asJson({ blocks: input.blocks }),
          updated_at: now(),
        })
        .select('*')
        .single()
      if (error) throw mapDbError(error, 'CUSTOM_RECORD_TYPE_NOT_FOUND')
      return mapCustomRecordTypeRow(data)
    },

    async updateCustomRecordType(id, input) {
      const patch: Database['public']['Tables']['custom_record_types']['Update'] = { updated_at: now() }
      if (input.name !== undefined) {
        const name = input.name.trim()
        if (!name) throw new AppError('INVALID_INPUT', '템플릿 이름을 입력해 주세요.')
        patch.name = name
      }
      if (input.description !== undefined) patch.description = input.description
      if (input.icon !== undefined) patch.icon = input.icon
      if (input.color !== undefined) patch.color = input.color
      if (input.schemaVersion !== undefined) patch.schema_version = input.schemaVersion
      if (input.version !== undefined) patch.version = input.version
      if (input.blocks !== undefined) patch.schema = asJson({ blocks: input.blocks })
      const { data, error } = await client.from('custom_record_types').update(patch).eq('id', id).select('*').maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) throw new AppError('CUSTOM_RECORD_TYPE_NOT_FOUND', '기록 템플릿을 찾지 못했습니다.')
      return mapCustomRecordTypeRow(data)
    },

    async deleteCustomRecordType(id) {
      const { data, error } = await client.from('custom_record_types').delete().eq('id', id).select('id')
      if (error) throw mapDbError(error)
      if (!data || data.length === 0) throw new AppError('CUSTOM_RECORD_TYPE_NOT_FOUND', '기록 템플릿을 찾지 못했습니다.')
    },

    async getCustomRecords(typeId) {
      const { data, error } = await client
        .from('custom_records')
        .select('*')
        .eq('record_type_id', typeId)
        .order('created_at', { ascending: false })
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapCustomRecordRow)
    },

    async getAllCustomRecords() {
      const { data, error } = await client.from('custom_records').select('*').order('created_at', { ascending: false })
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapCustomRecordRow)
    },

    async getCustomRecord(id) {
      const { data, error } = await client.from('custom_records').select('*').eq('id', id).maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) throw new AppError('CUSTOM_RECORD_NOT_FOUND', '기록을 찾지 못했습니다.')
      return mapCustomRecordRow(data)
    },

    async createCustomRecord(userId, input) {
      const { data, error } = await client
        .from('custom_records')
        .insert({
          ...(input.id ? { id: input.id } : {}),
          user_id: userId,
          record_type_id: input.recordTypeId,
          title: input.title?.trim() ?? '',
          template_version: input.templateVersion ?? 1,
          values: asJson(input.values ?? {}),
          updated_at: now(),
        })
        .select('*')
        .single()
      if (error) throw mapDbError(error, 'CUSTOM_RECORD_NOT_FOUND')
      return mapCustomRecordRow(data)
    },

    async updateCustomRecord(id, input) {
      const patch: Database['public']['Tables']['custom_records']['Update'] = { updated_at: now() }
      if (input.title !== undefined) patch.title = input.title.trim()
      if (input.values !== undefined) patch.values = asJson(input.values)
      if (input.templateVersion !== undefined) patch.template_version = input.templateVersion
      const { data, error } = await client.from('custom_records').update(patch).eq('id', id).select('*').maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) throw new AppError('CUSTOM_RECORD_NOT_FOUND', '기록을 찾지 못했습니다.')
      return mapCustomRecordRow(data)
    },

    async deleteCustomRecord(id) {
      const { data, error } = await client.from('custom_records').delete().eq('id', id).select('id')
      if (error) throw mapDbError(error)
      if (!data || data.length === 0) throw new AppError('CUSTOM_RECORD_NOT_FOUND', '기록을 찾지 못했습니다.')
    },
  }
}
