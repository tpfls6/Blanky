import type { ParsedSchedule, ScheduleDraftFields, ScheduleKind } from './model.ts'

export type ProviderParseInput = {
  text: string
  today: string
  timezone: string
  type: ScheduleKind
  draft: ScheduleDraftFields
}

export type AIProvider = {
  parseSchedule(input: ProviderParseInput): Promise<ParsedSchedule | null>
  classifyRecord(input: { text: string; schema: unknown }): Promise<Record<string, string | number> | null>
  extractFields(input: { text: string; schema: unknown }): Promise<Record<string, string | number> | null>
}

export type ProviderEnv = {
  aiProvider?: string
  openaiKey?: string
  geminiKey?: string
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readDay(value: unknown): string | null {
  return typeof value === 'string' && DAY.test(value) ? value : null
}

function readClock(value: unknown): string | null {
  return typeof value === 'string' && CLOCK.test(value) ? value : null
}

export function readModelSchedule(value: unknown): ParsedSchedule | null {
  const row = typeof value === 'string' ? parseJson(value) : value
  if (!isRecord(row)) return null
  const type = row.type === 'task' ? 'task' : row.type === 'event' ? 'event' : null
  const draft = isRecord(row.draft) ? row.draft : row
  const title = typeof draft.title === 'string' ? draft.title.trim() : ''
  if (!type || !title) return null
  const confidence = typeof row.confidence === 'number' && row.confidence >= 0 && row.confidence <= 1
    ? row.confidence
    : 0.85
  return {
    type,
    confidence,
    source: 'ai',
    draft: {
      title,
      date: readDay(draft.date),
      startTime: readClock(draft.startTime),
      endTime: readClock(draft.endTime),
      dueDate: readDay(draft.dueDate),
      endDate: readDay(draft.endDate),
      categoryId: typeof draft.categoryId === 'string' ? draft.categoryId : null,
    },
  }
}

export function readModelFields(value: unknown): Record<string, string | number> | null {
  const row = typeof value === 'string' ? parseJson(value) : value
  if (!isRecord(row)) return null
  const source = isRecord(row.fields) ? row.fields : row
  const fields: Record<string, string | number> = {}
  for (const [key, item] of Object.entries(source)) {
    if (key === 'type' || key === 'draft' || key === 'confidence') continue
    if (typeof item === 'string' || typeof item === 'number') fields[key] = item
  }
  return Object.keys(fields).length > 0 ? fields : null
}

function parseJson(text: string): unknown {
  const fenced = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(fenced) as unknown
  } catch {
    return null
  }
}

function schedulePrompt(input: ProviderParseInput): string {
  return [
    'Return JSON only.',
    '{"type":"event|task","confidence":0.9,"draft":{"title":"","date":"YYYY-MM-DD or null","startTime":"HH:mm or null","endTime":"HH:mm or null","dueDate":"YYYY-MM-DD or null","endDate":null,"categoryId":null}}',
    `Today ${input.today}. Timezone ${input.timezone}.`,
    `Rule: ${JSON.stringify({ type: input.type, draft: input.draft })}`,
    input.text,
  ].join('\n')
}

class LocalProvider implements AIProvider {
  parseSchedule(): Promise<ParsedSchedule | null> {
    return Promise.resolve(null)
  }

  classifyRecord(): Promise<Record<string, string | number> | null> {
    return Promise.resolve(null)
  }

  extractFields(): Promise<Record<string, string | number> | null> {
    return Promise.resolve(null)
  }
}

class FetchProvider implements AIProvider {
  private readonly complete: (prompt: string) => Promise<string | null>

  constructor(complete: (prompt: string) => Promise<string | null>) {
    this.complete = complete
  }

  async parseSchedule(input: ProviderParseInput): Promise<ParsedSchedule | null> {
    const text = await this.complete(schedulePrompt(input))
    if (!text) return null
    return readModelSchedule(text)
  }

  async classifyRecord(input: { text: string; schema: unknown }): Promise<Record<string, string | number> | null> {
    return this.extractFields(input)
  }

  async extractFields(input: { text: string; schema: unknown }): Promise<Record<string, string | number> | null> {
    const text = await this.complete(
      `Return JSON only. fields object. Schema ${JSON.stringify(input.schema)}\n${input.text}`,
    )
    if (!text) return null
    return readModelFields(text)
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string>): Promise<string | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!response.ok) return null
  return response.text()
}

function openAI(key: string): AIProvider {
  return new FetchProvider(async (prompt) => {
    const raw = await postJson(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: 'You return JSON only.' },
          { role: 'user', content: prompt },
        ],
      },
      { Authorization: `Bearer ${key}` },
    )
    if (!raw) return null
    const body = parseJson(raw)
    if (!isRecord(body) || !Array.isArray(body.choices)) return null
    const choice = body.choices[0]
    if (!isRecord(choice) || !isRecord(choice.message)) return null
    return typeof choice.message.content === 'string' ? choice.message.content : null
  })
}

function gemini(key: string): AIProvider {
  return new FetchProvider(async (prompt) => {
    const raw = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      {},
    )
    if (!raw) return null
    const body = parseJson(raw)
    if (!isRecord(body) || !Array.isArray(body.candidates)) return null
    const candidate = body.candidates[0]
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return null
    const part = candidate.content.parts[0]
    if (!isRecord(part) || typeof part.text !== 'string') return null
    return part.text
  })
}

export function createAIProvider(env: ProviderEnv): AIProvider {
  const name = (env.aiProvider ?? '').trim().toLowerCase()
  if (name === 'local') return new LocalProvider()
  if (name === 'gemini') return env.geminiKey ? gemini(env.geminiKey) : new LocalProvider()
  if (name === 'openai') return env.openaiKey ? openAI(env.openaiKey) : new LocalProvider()
  if (env.openaiKey) return openAI(env.openaiKey)
  if (env.geminiKey) return gemini(env.geminiKey)
  return new LocalProvider()
}
