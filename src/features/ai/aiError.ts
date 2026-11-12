import type { useI18n } from '../../i18n/useI18n.ts'

type Translate = ReturnType<typeof useI18n>['t']
/** The text servers deployed before AnalysisError dropped its built-in message still send. */
const LEGACY_INVALID = 'AI 분석 결과가 올바르지 않아 저장하지 않았어요. 다시 입력해 주세요.'

/** Codes whose meaning is fixed, so the app's own sentence replaces the package's Korean text. */
const KNOWN: Record<string, string> = {
  AI_NOT_CONFIGURED: 'aiNotConfigured',
  AI_UNAVAILABLE: 'aiUnavailable',
  AI_REFUSED: 'aiRefused',
}

/** AI packages report a rejected analysis by code only; it reads as a sentence in the app's language. */
export function aiErrorText(t: Translate, error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const code = (error as Error & { code?: unknown }).code
  if (code === 'AI_RESPONSE_INVALID' && (error.message === code || error.message === LEGACY_INVALID)) return t('aiResponseInvalid')
  if (typeof code === 'string' && Object.hasOwn(KNOWN, code)) return t(KNOWN[code])
  return error.message || fallback
}
