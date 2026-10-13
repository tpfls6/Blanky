import { createClient } from 'npm:@supabase/supabase-js@2'
import { PARSE_CONFIG } from '../../../packages/parse/src/config.ts'
import { createAIProvider, resolveParse, PlannerRequiredError } from '../../../packages/parse/src/index.ts'
import type { CategoryRef, LearnedRule, ScheduleKind } from '../../../packages/parse/src/model.ts'

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void
  env: { get(key: string): string | undefined }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status })
}

function logParse(entry: {
  requestId: string
  source: string
  latencyMs: number
  ok: boolean
  textLength: number
}) {
  console.log(JSON.stringify(entry))
}

function zonedDate(timezone: string): Date | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const year = Number(parts.find((part) => part.type === 'year')?.value)
    const month = Number(parts.find((part) => part.type === 'month')?.value)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    if (!year || !month || !day) return null
    return new Date(year, month - 1, day)
  } catch {
    return null
  }
}

function todayInTimezone(timezone: string): Date {
  return zonedDate(timezone) ?? zonedDate('Asia/Seoul') ?? new Date()
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

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID()
  const started = Date.now()
  if (request.method !== 'POST') {
    return fail(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.')
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return fail(400, 'INVALID_INPUT', '입력 내용을 확인해주세요.')
  }

  const payload = isRecord(body) ? body : {}
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) return fail(400, 'INVALID_INPUT', '입력 내용을 확인해주세요.')
  const timezone = typeof payload.timezone === 'string' && payload.timezone ? payload.timezone : 'Asia/Seoul'
  const threshold = Number(Deno.env.get('AI_CONFIDENCE_THRESHOLD'))
  const personal = await loadPersonal(request)

  try {
    const parsed = await resolveParse(text, {
      today: todayInTimezone(timezone),
      categories: personal.categories,
      rules: personal.rules,
    }, {
      timezone,
      threshold: Number.isFinite(threshold) && threshold > 0 && threshold <= 1
        ? threshold
        : PARSE_CONFIG.aiConfidenceThreshold,
      provider: createAIProvider({
        aiProvider: Deno.env.get('AI_PROVIDER'),
        openaiKey: Deno.env.get('OPENAI_API_KEY'),
        geminiKey: Deno.env.get('GEMINI_API_KEY'),
      }),
    })
    logParse({
      requestId,
      source: parsed.source,
      latencyMs: Date.now() - started,
      ok: true,
      textLength: text.length,
    })
    return Response.json(parsed)
  } catch (error) {
    if (error instanceof PlannerRequiredError) return fail(422, error.code, error.message)
    logParse({
      requestId,
      source: 'failed',
      latencyMs: Date.now() - started,
      ok: false,
      textLength: text.length,
    })
    return fail(500, 'SCHEDULE_PARSE_FAILED', '일정을 분석하지 못했습니다.')
  }
})
