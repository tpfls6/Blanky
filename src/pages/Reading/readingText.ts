import type { ReadingStatus } from '@blanky/types'
import { localeTag, type AppLocale } from '../../i18n/locale.ts'
import type { useI18n } from '../../i18n/useI18n.ts'

type Translate = ReturnType<typeof useI18n>['t']

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

/** Words the reading page uses everywhere, in the app's language (`reading.word.*`) unless a custom page's
 *  field labels rename them. `say` fills a `reading.*` message with them; Korean particles are worked out
 *  here (itemObj = 책을), and English ignores them. */
export function readingText(t: Translate, locale: AppLocale, labels: Record<string, string> = {}) {
  const word = (key: string) => labels[key]?.trim() || t('reading.word.' + key)
  // English defaults sit mid-sentence in lower case; a custom label keeps how it was typed.
  const inline = (key: string) => locale === 'en' && !labels[key]?.trim() ? word(key).toLowerCase() : word(key)
  const particle = (value: string, which: Particle) => locale === 'ko' ? josa(value, which) : value
  const number = new Intl.NumberFormat(localeTag(locale))
  const item = word('item'), library = word('library'), shelf = word('shelf'), highlight = word('highlight'), memo = word('memo')
  // A custom shelf label cannot be made plural by adding "s" (shelf → shelfs), so it takes a phrase that needs none.
  const shelves = labels.shelf?.trim() ? t('reading.word.shelfList', { shelf }) : t('reading.word.shelves')
  // Same for other words: the default has its own plural (books), a custom label stays as typed (Favorite Box).
  const plural = (key: string, value: string) => labels[key]?.trim() ? value : t('reading.word.' + key + 's')
  const vars = {
    item, itemObj: particle(item, '을'), library, libraryObj: particle(library, '을'), libraryTo: particle(library, '으로'),
    shelf, shelves, shelfObj: particle(shelf, '을'), highlight, highlightObj: particle(highlight, '을'), memo,
    items: plural('item', item), highlights: plural('highlight', highlight), memos: plural('memo', memo),
  }
  return {
    t,
    word,
    inline,
    item,
    unit: word('unit'),
    library,
    shelf,
    highlight,
    memo,
    say: (key: string, extra: Record<string, string | number> = {}) => t('reading.' + key, { ...vars, ...extra }),
    /** "3권" / "3 books"; `which` adds a Korean particle after the unit (3권이). */
    count: (value: number, which?: Particle) => {
      const unit = labels.unit?.trim() || t(value === 1 ? 'reading.word.unitOne' : 'reading.word.unit')
      const text = number.format(value) + (locale === 'ko' ? '' : ' ') + unit
      return which ? particle(text, which) : text
    },
    number: (value: number) => number.format(value),
    percent: (value: number) => new Intl.NumberFormat(localeTag(locale), { style: 'percent' }).format(value),
    date: (iso: string) => new Date(iso).toLocaleDateString(localeTag(locale)),
    /** A word standing alone (a tab, a card label) starts upper case in English. */
    cap: (value: string) => locale === 'en' ? value.charAt(0).toUpperCase() + value.slice(1) : value,
    status: (id: ReadingStatus) => word(STATUS_KEYS[id]),
    statuses: () => (Object.keys(STATUS_KEYS) as ReadingStatus[]).map((id) => [id, word(STATUS_KEYS[id])] as const),
  }
}

export type ReadingText = ReturnType<typeof readingText>
