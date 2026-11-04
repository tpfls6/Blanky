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

export function pageTypeMarker(template: PageTemplateKind): string {
  return `blanky:page:${template}:v1`
}

export function isSystemRecordType(description: string): boolean {
  return description.startsWith('blanky:')
}
