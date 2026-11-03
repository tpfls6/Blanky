import { blankValues, flatten, requiredError, type Block, type CustomRecordType, type FieldValue } from '../records/schema.ts'
import type { CustomRecord } from '../../types/records.ts'
import { isCalendarDate } from '../../../packages/types/src/aiSchema.ts'

export type NotebookKind = 'movie' | 'finance' | 'travel' | 'study'
export const NOTEBOOKS = {
  movie: { title: '영화 기록', eyebrow: 'CINEMA JOURNAL', tagline: '좋은 영화는 끝나도, 감상은 남으니까.', add: '영화 기록', empty: '당신의 첫 번째 영화를 기다리고 있어요.', hint: '보고 싶은 영화부터 오래 기억할 장면까지, 나만의 영화장을 채워보세요.', filters: ['전체', '보고 싶어요', '감상 완료'], icon: 'Film' },
  finance: { title: '가계부', eyebrow: 'MONEY JOURNAL', tagline: '작은 지출부터 차곡차곡, 나의 생활을 들여다봐요.', add: '내역 추가', empty: '이번 달의 첫 내역을 남겨보세요.', hint: '들어온 돈과 나간 돈을 기록하면 한 달의 흐름이 보여요.', filters: ['전체', '지출', '수입'], icon: 'Wallet' },
  travel: { title: '여행 기록', eyebrow: 'TRAVEL JOURNAL', tagline: '낯선 곳에서 발견한, 나다운 순간들.', add: '여행 기록', empty: '다음 이야기는 어디에서 시작될까요?', hint: '가고 싶은 곳을 적거나 다녀온 여행의 순간을 남겨보세요.', filters: ['전체', '계획 중', '여행 중', '다녀온 여행'], icon: 'MapPin' },
  study: { title: '공부 내용 기록', eyebrow: 'LEARNING JOURNAL', tagline: '오늘 배운 작은 하나가, 내일의 나를 만들어요.', add: '학습 기록', empty: '오늘 새롭게 알게 된 것은 무엇인가요?', hint: '공부한 내용과 배운 점을 적고, 복습할 내용을 모아보세요.', filters: ['전체', '학습 중', '복습 필요', '이해 완료'], icon: 'BookOpen' },
} as const

export function roleField(type: CustomRecordType, role: string): Block | undefined {
  return flatten(type.blocks).find(field => field.props.role === role)
}
export function roleValue(type: CustomRecordType, row: Pick<CustomRecord, 'values'>, role: string): FieldValue | undefined {
  const field = roleField(type, role)
  return field?.fieldKey ? row.values[field.fieldKey] : undefined
}
export function roleText(type: CustomRecordType, row: Pick<CustomRecord, 'values'>, role: string): string {
  const field = roleField(type, role), value = roleValue(type, row, role)
  if (field?.props.options) {
    const ids = Array.isArray(value) ? value : [value]
    return field.props.options.filter(option => ids.includes(option.id)).map(option => option.label).join(' · ')
  }
  return value == null || value === '' ? '' : Array.isArray(value) ? value.join(' · ') : String(value)
}
export const roleNumber = (type: CustomRecordType, row: Pick<CustomRecord, 'values'>, role: string) => {
  const value = roleValue(type, row, role)
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
export function notebookDefaults(type: CustomRecordType, kind: NotebookKind, today: string): Record<string, FieldValue> {
  const values = blankValues(type.blocks)
  for (const field of flatten(type.blocks)) {
    if (!field.fieldKey) continue
    if ((field.props.role === 'date' && kind !== 'movie') || field.props.role === 'startDate') values[field.fieldKey] = today
    if (field.props.role === 'status' || field.props.role === 'kind') values[field.fieldKey] = field.props.options?.[0]?.id ?? ''
    if (kind === 'study' && field.props.role === 'minutes') values[field.fieldKey] = 30
  }
  return values
}
export function notebookError(type: CustomRecordType, kind: NotebookKind, values: Record<string, FieldValue>): string | null {
  const required = requiredError(type.blocks, values)
  if (required) return required
  const row = { values }
  for (const field of flatten(type.blocks)) {
    if (!field.fieldKey) continue
    const value = values[field.fieldKey]
    if (field.type === 'number' && value !== '' && value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < (field.props.min ?? -Infinity))) return `${field.props.label}을 확인해 주세요.`
    if (field.type === 'date' && typeof value === 'string' && value && !isCalendarDate(value)) return '날짜를 확인해 주세요.'
  }
  if (kind === 'finance' && roleNumber(type, row, 'amount') <= 0) return '금액은 0보다 크게 입력해 주세요.'
  if (kind === 'study' && roleNumber(type, row, 'minutes') <= 0) return '학습 시간은 0보다 크게 입력해 주세요.'
  if (kind === 'travel') {
    const start = roleText(type, row, 'startDate'), end = roleText(type, row, 'endDate')
    if (start && end && end < start) return '돌아오는 날짜는 출발일 이후로 지정해 주세요.'
  }
  return null
}
export const won = (value: number) => `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(value)}원`
export const minutesText = (value: number) => value >= 60 ? `${Math.floor(value / 60)}시간${value % 60 ? ` ${value % 60}분` : ''}` : `${value}분`

export function notebookSummary(type: CustomRecordType, kind: NotebookKind, rows: CustomRecord[], month: string) {
  const monthRows = rows.filter(row => roleText(type, row, kind === 'travel' ? 'startDate' : 'date').startsWith(month))
  if (kind === 'finance') {
    const income = monthRows.filter(row => roleText(type, row, 'kind') === '수입').reduce((sum, row) => sum + roleNumber(type, row, 'amount'), 0)
    const expense = monthRows.filter(row => roleText(type, row, 'kind') === '지출').reduce((sum, row) => sum + roleNumber(type, row, 'amount'), 0)
    return [{ label: '이번 달 수입', value: won(income), tone: 'positive' }, { label: '이번 달 지출', value: won(expense), tone: 'expense' }, { label: '이번 달 잔액', value: won(income - expense), tone: '' }]
  }
  if (kind === 'movie') {
    const watched = rows.filter(row => roleText(type, row, 'status') === '감상 완료')
    const rated = watched.filter(row => roleNumber(type, row, 'rating') > 0)
    const average = rated.length ? (rated.reduce((sum, row) => sum + roleNumber(type, row, 'rating'), 0) / rated.length).toFixed(1) : '—'
    return [{ label: '감상한 영화', value: `${watched.length}편` }, { label: '보고 싶은 영화', value: `${rows.filter(row => roleText(type, row, 'status') === '보고 싶어요').length}편` }, { label: '나의 평균 별점', value: average }]
  }
  if (kind === 'travel') return [{ label: '남긴 여행', value: `${rows.length}번` }, { label: '다음 여행', value: `${rows.filter(row => roleText(type, row, 'status') === '계획 중').length}곳` }, { label: '다녀온 여행', value: `${rows.filter(row => roleText(type, row, 'status') === '다녀온 여행').length}곳` }]
  return [{ label: '이번 달 학습', value: minutesText(monthRows.reduce((sum, row) => sum + roleNumber(type, row, 'minutes'), 0)) }, { label: '학습 기록', value: `${monthRows.length}개` }, { label: '복습할 내용', value: `${rows.filter(row => roleText(type, row, 'status') === '복습 필요').length}개` }]
}
