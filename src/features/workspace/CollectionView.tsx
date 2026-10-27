import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CustomRecordRenderer } from '../records/Renderer.tsx'
import { hydrateValues, requiredError, titleFrom, blankValues } from '../records/schema.ts'
import type { CustomRecord, CustomRecordType, FieldValue } from '../../types/records.ts'
import { todayISO } from '../../utils/date.ts'
import type { DataView } from './model.ts'
import { assignSelect, chartSeries, dateKey, fieldValue, fieldsOf, monthCells, shiftMonth, textOf } from './views.ts'

const VIEWS: { id: DataView; label: string }[] = [
  { id: 'table', label: '테이블' },
  { id: 'card', label: '카드' },
  { id: 'gallery', label: '갤러리' },
  { id: 'calendar', label: '캘린더' },
  { id: 'kanban', label: '칸반' },
  { id: 'chart', label: '차트' },
]

export function CollectionView({
  type,
  rows,
  view,
  onView,
  onAdd,
  onUpdate,
  onRemove,
}: {
  type: CustomRecordType
  rows: CustomRecord[]
  view: DataView
  onView: (view: DataView) => void
  onAdd: (input: { title: string; values: Record<string, FieldValue> }) => void
  onUpdate: (id: string, input: { title: string; values: Record<string, FieldValue> }) => void
  onRemove: (id: string) => void
}) {
  const fields = fieldsOf(type)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return rows
    return rows.filter((row) => {
      const blob = `${row.title} ${Object.values(row.values).map(textOf).join(' ')}`.toLowerCase()
      return blob.includes(text)
    })
  }, [query, rows])

  const openNew = () => {
    setEditing('new')
    setValues(blankValues(type.blocks))
    setError('')
  }

  const openRow = (row: CustomRecord) => {
    setEditing(row.id)
    setValues(hydrateValues(type.blocks, row.values, row.title))
    setError('')
  }

  const save = () => {
    const problem = requiredError(type.blocks, values)
    if (problem) {
      setError(problem)
      return
    }
    const title = titleFrom(type.blocks, values, type.name)
    if (editing === 'new') onAdd({ title, values })
    else if (editing) onUpdate(editing, { title, values })
    setEditing(null)
  }

  const dateField = fields.find((block) => block.type === 'date' || block.type === 'dateTime')
  const selectField = fields.find((block) => block.type === 'select')
  const imageField = fields.find((block) => block.type === 'image')
  const chart = chartSeries(type, visible)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="보기">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={view === item.id}
              onClick={() => onView(item.id)}
              className={view === item.id ? 'chip chip-on' : 'chip'}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="검색"
          aria-label="기록 검색"
          className="field min-w-40 flex-1 text-sm"
        />
        <button type="button" className="btn btn-primary" onClick={openNew}>추가</button>
      </div>

      {editing ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <CustomRecordRenderer
            blocks={type.blocks}
            mode="fill-record"
            values={values}
            onValue={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
          />
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>취소</button>
            <button type="submit" className="btn btn-primary">저장</button>
          </div>
        </form>
      ) : null}

      {visible.length === 0 && !editing && view !== 'calendar' && view !== 'chart' && view !== 'kanban' ? (
        <p className="mt-4 text-sm text-neutral-400">기록이 없습니다.</p>
      ) : null}

      {view === 'table' ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-96 text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-neutral-400">
                {fields.map((field) => (
                  <th key={field.id} className="py-2 pr-3 font-medium">{field.props.label || '필드'}</th>
                ))}
                <th className="py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-line">
                  {fields.map((field) => (
                    <td key={field.id} className="py-2 pr-3">
                      {field.type === 'image' && textOf(fieldValue(row, field)) ? (
                        <img src={textOf(fieldValue(row, field))} alt="" className="h-10 rounded object-cover" />
                      ) : (
                        textOf(fieldValue(row, field)) || row.title
                      )}
                    </td>
                  ))}
                  <td className="py-2 text-right">
                    <button type="button" className="text-xs text-neutral-400" onClick={() => openRow(row)}>수정</button>
                    <button type="button" className="ml-2 text-xs text-neutral-400" onClick={() => onRemove(row.id)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === 'card' || view === 'gallery' ? (
        <ul className={view === 'gallery' ? 'mt-4 grid grid-cols-2 gap-3 md:grid-cols-3' : 'mt-4 grid gap-3 md:grid-cols-2'}>
          {visible.map((row) => {
            const image = imageField ? textOf(fieldValue(row, imageField)) : ''
            return (
              <li key={row.id} className="panel overflow-hidden">
                {view === 'gallery' && image ? <img src={image} alt="" className="h-32 w-full object-cover" /> : null}
                <div className="p-3">
                  <p className="text-sm font-medium">{row.title}</p>
                  <ul className="mt-2 space-y-1 text-xs text-neutral-500">
                    {fields.slice(0, 4).map((field) => (
                      <li key={field.id}>
                        {field.props.label}: {textOf(fieldValue(row, field)) || '—'}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <button type="button" className="text-xs text-neutral-400" onClick={() => openRow(row)}>수정</button>
                    <button type="button" className="text-xs text-neutral-400" onClick={() => onRemove(row.id)}>삭제</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {view === 'calendar' ? (
        dateField ? (
          <div className="diary-calendar mt-4" aria-label="컬렉션 캘린더">
            <div className="diary-calendar-heading">
              <button type="button" className="icon-btn" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></button>
              <h2 aria-live="polite">{month}</h2>
              <button type="button" className="icon-btn" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16} /></button>
            </div>
            <div className="diary-calendar-weekdays" aria-hidden="true">
              {['일', '월', '화', '수', '목', '금', '토'].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="diary-calendar-days">
              {monthCells(month).map((cell) => {
                const dayRows = visible.filter((row) => dateKey(fieldValue(row, dateField)) === cell.date)
                return (
                  <div key={cell.date} data-date={cell.date} className={'diary-calendar-day' + (cell.inMonth ? '' : ' diary-calendar-outside')}>
                    <span>{Number(cell.date.slice(8))}</span>
                    <ul className="mt-1 space-y-0.5">
                      {dayRows.map((row) => (
                        <li key={row.id}>
                          <button type="button" className="block w-full truncate text-left text-[11px]" onClick={() => openRow(row)}>{row.title}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-400">캘린더는 날짜 필드가 필요합니다.</p>
        )
      ) : null}

      {view === 'kanban' ? (
        selectField?.fieldKey ? (
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {selectField.props.options?.map((option) => {
              const group = visible.filter((row) => {
                const value = textOf(fieldValue(row, selectField))
                return value === option.id || value === option.label
              })
              return (
                <section
                  key={option.id}
                  data-kanban-col={option.id}
                  className="panel p-3"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const id = event.dataTransfer.getData('text/plain')
                    const row = visible.find((item) => item.id === id)
                    if (!row || !selectField.fieldKey) return
                    onUpdate(row.id, { title: row.title, values: assignSelect(row.values, selectField.fieldKey, option.id) })
                  }}
                >
                  <h3 className="text-xs text-neutral-400">{option.label}</h3>
                  <ul className="mt-2 space-y-2">
                    {group.map((row) => (
                      <li key={row.id}>
                        <button
                          type="button"
                          draggable
                          data-kanban-card={row.id}
                          onDragStart={(event) => event.dataTransfer.setData('text/plain', row.id)}
                          className="w-full cursor-grab rounded-md border border-line px-2 py-1.5 text-left text-sm"
                          onClick={() => openRow(row)}
                        >
                          {row.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-400">칸반은 선택 필드가 필요합니다.</p>
        )
      ) : null}

      {view === 'chart' ? (
        chart.kind === 'empty' ? (
          <p className="mt-4 text-sm text-neutral-400">{chart.message}</p>
        ) : (
          <ul className="mt-4 space-y-2" aria-label={chart.label}>
            {chart.items.map((item) => {
              const max = Math.max(1, ...chart.items.map((entry) => entry.value))
              return (
                <li key={item.id}>
                  <p className="text-xs text-neutral-500">{item.label} · {item.value}</p>
                  <div className="mt-1 h-2 rounded-full bg-hover">
                    <div className="h-2 rounded-full bg-neutral-400" style={{ width: `${(item.value / max) * 100}%` }} data-chart-bar={item.id} />
                  </div>
                </li>
              )
            })}
          </ul>
        )
      ) : null}
    </div>
  )
}
