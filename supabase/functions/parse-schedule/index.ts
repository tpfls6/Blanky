import { createClient } from 'npm:@supabase/supabase-js@2'
import { createScheduleHandler } from './handler.ts'
import type { CategoryRef, LearnedRule, ScheduleKind } from '../../../packages/parse/src/model.ts'

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void
  env: { get(key: string): string | undefined }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function readKind(value: unknown): ScheduleKind | null {
  return value === 'event' || value === 'task' ? value : null
}
async function loadPersonal(request: Request): Promise<{ categories: CategoryRef[]; rules: LearnedRule[] }> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !key || !authorization) return { categories: [], rules: [] }
  try {
    const client = createClient(url, key, { global: { headers: { Authorization: authorization } } })
    const [categories, rules] = await Promise.all([
      client.from('categories').select('id, name, parent_id'),
      client.from('user_classification_rules').select('pattern, target_type, category_id, weight'),
    ])
    return {
      categories: (categories.data ?? []).flatMap((row) => {
        if (!isRecord(row) || typeof row.id !== 'string' || typeof row.name !== 'string') return []
        return [{ id: row.id, name: row.name, parentId: typeof row.parent_id === 'string' ? row.parent_id : null }]
      }),
      rules: (rules.data ?? []).flatMap((row) => {
        if (!isRecord(row) || typeof row.pattern !== 'string') return []
        const weight = typeof row.weight === 'number' ? row.weight : 1
        return [{
          pattern: row.pattern,
          targetType: readKind(row.target_type),
          categoryId: typeof row.category_id === 'string' ? row.category_id : null,
          weight,
        }]
      }),
    }
  } catch {
    return { categories: [], rules: [] }
  }
}

Deno.serve(createScheduleHandler({
  getEnv: key => Deno.env.get(key),
  authorize: async request => {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY')
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!url || !key || !token) return false
    try {
      const client = createClient(url, key)
      const { data, error } = await client.auth.getUser(token)
      return !error && Boolean(data.user)
    } catch { return false }
  },
  loadPersonal,
  log: entry => console.log(JSON.stringify(entry)),
}))
