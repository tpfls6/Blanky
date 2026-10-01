import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import { BOOK_STATUS_LABEL, type BookStatus } from '../../types/records.ts'
import { todayISO } from '../../utils/date.ts'

export function ReadingPage({ editing = false }: { editing?: boolean }) {
  const { books, logs, removeBook, pageLayouts, setPageLayout } = useLibrary()
  const [selectedId, setSelectedId] = useState<string | null>(books[0]?.id ?? null)
  const [adding, setAdding] = useState(false)
  const book = books.find((item) => item.id === selectedId) ?? null
  const bookLogs = logs.filter((log) => log.bookId === book?.id).sort((left, right) => right.date.localeCompare(left.date))

  return (
    <PageCanvas
      pageId="reading"
      editing={editing}
      blocks={resolveLayout('reading', pageLayouts.reading)}
      onChange={(blocks) => setPageLayout('reading', blocks)}
      render={(block) =>
        block.type === 'page-body' ? (
    <div className="mx-auto grid w-full max-w-5xl gap-10 md:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-medium tracking-tight">Reading</h1>
          <button type="button" onClick={() => setAdding((value) => !value)} className="btn btn-primary">
            <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            책 추가
          </button>
        </div>
        {books.length === 0 ? <EmptyState>책이 없습니다.</EmptyState> : null}
        <ul className="mt-6">
          {books.map((item) => {
            const ratio = item.totalPages > 0 ? Math.min(100, Math.round((item.currentPage / item.totalPages) * 100)) : 0
            return (
              <li key={item.id} className="border-t border-line">
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={item.id === selectedId ? 'w-full rounded-md bg-accent-light px-2 py-3 text-left transition-colors duration-150' : 'w-full rounded-md px-2 py-3 text-left transition-colors duration-150 hover:bg-hover'}
                >
                  <p className={item.id === selectedId ? 'text-sm text-accent-text' : 'text-sm text-neutral-700'}>{item.title}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {item.totalPages > 0 ? `${item.currentPage} / ${item.totalPages}p` : `${item.currentPage}p`}
                    {item.startedAt ? ` · ${item.startedAt.replaceAll('-', '.')}` : ''}
                  </p>
                  {item.totalPages > 0 ? <Progress ratio={ratio} /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <div>
        {adding ? (
          <BookForm
            onCancel={() => setAdding(false)}
            onSave={(id) => {
              setSelectedId(id)
              setAdding(false)
            }}
          />
        ) : null}
        {book ? (
          <article className="max-w-xl">
            <div className="flex gap-5">
              <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden bg-neutral-50 text-xs text-neutral-300">
                {book.cover ? <img src={book.cover} alt="" className="h-full w-full object-cover" /> : '표지'}
              </div>
              <div>
                <h2 className="text-xl font-medium">{book.title}</h2>
                <p className="mt-1 text-sm text-neutral-500">{book.author || '저자 없음'}</p>
                <p className="mt-3 text-xs text-neutral-400">{BOOK_STATUS_LABEL[book.status]}</p>
              </div>
            </div>
            <BookFields bookId={book.id} />
            <section className="mt-8">
              <h3 className="text-sm text-neutral-500">날짜별 기록</h3>
              <ul className="mt-3">
                {bookLogs.map((log) => (
                  <li key={log.id} className="border-t border-neutral-100 py-3">
                    <p className="text-xs text-neutral-400">{log.date.replaceAll('-', '.')}</p>
                    <p className="mt-1 text-sm">{log.page !== null ? `${log.page}페이지` : '기록'}</p>
                    {log.note ? <p className="mt-1 text-sm text-neutral-600">{log.note}</p> : null}
                  </li>
                ))}
              </ul>
              <LogForm bookId={book.id} />
            </section>
            <button type="button" onClick={() => { removeBook(book.id); setSelectedId(null) }} className="btn btn-ghost mt-6">
              책 삭제
            </button>
          </article>
        ) : (
          <EmptyState>책을 선택하거나 추가해 주세요.</EmptyState>
        )}
      </div>
    </div>
        ) : null
      }
    />
  )
}

function Progress({ ratio }: { ratio: number }) {
  return (
    <div className="bar mt-2" aria-hidden="true">
      <span style={{ width: `${ratio}%` }} />
    </div>
  )
}

function BookForm({ onCancel, onSave }: { onCancel: () => void; onSave: (id: string) => void }) {
  const { addBook } = useLibrary()
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [total, setTotal] = useState('')
  const [error, setError] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      setError('제목을 입력해 주세요.')
      return
    }
    const id = addBook({
      title,
      author,
      cover: null,
      startedAt: todayISO(),
      finishedAt: null,
      currentPage: 0,
      totalPages: Number(total) || 0,
      status: 'want',
    })
    onSave(id)
  }

  return (
    <form onSubmit={submit} className="mb-8 space-y-3 border-b border-neutral-100 pb-6">
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="책 제목" className="field w-full" />
      <input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="저자" className="field w-full" />
      <input value={total} onChange={(event) => setTotal(event.target.value)} placeholder="전체 페이지" inputMode="numeric" className="field w-full" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary">책 저장</button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">취소</button>
      </div>
    </form>
  )
}

function BookFields({ bookId }: { bookId: string }) {
  const { books, updateBook } = useLibrary()
  const book = books.find((item) => item.id === bookId)
  if (!book) return null
  const ratio = book.totalPages > 0 ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0

  return (
    <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
      <label>
        저자
        <input value={book.author} onChange={(event) => updateBook(book.id, { author: event.target.value })} className="field mt-1 w-full" />
      </label>
      <label>
        상태
        <select
          value={book.status}
          onChange={(event) => {
            const status = event.target.value as BookStatus
            updateBook(book.id, {
              status,
              finishedAt: status === 'done' ? book.finishedAt ?? todayISO() : book.finishedAt,
            })
          }}
          className="field select mt-1 w-full"
        >
          {(Object.keys(BOOK_STATUS_LABEL) as BookStatus[]).map((status) => (
            <option key={status} value={status}>{BOOK_STATUS_LABEL[status]}</option>
          ))}
        </select>
      </label>
      <label>
        시작 날짜
        <input type="date" value={book.startedAt ?? ''} onChange={(event) => updateBook(book.id, { startedAt: event.target.value || null })} className="field mt-1 w-full" />
      </label>
      <label>
        완료 날짜
        <input type="date" value={book.finishedAt ?? ''} onChange={(event) => updateBook(book.id, { finishedAt: event.target.value || null })} className="field mt-1 w-full" />
      </label>
      <label>
        현재 페이지
        <input type="number" min={0} value={book.currentPage} onChange={(event) => updateBook(book.id, { currentPage: Number(event.target.value) || 0 })} className="field mt-1 w-full" />
      </label>
      <label>
        전체 페이지
        <input type="number" min={0} value={book.totalPages} onChange={(event) => updateBook(book.id, { totalPages: Number(event.target.value) || 0 })} className="field mt-1 w-full" />
      </label>
      <div className="sm:col-span-2">
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${ratio}%` }} />
        </div>
        <p className="mt-1 text-xs text-neutral-400">{ratio}%</p>
      </div>
      <label className="sm:col-span-2 text-xs text-neutral-400">
        표지 이미지
        <input
          type="file"
          accept="image/*"
          className="mt-1 block text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file || file.size > 350_000) return
            const reader = new FileReader()
            reader.onload = () => updateBook(book.id, { cover: String(reader.result) })
            reader.readAsDataURL(file)
          }}
        />
      </label>
    </div>
  )
}

function LogForm({ bookId }: { bookId: string }) {
  const { addLog } = useLibrary()
  const [date, setDate] = useState(todayISO)
  const [page, setPage] = useState('')
  const [note, setNote] = useState('')

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!note.trim() && !page) return
        addLog(bookId, { date, page: page ? Number(page) : null, note })
        setPage('')
        setNote('')
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="field w-full" />
        <input value={page} onChange={(event) => setPage(event.target.value)} inputMode="numeric" placeholder="페이지" className="field w-full" />
      </div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="감상" className="min-h-16 w-full bg-transparent text-sm outline-none placeholder:text-neutral-300" />
      <button type="submit" className="btn btn-primary">기록 추가</button>
    </form>
  )
}
