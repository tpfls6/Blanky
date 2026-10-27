import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './memo.css'
import { MemoRichEditor } from './MemoRichEditor.tsx'
import { memoPlainText } from './memoContent.ts'
import { ChevronRight, Folder, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { categoryPath } from '../../utils/work.ts'

export function MemoPage({ editing = false }: { editing?: boolean }) {
  const confirm = useConfirm()
  const library = useLibrary()
  const [query, setQuery] = useState('')
  const [folder, setFolder] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const activeFolder = folder === 'all' || folder === 'none' || library.categories.some(category => category.id === folder) ? folder : 'all'
  const folderIds = (id: string): string[] => [id, ...library.categories.filter(category => category.parentId === id).map(category => category.id)]
  const belongsTo = (categoryId: string | null, id: string) => id === 'all' || (id === 'none' ? !categoryId || !library.categories.some(category => category.id === categoryId) : categoryId !== null && folderIds(id).includes(categoryId))
  const count = (id: string) => library.memos.filter(memo => belongsTo(memo.categoryId, id)).length
  const chooseFolder = (id: string) => {
    setFolder(id)
    setSelectedId(null)
  }
  const [selectedId, setSelectedId] = useState<string | null>(library.memos[0]?.id ?? null)
  const selected = library.memos.find((memo) => memo.id === selectedId) ?? null

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ko')
    const ids = new Set([activeFolder, ...library.categories.filter(category => category.parentId === activeFolder).map(category => category.id)])
    return library.memos.filter((memo) => {
      if (activeFolder === 'none' && memo.categoryId && library.categories.some(category => category.id === memo.categoryId)) return false
      if (activeFolder !== 'all' && activeFolder !== 'none' && !ids.has(memo.categoryId ?? '')) return false
      if (!text) return true
      const path = categoryPath(memo.categoryId, library.categories) ?? ''
      return [memo.title, memoPlainText(memo.body), path].join(' ').toLocaleLowerCase('ko').includes(text)
    })
  }, [library.categories, library.memos, query, activeFolder])

  return (
    <PageCanvas
      pageId="memo"
      editing={editing}
      blocks={resolveLayout('memo', library.pageLayouts.memo)}
      onChange={(blocks) => library.setPageLayout('memo', blocks)}
      render={(block) =>
        block.type === 'page-body' ? (
    <div className="memo-layout grid w-full gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className={selected ? 'hidden md:block' : 'block'}>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-medium tracking-tight">Memo</h1>
          <button data-theme-slot="button-primary"
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const id = library.addMemo({ title: '새 메모', body: '', categoryId: activeFolder === 'all' || activeFolder === 'none' ? null : activeFolder, tags: [] })
              setSelectedId(id)
            }}
          >
            <ThemeIcon name="add" fallback={Plus} className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            메모 작성
          </button>
        </div>
        <input data-theme-slot="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="검색"
          className="field mt-6 w-full"
        />
        <nav className="memo-folders" aria-label="메모 카테고리 폴더">
          {[{ id: 'all', name: '전체 메모' }, { id: 'none', name: '미분류' }].map(item => <button type="button" key={item.id} className="memo-folder" aria-current={activeFolder === item.id ? 'page' : undefined} onClick={() => chooseFolder(item.id)}>
            {activeFolder === item.id ? <FolderOpen size={16} /> : <Folder size={16} />}<span>{item.name}</span><small>{count(item.id)}</small>
          </button>)}
          {library.categories.filter(category => category.parentId === null).map(category => {
            const children = library.categories.filter(child => child.parentId === category.id)
            const open = expanded[category.id] ?? false
            return <div key={category.id}>
                <button type="button" className="memo-folder" aria-current={activeFolder === category.id ? 'page' : undefined} aria-expanded={children.length > 0 ? open : undefined} onClick={() => { chooseFolder(category.id); setExpanded(current => ({ ...current, [category.id]: !open })) }}>
                  {activeFolder === category.id ? <FolderOpen size={16} style={{color: category.color ?? undefined}} /> : <Folder size={16} style={{color: category.color ?? undefined}} />}<span>{category.name}</span><small>{count(category.id)}</small>
                  {children.length > 0 ? <ChevronRight size={14} aria-hidden="true" style={{transform: open ? 'rotate(90deg)' : undefined}} /> : null}
                </button>
              {open ? <div className="memo-subfolders">{children.map(child => <button key={child.id} type="button" className="memo-folder" aria-current={activeFolder === child.id ? 'page' : undefined} onClick={() => chooseFolder(child.id)}>
                {activeFolder === child.id ? <FolderOpen size={15} style={{color: child.color ?? undefined}} /> : <Folder size={15} style={{color: child.color ?? undefined}} />}<span>{child.name}</span><small>{count(child.id)}</small>
              </button>)}</div> : null}
            </div>
          })}
        </nav>
        <p className="memo-list-label">{activeFolder === 'all' ? '전체 메모' : activeFolder === 'none' ? '미분류' : categoryPath(activeFolder, library.categories)} <span>{visible.length}</span></p>
        {visible.length === 0 ? <EmptyState>메모가 없습니다.</EmptyState> : null}
        <ul className="mt-2">
          {visible.map((memo) => (
            <li key={memo.id} className="group relative border-t border-line">
              <button data-theme-slot="button" type="button" onClick={() => setSelectedId(memo.id)} className="w-full py-3 pr-16 text-left">
                <p className={memo.id === selectedId ? 'truncate text-sm text-accent-text' : 'truncate text-sm text-neutral-900'}>
                  {memo.title}
                </p>
                <p className="mt-1 truncate text-xs text-neutral-400">{memoPlainText(memo.body) || '내용 없음'}</p>
              </button>
              <div className="reveal absolute top-2 right-0 flex">
                <button data-theme-slot="button" type="button" className="icon-btn" data-tip="수정" aria-label="수정" onClick={() => setSelectedId(memo.id)}>
                  <ThemeIcon name="edit" fallback={Pencil} className="size-3.5" strokeWidth={1.5} />
                </button>
                <button data-theme-slot="button"
                  type="button"
                  className="icon-btn"
                  data-tip="삭제"
                  aria-label="삭제"
                  onClick={async () => {
                    if (!await confirm(`${memo.title} 메모를 삭제할까요? 휴지통에서 복구할 수 있습니다.`)) return
                    library.removeMemo(memo.id)
                    if (selectedId === memo.id) setSelectedId(null)
                  }}
                >
                  <ThemeIcon name="delete" fallback={Trash2} className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={selected ? 'memo-editor-column block' : 'memo-editor-column hidden md:block'}>
        {selected ? (
          <MemoEditor
            key={selected.id}
            id={selected.id}
            onBack={() => setSelectedId(null)}
            onDelete={async () => {
              if (!await confirm(`${selected.title} 메모를 삭제할까요? 휴지통에서 복구할 수 있습니다.`)) return
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
  const [categoryId, setCategoryId] = useState<string | null>(memo?.categoryId ?? null)
  const [saved, setSaved] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  useLayoutEffect(() => {
    const form = formRef.current
    if (!form) return
    const resize = () => {
      const bottom = window.matchMedia('(max-width: 767px)').matches ? 92 : 24
      const height = `${Math.max(0, window.innerHeight - form.getBoundingClientRect().top - bottom)}px`
      form.style.height = height
      form.closest<HTMLElement>('.memo-layout')?.style.setProperty('--memo-height', height)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    const saveOnShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        formRef.current?.requestSubmit()
      }
    }
    window.addEventListener('keydown', saveOnShortcut)
    return () => window.removeEventListener('keydown', saveOnShortcut)
  }, [])

  if (!memo) return null

  return (
    <form
      ref={formRef}
      className="memo-editor"
      onSubmit={(event) => {
        event.preventDefault()
        updateMemo(id, { title, body, categoryId, tags: memo.tags })
        setSaved('저장되었습니다.')
      }}
    >
      <button data-theme-slot="button" type="button" onClick={onBack} className="text-sm text-neutral-400 md:hidden">
        목록
      </button>
      <div className="memo-toolbar">
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
        <div className="memo-toolbar-actions">
        <button data-theme-slot="button" type="button" onClick={onDelete} className="btn btn-ghost">삭제</button>
        <button data-theme-slot="button-primary" type="submit" className="btn btn-primary" title="저장 (Ctrl+S)">저장</button>
        </div>
      </div>
      <div className="memo-writing-area">
        <input data-theme-slot="input" aria-label="메모 제목" value={title} onChange={(event) => { setTitle(event.target.value); setSaved('') }} className="memo-title" />
        <MemoRichEditor initialBody={memo.body} onChange={value => { setBody(value); setSaved('') }} />
      </div>
      <div className="memo-footer">
      <p className="text-xs text-neutral-400">
        작성 {memo.createdAt.slice(0, 10)} · 수정 {memo.updatedAt.slice(0, 10)}
      </p>
      <p className="text-xs text-neutral-500" role="status">{saved}</p>
      </div>
    </form>
  )
}
