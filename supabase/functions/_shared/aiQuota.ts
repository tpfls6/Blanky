import type { QuotaDecision, QuotaStore } from '../../../packages/parse/src/aiMeter.ts'

/** The subset of a Supabase client used here (service-role client; never the caller's). */
type RpcClient = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

/**
 * Quota rows are written only through service-role RPCs (see migration ai_usage_quota), keyed by
 * the user id taken from the verified JWT. Nothing in the request body can name another user,
 * pick a day or raise the limit.
 */
export function createQuotaStore(service: RpcClient, userId: string): QuotaStore {
  return {
    async consume({ day, callLimit, tokenLimit }) {
      const { data, error } = await service.rpc('consume_ai_call', { p_user_id: userId, p_usage_date: day, p_call_limit: callLimit, p_token_limit: tokenLimit })
      if (error) throw new Error('quota unavailable')
      const row = (Array.isArray(data) ? data[0] : data) as Partial<QuotaDecision & { allowed: unknown }> | null
      if (!row || typeof row.allowed !== 'boolean') throw new Error('quota unavailable')
      return { allowed: row.allowed, calls: Number(row.calls ?? 0), tokens: Number(row.tokens ?? 0) }
    },
    async record({ day, inputTokens, outputTokens, costMicroUsd }) {
      const { error } = await service.rpc('record_ai_usage', { p_user_id: userId, p_usage_date: day, p_input_tokens: inputTokens, p_output_tokens: outputTokens, p_cost_micro_usd: costMicroUsd })
      if (error) throw new Error('usage not recorded')
    },
  }
}
