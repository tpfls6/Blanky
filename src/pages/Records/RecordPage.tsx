import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { IconView } from '../../constants/icons.ts'
import { CustomRecordRenderer } from '../../features/records/Renderer.tsx'
import { blankValues, hydrateValues, requiredError, titleFrom } from '../../features/records/schema.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { FieldValue } from '../../types/records.ts'

export function RecordPage() {
  const { typeId = '' } = useParams()
  const { recordTypes, records, addRecord, updateRecord, removeRecord } = useLibrary()
  const type = recordTypes.find((item) => item.id === typeId) ?? null
  const rows = records.filter((item) => item.typeId === typeId)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, FieldValue>>({})
  const [error, setError] = useState('')

  if (!type) return <EmptyState>기록 유형을 찾을 수 없습니다.</EmptyState>

  const readingRow = rows.find((item) => item.id === reading) ?? null

  const openNew = () => {
    setReading(null)
    setEditing('new')
    setValues(blankValues(type.blocks))
    setError('')
  }

  const save = () => {
    const problem = requiredError(type.blocks, values)
    if (problem) {
      setError(problem)
      return
    }
    const title = titleFrom(type.blocks, values, type.name)
    if (editing === 'new') addRecord(type.id, { title, values })
    else if (editing) updateRecord(editing, { title, values })
    setEditing(null)
  }

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-8 md:px-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight">
          <IconView name={type.icon} className="size-5" style={{ color: type.color }} />
          {type.name}
        </h1>
        <button type="button" className="btn btn-primary" onClick={openNew}>추가</button>
      </div>
      {type.description ? <p className="mt-2 text-sm text-neutral-400">{type.description}</p> : null}
      {readingRow && readingRow.templateVersion !== type.version ? (
        <p className="mt-2 text-xs text-neutral-400">템플릿 버전 {readingRow.templateVersion}에서 작성된 기록입니다. 입력값은 그대로 남아 있습니다.</p>
      ) : null}
      {readingRow && !editing ? (
        <div className="mt-6">
          <CustomRecordRenderer
            blocks={type.blocks}
            mode="read-only"
            values={hydrateValues(type.blocks, readingRow.values, readingRow.title)}
          />
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setEditing(readingRow.id)
                setValues(hydrateValues(type.blocks, readingRow.values, readingRow.title))
                setReading(null)
                setError('')
              }}
            >
              수정
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setReading(null)}>닫기</button>
          </div>
        </div>
      ) : null}
      {editing ? (
        <form
          className="mt-6"
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
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>취소</button>
            <button type="submit" className="btn btn-primary">저장</button>
          </div>
        </form>
      ) : null}
      {rows.length === 0 && !editing ? <EmptyState>기록이 없습니다.</EmptyState> : null}
      <ul className="mt-6">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 border-t border-line py-3">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setEditing(null)
                setReading(row.id)
                setError('')
              }}
            >
              <span className="block text-sm">{row.title}</span>
              <span className="mt-1 block text-xs text-neutral-400">{row.createdAt.slice(0, 10)}</span>
            </button>
            <button
              type="button"
              className="text-xs text-neutral-400"
              onClick={() => {
                if (!window.confirm('이 기록을 삭제할까요?')) return
                removeRecord(row.id)
                if (reading === row.id) setReading(null)
              }}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
