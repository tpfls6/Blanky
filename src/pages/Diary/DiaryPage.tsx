import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import { koreanMonth, todayISO } from '../../utils/date.ts'
import { splitTags } from '../../utils/entries.ts'

function tagText(tags: string[]): string {
  return tags.join(', ')
}

function readTags(value: string): string[] {
  return value.split(/[,#]+/).map((tag) => tag.trim()).filter(Boolean)
}

export function DiaryPage({ editing = false }: { editing?: boolean }) {
  const { diaries, addDiary, updateDiary, removeDiary, pageLayouts, setPageLayout } = useLibrary()
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [openId, setOpenId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO)
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')

  const visible = useMemo(
    () => diaries.filter((entry) => entry.date.startsWith(month)).sort((left, right) => right.date.localeCompare(left.date)),
    [diaries, month],
  )

  const shift = (amount: number) => {
    const [year, monthNumber] = month.split('-').map(Number)
    const next = new Date(year, monthNumber - 1 + amount, 1)
    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <PageCanvas
      pageId="diary"
      editing={editing}
      blocks={resolveLayout('diary', pageLayouts.diary)}
      onChange={(blocks) => setPageLayout('diary', blocks)}
      render={(block) =>
        block.type === 'page-body' ? (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium tracking-tight">Diary</h1>
        <div className="flex items-center gap-1 text-sm text-neutral-500">
          <button type="button" onClick={() => shift(-1)} aria-label="이전 달" className="icon-btn">
            <ChevronLeft className="size-4" strokeWidth={1.5} />
          </button>
          <span className="min-w-16 text-center">{koreanMonth(month)}</span>
          <button type="button" onClick={() => shift(1)} aria-label="다음 달" className="icon-btn">
            <ChevronRight className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <form
        className="mt-8 space-y-3 border-b border-neutral-100 pb-8"
        onSubmit={(event) => {
          event.preventDefault()
          const parsed = splitTags(body)
          addDiary({ date, body: parsed.body, tags: [...parsed.tags, ...readTags(tags)] })
          setBody('')
          setTags('')
        }}
      >
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="field w-fit text-neutral-500" />
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="오늘의 기록"
          className="min-h-24 w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-neutral-300"
        />
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="태그. 쉼표로 구분"
          className="field w-full"
        />
        <button type="submit" className="btn btn-primary">
          일기 저장
        </button>
      </form>

      {visible.length === 0 ? <EmptyState>이 달의 일기가 없습니다.</EmptyState> : null}
      <ul className="mt-4">
        {visible.map((entry) => {
          const open = openId === entry.id
          return (
            <li key={entry.id} className="border-t border-line py-4">
              <button type="button" onClick={() => setOpenId(open ? null : entry.id)} className="w-full text-left">
                <p className="text-xs text-neutral-400">{entry.date.replaceAll('-', '.')}</p>
                <p className={open ? 'mt-2 whitespace-pre-wrap text-sm leading-relaxed' : 'mt-2 line-clamp-3 text-sm leading-relaxed'}>
                  {entry.body}
                </p>
                {entry.tags.length > 0 ? (
                  <p className="mt-2 text-xs text-neutral-400">{entry.tags.map((tag) => `#${tag}`).join(' ')}</p>
                ) : null}
              </button>
              {open ? (
                <DiaryEditor
                  date={entry.date}
                  body={entry.body}
                  tags={tagText(entry.tags)}
                  onSave={(next) => updateDiary(entry.id, next)}
                  onDelete={() => {
                    removeDiary(entry.id)
                    setOpenId(null)
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
        ) : null
      }
    />
  )
}

function DiaryEditor({
  date,
  body,
  tags,
  onSave,
  onDelete,
}: {
  date: string
  body: string
  tags: string
  onSave: (next: { date: string; body: string; tags: string[] }) => void
  onDelete: () => void
}) {
  const [nextDate, setNextDate] = useState(date)
  const [nextBody, setNextBody] = useState(body)
  const [nextTags, setNextTags] = useState(tags)

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        const parsed = splitTags(nextBody)
        onSave({ date: nextDate, body: parsed.body, tags: [...parsed.tags, ...readTags(nextTags)] })
      }}
    >
      <input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} className="field w-fit" />
      <textarea value={nextBody} onChange={(event) => setNextBody(event.target.value)} className="field min-h-28 w-full resize-y" />
      <input value={nextTags} onChange={(event) => setNextTags(event.target.value)} className="field w-full" />
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">수정 저장</button>
        <button type="button" onClick={onDelete} className="btn btn-ghost">
          삭제
        </button>
      </div>
    </form>
  )
}
