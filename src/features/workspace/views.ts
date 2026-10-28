import type { CustomRecord, CustomRecordType, FieldValue } from '../../types/records.ts'
import { flatten, isFieldBlock, type Block } from '../records/schema.ts'

export function fieldsOf(type: CustomRecordType): Block[] {
  return flatten(type.blocks).filter((block) => block.fieldKey && isFieldBlock(block.type))
}

export function textOf(value: FieldValue | undefined): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

export function fieldValue(row: CustomRecord, block: Block): FieldValue | undefined {
  return block.fieldKey ? row.values[block.fieldKey] : undefined
}

export function dateKey(value: FieldValue | undefined): string | null {
  const text = textOf(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

export function monthCells(month: string, weekStartsOn: 0 | 1 = 0): { date: string; inMonth: boolean }[] {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return []
  const first = new Date(year, monthNumber - 1, 1, 12)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const weeks = Math.ceil((offset + new Date(year, monthNumber, 0).getDate()) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const day = new Date(year, monthNumber - 1, index - offset + 1, 12)
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    return { date, inMonth: date.startsWith(month) }
  })
}

export function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(year, monthNumber - 1 + amount, 1, 12)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

export function assignSelect(values: Record<string, FieldValue>, fieldKey: string, optionId: string): Record<string, FieldValue> {
  return { ...values, [fieldKey]: optionId }
}

export type ChartSeries =
  | { kind: 'bars'; label: string; items: { id: string; label: string; value: number }[] }
  | { kind: 'empty'; message: string }

export function chartSeries(type: CustomRecordType, rows: CustomRecord[]): ChartSeries {
  const fields = fieldsOf(type)
  const dateField = fields.find((block) => block.type === 'date' || block.type === 'dateTime')
  const numberField = fields.find((block) => block.type === 'number' || block.type === 'rating' || block.type === 'progress')
  const selectField = fields.find((block) => block.type === 'select')

  if (dateField && numberField?.fieldKey) {
    const totals = new Map<string, number>()
    for (const row of rows) {
      const day = dateKey(fieldValue(row, dateField))
      const value = fieldValue(row, numberField)
      if (!day || typeof value !== 'number') continue
      totals.set(day, (totals.get(day) ?? 0) + value)
    }
    const items = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ id: day, label: day, value }))
    if (items.length === 0) return { kind: 'empty', message: '숫자와 날짜가 있는 기록이 없습니다.' }
    return { kind: 'bars', label: `${numberField.props.label || '숫자'} / 날짜`, items }
  }

  if (selectField) {
    const items = (selectField.props.options ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      value: rows.filter((row) => {
        const value = textOf(fieldValue(row, selectField))
        return value === option.id || value === option.label
      }).length,
    }))
    if (items.every((item) => item.value === 0) && rows.length === 0) return { kind: 'empty', message: '차트에 쓸 기록이 없습니다.' }
    return { kind: 'bars', label: selectField.props.label || '선택', items }
  }

  if (numberField?.fieldKey) {
    const total = rows.reduce((sum, row) => sum + (typeof fieldValue(row, numberField) === 'number' ? Number(fieldValue(row, numberField)) : 0), 0)
    return { kind: 'bars', label: numberField.props.label || '숫자', items: [{ id: 'sum', label: '합계', value: total }] }
  }

  return { kind: 'empty', message: '차트는 날짜+숫자, 선택, 또는 숫자 필드가 필요합니다.' }
}
