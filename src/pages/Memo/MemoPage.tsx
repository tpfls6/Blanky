import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import { categoryPath } from '../../utils/work.ts'

function readTags(value: string): string[] {
  return value.split(/[,#]+/).map((tag) => tag.trim()).filter(Boolean)
}

export function MemoPage({ editing = false }: { editing?: boolean }) {
  const library = useLibrary()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(library.memos[0]?.id ?? null)
  const selected = library.memos.find((memo) => memo.id === selectedId) ?? null

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ko')
    if (!text) return library.memos
    return library.memos.filter((memo) => {
      const path = categoryPath(memo.categoryId, library.categories) ?? ''
      return [memo.title, memo.body, memo.tags.join(' '), path].join(' ').toLocaleLowerCase('ko').includes(text)
    })
  }, [library.categories, library.memos, query])

  return (
    <PageCanvas
      pageId="memo"
      editing={editing}
      blocks={resolveLayout('memo', library.pageLayouts.memo)}
      onChange={(blocks) => library.setPageLayout('memo', blocks)}
      render={(block) =>
        block.type === 'page-body' ? (
    <div className="mx-auto grid w-full max-w-5xl gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className={selected ? 'hidden md:block' : 'block'}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-medium tracking-tight">Memo</h1>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const id = library.addMemo({ title: '새 메모', body: '', categoryId: null, tags: [] })
              setSelectedId(id)
            }}
          >
            <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            메모 작성
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="검색"
          className="field mt-6 w-full"
        />
        {visible.length === 0 ? <EmptyState>메모가 없습니다.</EmptyState> : null}
        <ul className="mt-2">
          {visible.map((memo) => (
            <li key={memo.id} className="group relative border-t border-line">
              <button type="button" onClick={() => setSelectedId(memo.id)} className="w-full py-3 pr-16 text-left">
                <p className={memo.id === selectedId ? 'truncate text-sm text-accent-text' : 'truncate text-sm text-neutral-900'}>
                  {memo.title}
                </p>
                <p className="mt-1 truncate text-xs text-neutral-400">{memo.body || '내용 없음'}</p>
              </button>
              <div className="reveal absolute top-2 right-0 flex">
                <button type="button" className="icon-btn" data-tip="수정" aria-label="수정" onClick={() => setSelectedId(memo.id)}>
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  data-tip="삭제"
                  aria-label="삭제"
                  onClick={() => {
                    library.removeMemo(memo.id)
                    if (selectedId === memo.id) setSelectedId(null)
                  }}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={selected ? 'block' : 'hidden md:block'}>
        {selected ? (
          <MemoEditor
            key={selected.id}
            id={selected.id}
            onBack={() => setSelectedId(null)}
            onDelete={() => {
              library.removeMemo(selected.id)
              setSelectedId(null)
            }}
          />
        ) : (
          <EmptyState>메모를 선택해 주세요.</EmptyState>
        )}
      </div>
    </div>
        ) : null
      }
    />
  )
}

function MemoEditor({ id, onBack, onDelete }: { id: string; onBack: () => void; onDelete: () => void }) {
  const { memos, categories, updateMemo } = useLibrary()
  const memo = memos.find((item) => item.id === id)
  const [title, setTitle] = useState(memo?.title ?? '')
  const [body, setBody] = useState(memo?.body ?? '')
  const [tags, setTags] = useState(memo?.tags.join(', ') ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(memo?.categoryId ?? null)
  const [saved, setSaved] = useState('')

  if (!memo) return null

  return (
    <form
      className="max-w-xl"
      onSubmit={(event) => {
        event.preventDefault()
        updateMemo(id, { title, body, categoryId, tags: readTags(tags) })
        setSaved('저장되었습니다.')
      }}
    >
      <button type="button" onClick={onBack} className="text-sm text-neutral-400 md:hidden">
        목록
      </button>
      <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full bg-transparent text-xl outline-none" />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-4 min-h-48 w-full resize-y bg-transparent text-sm leading-relaxed outline-none" />
      <div className="mt-4">
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
      </div>
      <input
        value={tags}
        onChange={(event) => setTags(event.target.value)}
        placeholder="태그"
        className="field mt-4 w-full"
      />
      <p className="mt-4 text-xs text-neutral-400">
        작성 {memo.createdAt.slice(0, 10)} · 수정 {memo.updatedAt.slice(0, 10)}
      </p>
      <div className="mt-4 flex gap-2">
        <button type="submit" className="btn btn-primary">저장</button>
        <button type="button" onClick={onDelete} className="btn btn-ghost">삭제</button>
      </div>
      <p className="mt-3 text-sm text-neutral-500" role="status">{saved}</p>
    </form>
  )
}
