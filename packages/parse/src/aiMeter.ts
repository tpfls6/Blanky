import { AnalysisError } from '../../types/src/aiSchema.ts'

/**
 * Server-side metering and daily quota for paid LLM calls.
 * Every structured OpenAI request passes `before` (quota) and `after` (usage) here, so a request
 * format, a retry or a clause split cannot reach the model without being counted.
 * Logs carry counts, tokens, cost and latency only: never the input text, user id or API key.
 */
export type AIUsage = {
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  latencyMs: number
  ok: boolean
  code?: string
}

export type QuotaDecision = { allowed: boolean; calls: number; tokens: number }

/** Persistent per-user, per-day counter. Implementations must increment atomically. */
export type QuotaStore = {
  consume(input: { day: string; callLimit: number; tokenLimit: number }): Promise<QuotaDecision>
  record(input: { day: string; inputTokens: number; outputTokens: number; costMicroUsd: number }): Promise<void>
}

export type MeterSummary = {
  aiCalls: number
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  /** Estimate from the price table below; tokens are measured from the API response. */
  estCostUsd: number | null
  llmLatencyMs: number
  models: string[]
  quotaCallsToday: number | null
  denied: string | null
}

export type AIMeter = {
  before(model: string): Promise<void>
  after(usage: AIUsage): Promise<void>
  summary(): MeterSummary
}

/** USD per 1M tokens (input, cached input, output). Estimates: update when provider prices change. */
export const AI_PRICING: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, cached: 0.075, output: 0.6 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, cached: 0.025, output: 0.4 },
}

/** Dated snapshots ("gpt-4o-mini-2024-07-18") are priced like their family. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number | null {
  const key = Object.keys(AI_PRICING).sort((a, b) => b.length - a.length).find(name => model === name || model.startsWith(`${name}-`))
  if (!key) return null
  const price = AI_PRICING[key]
  const cached = Math.min(cachedInputTokens, inputTokens)
  return ((inputTokens - cached) * price.input + cached * price.cached + outputTokens * price.output) / 1_000_000
}

/** Calls that were denied before reaching the model; the rule layer keeps working. */
export const QUOTA_CODES = new Set(['AI_QUOTA_EXCEEDED', 'AI_QUOTA_UNAVAILABLE', 'AI_REQUEST_LIMIT'])

export const QUOTA_MESSAGE = '오늘 사용할 수 있는 AI 분석을 모두 사용했어요. 날짜·시간·제목이 분명한 문장은 그대로 저장되고, 내일 다시 AI 분석을 쓸 수 있어요.'

export type MeterLimits = { dailyCalls: number; dailyTokens: number; perRequestCalls: number }

function positiveInt(value: string | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

/** Limits come only from server env, never from the request. */
export function meterLimits(getEnv: (key: string) => string | undefined): MeterLimits {
  return {
    dailyCalls: positiveInt(getEnv('AI_DAILY_CALL_LIMIT'), 30),
    dailyTokens: positiveInt(getEnv('AI_DAILY_TOKEN_LIMIT'), 200_000),
    perRequestCalls: Math.max(1, positiveInt(getEnv('AI_MAX_CALLS_PER_REQUEST'), 2)),
  }
}

/** The quota day is the server's calendar day in a fixed zone, so a client timezone cannot reset it. */
export function quotaDay(now: Date, timezone = 'Asia/Seoul'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const read = (type: string) => parts.find(part => part.type === type)?.value
  return `${read('year')}-${read('month')}-${read('day')}`
}

/**
 * One meter per HTTP request. Without a store the meter fails closed: no quota, no paid call.
 */
export function createAIMeter(options: { store: QuotaStore | null; limits: MeterLimits; day: string }): AIMeter {
  const totals = { aiCalls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cost: 0, priced: true, latency: 0 }
  const models = new Set<string>()
  let quotaCallsToday: number | null = null
  let denied: string | null = null
  let attempts = 0
  const deny = (code: string, message: string): never => { denied = code; throw new AnalysisError(code, message) }
  return {
    async before() {
      if (attempts >= options.limits.perRequestCalls) deny('AI_REQUEST_LIMIT', QUOTA_MESSAGE)
      if (!options.store) deny('AI_QUOTA_UNAVAILABLE', 'AI 사용량을 확인하지 못해 AI 분석을 건너뛰었어요. 잠시 후 다시 시도해 주세요.')
      let decision: QuotaDecision
      try {
        decision = await options.store!.consume({ day: options.day, callLimit: options.limits.dailyCalls, tokenLimit: options.limits.dailyTokens })
      } catch {
        return deny('AI_QUOTA_UNAVAILABLE', 'AI 사용량을 확인하지 못해 AI 분석을 건너뛰었어요. 잠시 후 다시 시도해 주세요.')
      }
      quotaCallsToday = decision.calls
      if (!decision.allowed) deny('AI_QUOTA_EXCEEDED', QUOTA_MESSAGE)
      attempts += 1
    },
    async after(usage) {
      totals.aiCalls += 1
      totals.inputTokens += usage.inputTokens
      totals.outputTokens += usage.outputTokens
      totals.cachedInputTokens += usage.cachedInputTokens
      totals.latency += usage.latencyMs
      models.add(usage.model)
      const cost = estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens)
      if (cost === null) totals.priced = false
      else totals.cost += cost
      if (!options.store || (!usage.inputTokens && !usage.outputTokens)) return
      try {
        await options.store.record({ day: options.day, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costMicroUsd: Math.round((cost ?? 0) * 1_000_000) })
      } catch { /* usage totals are best effort; the call count was already consumed */ }
    },
    summary() {
      return {
        aiCalls: totals.aiCalls,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cachedInputTokens: totals.cachedInputTokens,
        estCostUsd: totals.aiCalls && totals.priced ? Number(totals.cost.toFixed(6)) : totals.aiCalls ? null : 0,
        llmLatencyMs: totals.latency,
        models: [...models],
        quotaCallsToday,
        denied,
      }
    },
  }
}
