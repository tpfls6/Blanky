import { createClient } from 'npm:@supabase/supabase-js@2'
import { deleteAccount, resolveDeletionTarget, type DeletionCaller } from '../../../packages/api/src/accountDeletion.ts'
import { revokeToken } from '../../../packages/api/src/calendarSync/oauth.ts'

declare const Deno: {
  serve(handler: (request: Request) => Promise<Response>): void
  env: { get(key: string): string | undefined }
}

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: HEADERS })
  if (request.method !== 'POST') return reply({ error: '지원하지 않는 요청입니다.' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!url || !service || !token) return reply({ error: '로그인이 필요합니다.' }, 401)
  const admin = createClient(url, service, { auth: { persistSession: false } })

  let caller: DeletionCaller
  if (token === service) {
    caller = { kind: 'service' }
  } else {
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return reply({ error: '로그인이 필요합니다.' }, 401)
    const { data: adminRow } = await admin.from('app_admins').select('user_id').eq('user_id', data.user.id).maybeSingle()
    caller = { kind: 'user', id: data.user.id, isAdmin: Boolean(adminRow) }
  }
  const target = resolveDeletionTarget(caller, await request.json().catch(() => null))
  if (!target.ok) return reply({ error: target.message }, target.status)

  try {
    const report = await deleteAccount({
      async googleTokens(userId) {
        const { data, error } = await admin.from('google_calendar_connections').select('refresh_token, access_token').eq('user_id', userId).maybeSingle()
        if (error) throw error
        const token = data?.refresh_token ?? data?.access_token
        return token ? [token] : []
      },
      revokeGoogleToken: (value) => revokeToken(value),
      async deleteUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (!error) return 'deleted'
        if (error.status === 404) return 'missing'
        throw error
      },
      async storageLeftovers(userId) {
        const { data, error } = await admin.rpc('account_storage_leftovers', { p_user_id: userId })
        if (error) throw error
        return (data ?? []).map((row: { bucket_id: string; name: string }) => ({ bucket: row.bucket_id, name: row.name }))
      },
      async removeObjects(bucket, names) {
        const { error } = await admin.storage.from(bucket).remove([...names])
        if (error) throw error
      },
    }, target.userId)
    return reply(report)
  } catch (error) {
    console.error('delete-account failed', error)
    return reply({ error: '계정을 삭제하지 못했습니다. 다시 시도해 주세요.' }, 500)
  }
})
