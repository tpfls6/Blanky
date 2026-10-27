import { AnalysisError } from '../../types/src/aiSchema.ts'
export type OpenAIOptions = { key?: string; model?: string; fetch?: typeof fetch; timeoutMs?: number }
/** Server-only structured transport shared by extraction and planning semantics. */
export async function requestStructuredOutput(options: OpenAIOptions, schema: unknown, instructions: string, input: unknown): Promise<unknown> {
  if (!options.key) throw new AnalysisError('AI_NOT_CONFIGURED', 'OpenAI 분석이 아직 설정되지 않았어요.')
  const model = options.model || 'gpt-4o-mini'
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new AnalysisError('AI_NOT_CONFIGURED', 'AI 모델 설정을 확인해 주세요.')
  let response: Response
  try {
    response = await (options.fetch ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.key}` }, signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
      body: JSON.stringify({ model, store: false, instructions, input: JSON.stringify(input), text: { format: { type: 'json_schema', name: 'blanky_analysis', strict: true, schema } }, max_output_tokens: 12000 }),
    })
  } catch { throw new AnalysisError('AI_UNAVAILABLE', 'AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.') }
  if (!response.ok) throw new AnalysisError(response.status === 429 ? 'AI_RATE_LIMITED' : 'AI_UNAVAILABLE', response.status === 429 ? 'AI 요청 한도를 초과했어요. 잠시 후 다시 시도해 주세요.' : 'AI 분석 요청에 실패했어요. 잠시 후 다시 시도해 주세요.')
  try {
    const body = await response.json()
    if (body?.status !== 'completed' || !Array.isArray(body?.output)) throw new AnalysisError()
    const content = body.output.filter((entry: { type?: string }) => entry.type === 'message').flatMap((entry: { content?: unknown[] }) => entry.content ?? [])
    if (content.some((part: { type?: string }) => part.type === 'refusal')) throw new AnalysisError('AI_REFUSED', 'AI가 입력을 분석하지 못했어요. 표현을 바꿔 다시 입력해 주세요.')
    const text = content.filter((part: { type?: string; text?: unknown }) => part.type === 'output_text' && typeof part.text === 'string').map((part: { text: string }) => part.text).join('')
    return JSON.parse(text)
  } catch (error) { if (error instanceof AnalysisError) throw error; throw new AnalysisError() }
}
