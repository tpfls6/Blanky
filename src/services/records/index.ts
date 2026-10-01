import {
  AppError,
  createRecordRepository,
  type CustomRecordInput,
  type CustomRecordTypeInput,
} from '@blanky/api'
import type { CustomRecord, CustomRecordType } from '@blanky/types'
import { getCurrentUserId } from '../auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

async function repository() {
  if (!isSupabaseConfigured) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
  const userId = await getCurrentUserId()
  if (!userId) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
  return { userId, records: createRecordRepository(getSupabaseClient()) }
}

export async function getCustomRecordTypes(): Promise<CustomRecordType[]> {
  const { records } = await repository()
  return records.getCustomRecordTypes()
}

export async function getCustomRecordType(id: string): Promise<CustomRecordType> {
  const { records } = await repository()
  return records.getCustomRecordType(id)
}

export async function createCustomRecordType(input: CustomRecordTypeInput): Promise<CustomRecordType> {
  const { userId, records } = await repository()
  return records.createCustomRecordType(userId, input)
}

export async function updateCustomRecordType(id: string, input: Partial<CustomRecordTypeInput>): Promise<CustomRecordType> {
  const { records } = await repository()
  return records.updateCustomRecordType(id, input)
}

export async function deleteCustomRecordType(id: string): Promise<void> {
  const { records } = await repository()
  return records.deleteCustomRecordType(id)
}

export async function getCustomRecords(typeId: string): Promise<CustomRecord[]> {
  const { records } = await repository()
  return records.getCustomRecords(typeId)
}

export async function getCustomRecord(id: string): Promise<CustomRecord> {
  const { records } = await repository()
  return records.getCustomRecord(id)
}

export async function createCustomRecord(input: CustomRecordInput): Promise<CustomRecord> {
  const { userId, records } = await repository()
  return records.createCustomRecord(userId, input)
}

export async function updateCustomRecord(id: string, input: Partial<CustomRecordInput>): Promise<CustomRecord> {
  const { records } = await repository()
  return records.updateCustomRecord(id, input)
}

export async function deleteCustomRecord(id: string): Promise<void> {
  const { records } = await repository()
  return records.deleteCustomRecord(id)
}
