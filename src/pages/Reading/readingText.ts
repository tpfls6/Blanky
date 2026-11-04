import type { ReadingStatus } from '@blanky/types'
import { fieldLabel } from '../../features/pages/templates.ts'

type Particle = '을' | '이' | '은' | '으로'

const PAIRS: Record<Particle, [string, string]> = {
  을: ['을', '를'],
  이: ['이', '가'],
  은: ['은', '는'],
  으로: ['으로', '로'],
}

/** Attaches the Korean particle that fits the word's last syllable (책을 / 영화를, 서재로 / 책장으로). */
export function josa(word: string, particle: Particle): string {
  const [withFinal, withoutFinal] = PAIRS[particle]
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00
  if (!(code >= 0 && code <= 11171)) return `${word}${withFinal}(${withoutFinal})`
  const final = code % 28
  // ㄹ (final 8) takes 로, like a word without a final consonant.
  const hasFinal = particle === '으로' ? final !== 0 && final !== 8 : final !== 0
  return word + (hasFinal ? withFinal : withoutFinal)
}

const STATUS_KEYS: Record<ReadingStatus, string> = {
  want: 'statusWant',
  reading: 'statusReading',
  done: 'statusDone',
  stopped: 'statusStopped',
}

/** Words the reading page uses everywhere, renamed by a custom page's field labels. */
export function readingText(labels: Record<string, string> = {}) {
  const word = (key: string) => fieldLabel('reading', key, labels)
  return {
    word,
    item: word('item'),
    unit: word('unit'),
    library: word('library'),
    shelf: word('shelf'),
    highlight: word('highlight'),
    memo: word('memo'),
    status: (id: ReadingStatus) => word(STATUS_KEYS[id]),
    statuses: () => (Object.keys(STATUS_KEYS) as ReadingStatus[]).map((id) => [id, word(STATUS_KEYS[id])] as const),
  }
}

export type ReadingText = ReturnType<typeof readingText>
