import { AppError, type Database } from '@blanky/api'
import { coercePage, type UserPage } from '../../features/builder/schema.ts'
import { getCurrentUserId } from '../auth/index.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

type PageRow = {
  id: string
  user_id: string
  name: string
  icon: string
  sort: number
  kind: string
  schema_version: number
  blocks: unknown
  created_at: string
  updated_at: string
}

function mapRow(row: PageRow): UserPage | null {
  return coercePage({
    id: row.id,
    name: row.name,
    icon: row.icon,
    sort: row.sort,
    schemaVersion: row.schema_version,
    blocks: row.blocks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

async function client() {
  if (!isSupabaseConfigured) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
  const userId = await getCurrentUserId()
  if (!userId) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
  return { userId, db: getSupabaseClient() }
}

export async function listUserPages(kind: 'page' | 'template' = 'page'): Promise<UserPage[]> {
  const { db } = await client()
  const { data, error } = await db.from('user_pages').select('*').eq('kind', kind).order('sort', { ascending: true })
  if (error) throw new AppError('NETWORK', error.message)
  return ((data ?? []) as PageRow[]).flatMap((row) => {
    const next = mapRow(row)
    return next ? [next] : []
  })
}

export async function upsertUserPage(page: UserPage, kind: 'page' | 'template' = 'page'): Promise<void> {
  const { userId, db } = await client()
  const row: Database['public']['Tables']['user_pages']['Insert'] = {
    id: page.id,
    user_id: userId,
    name: page.name,
    icon: page.icon,
    sort: page.sort,
    kind,
    schema_version: page.schemaVersion,
    blocks: JSON.parse(JSON.stringify(page.blocks)) as Database['public']['Tables']['user_pages']['Insert']['blocks'],
    created_at: page.createdAt,
    updated_at: page.updatedAt,
  }
  const { error } = await db.from('user_pages').upsert(row)
  if (error) throw new AppError('NETWORK', error.message)
}

export async function deleteUserPage(id: string): Promise<void> {
  const { db } = await client()
  const { error } = await db.from('user_pages').delete().eq('id', id)
  if (error) throw new AppError('NETWORK', error.message)
}
