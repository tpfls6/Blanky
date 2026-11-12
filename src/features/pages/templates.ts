export const PAGE_TEMPLATES = ['diary', 'reading', 'memo'] as const

export type PageTemplateKind = (typeof PAGE_TEMPLATES)[number]

export const FIELD_KEYS = {
  diary: ['date', 'mood', 'weather', 'title', 'body', 'tags'],
  reading: [
    'title', 'author', 'rating', 'note', 'image', 'status', 'startedAt', 'finishedAt', 'tags', 'category',
    'item', 'unit', 'library', 'shelf', 'highlight', 'memo', 'tagline',
    'statusWant', 'statusReading', 'statusDone', 'statusStopped',
  ],
  memo: ['title', 'body'],
} as const

/** Keys that rename words used across the page (buttons, headings, messages) rather than one input. */
export const TEXT_KEYS: { [K in PageTemplateKind]: readonly (typeof FIELD_KEYS)[K][number][] } = {
  diary: [],
  reading: ['item', 'unit', 'library', 'shelf', 'highlight', 'memo', 'tagline', 'statusWant', 'statusReading', 'statusDone', 'statusStopped'],
  memo: [],
}

export function isTextKey(template: PageTemplateKind, key: string): boolean {
  return (TEXT_KEYS[template] as readonly string[]).includes(key)
}

export type FieldKey<T extends PageTemplateKind = PageTemplateKind> = (typeof FIELD_KEYS)[T][number]

export const DEFAULT_FIELD_LABELS: { [K in PageTemplateKind]: Record<(typeof FIELD_KEYS)[K][number], string> } = {
  diary: {
    date: '기록 날짜',
    mood: '오늘의 기분',
    weather: '오늘의 날씨',
    title: '제목',
    body: '내용',
    tags: '태그',
  },
  reading: {
    title: '책 제목',
    author: '저자',
    rating: '평점',
    note: '독서 감상',
    image: '이미지',
    status: '독서 상태',
    startedAt: '시작일',
    finishedAt: '완독일',
    tags: '책 태그',
    category: '책 종류',
    item: '책',
    unit: '권',
    library: '서재',
    shelf: '책장',
    highlight: '문장',
    memo: '메모',
    tagline: '읽고, 기억하고, 나만의 책장에 담아요.',
    statusWant: '읽을 예정',
    statusReading: '읽는 중',
    statusDone: '완독',
    statusStopped: '중단',
  },
  memo: {
    title: '제목',
    body: '본문',
  },
}

export function isPageTemplate(value: unknown): value is PageTemplateKind {
  return value === 'diary' || value === 'reading' || value === 'memo'
}

export function coerceTemplate(value: unknown): PageTemplateKind | null {
  return isPageTemplate(value) ? value : null
}

export function coerceFieldLabels(value: unknown, template: PageTemplateKind | null): Record<string, string> {
  if (!template || !value || typeof value !== 'object') return {}
  const row = value as Record<string, unknown>
  const labels: Record<string, string> = {}
  for (const key of FIELD_KEYS[template]) {
    const next = row[key]
    if (typeof next === 'string' && next.trim()) labels[key] = next.trim().slice(0, 80)
  }
  return labels
}

export function fieldLabel(template: PageTemplateKind, key: string, overrides: Record<string, string> = {}): string {
  const custom = overrides[key]?.trim()
  if (custom) return custom
  const defaults = DEFAULT_FIELD_LABELS[template] as Record<string, string>
  return defaults[key] ?? key
}

/** The labels a new page starts with. Korean keeps the defaults written out as before; other languages store
 *  none, so the page shows the app language's own words (a stored '책' read "Add 책" in English). */
export function initialFieldLabels(template: PageTemplateKind, locale: string): Record<string, string> {
  return locale === 'ko' ? { ...DEFAULT_FIELD_LABELS[template] } : {}
}

/** The labels a page shows. Outside Korean, a label that is still exactly the Korean default (a page made in
 *  Korean, or before initialFieldLabels) is left out so the app language's word shows instead; a label the
 *  user typed stays, and what is stored is never changed. */
export function shownFieldLabels(template: PageTemplateKind | null | undefined, labels: Record<string, string>, locale: string): Record<string, string> {
  if (locale === 'ko' || !template) return labels
  const defaults = DEFAULT_FIELD_LABELS[template] as Record<string, string>
  return Object.fromEntries(Object.entries(labels).filter(([key, value]) => value.trim() !== defaults[key]))
}

/** Default labels in the app's language for the label editor's captions and placeholders. Only the reading
 *  template has its words translated (`reading.word.*`); the others keep their Korean defaults. */
export function defaultFieldLabels(template: PageTemplateKind, locale: string, translate: (key: string) => string): Record<string, string> {
  if (locale === 'ko' || template !== 'reading') return DEFAULT_FIELD_LABELS[template]
  return Object.fromEntries(FIELD_KEYS.reading.map((key) => {
    const word = translate('reading.word.' + key)
    return [key, word.charAt(0).toUpperCase() + word.slice(1)]
  }))
}

export function pageTypeMarker(template: PageTemplateKind): string {
  return `blanky:page:${template}:v1`
}

export function isSystemRecordType(description: string): boolean {
  return description.startsWith('blanky:')
}
