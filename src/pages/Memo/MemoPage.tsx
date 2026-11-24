import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './memo.css'
import { MemoRichEditor } from './MemoRichEditor.tsx'
import { MemoPhoneList } from './MemoPhoneList.tsx'
import { MemoPhoneEditor } from './MemoPhoneEditor.tsx'
import { memoPlainText } from './memoContent.ts'
import { ChevronRight, Folder, FolderOpen, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { EmptyState } from '../../components/common/EmptyState.tsx'
import { ExampleCard } from '../../features/onboarding/Example.tsx'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
import { useSaveAndClose } from '../../hooks/useSaveAndClose.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { categoryPath } from '../../utils/work.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'

export type MemoSource = {
  heading: string
  labels: Record<string, string>
  memos: ReturnType<typeof useLibrary>['memos']
  canvas?: boolean
  hideCategories?: boolean
  add: (memo: { title: string; body: string; categoryId?: string | null }) => string | Promise<string>
  save: (id: string, patch: { title: string; body: string; categoryId: string | null }) => void | Promise<void>
  remove: (id: string) => void | Promise<void>
}

export function MemoPage({ editing = false, source }: { editing?: boolean; source?: MemoSource }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const library = useLibrary()
  const memos = source?.memos ?? library.memos
  const hideFolders = source?.hideCategories ?? false
  const heading = source?.heading ?? t('memo.title')
  const titleLabel = source?.labels.title ?? '제목'
  const [query, setQuery] = useState('')
  const [createError, setCreateError] = useState('')
  const [folder, setFolder] = useState('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  // Phones search every memo from the top row; the folder filter waits until the search closes.
  const [searching, setSearching] = useState(false)
  // 'star' (즐겨찾기) is a phone folder for library memos only.
  const activeFolder = folder === 'all' || folder === 'none' || (folder === 'star' && !source) || library.categories.some(category => category.id === folder) ? folder : 'all'
  const folderIds = (id: string): string[] => [id, ...library.categories.filter(category => category.parentId === id).map(category => category.id)]
  const belongsTo = (memo: (typeof memos)[number], id: string) => id === 'all' || (id === 'star' ? memo.favorite === true : id === 'none' ? !memo.categoryId || !library.categories.some(category => category.id === memo.categoryId) : memo.categoryId !== null && folderIds(id).includes(memo.categoryId))
  const count = (id: string) => memos.filter(memo => belongsTo(memo, id)).length
  const folderLabel = activeFolder === 'all' ? '전체 메모' : activeFolder === 'star' ? '즐겨찾기' : activeFolder === 'none' ? '미분류' : categoryPath(activeFolder, library.categories) ?? '전체 메모'
  const chooseFolder = (id: string) => {
    setFolder(id)
    setSelectedId(null)
  }
  // Home's 보기 names one memo in the router state; otherwise the newest is selected,
  // except on a phone, where the memo tab opens on its list.
  const openId = (useLocation().state as { openId?: unknown } | null)?.openId
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!source && typeof openId === 'string' && memos.some(memo => memo.id === openId)) return openId
    if (!source && window.matchMedia?.(PHONE_QUERY).matches) return null
    return memos[0]?.id ?? null
  })
  // On a phone the memo tour starts by going back to the list, which would close the memo 보기 opened;
  // it waits until you leave that memo instead.
  const phone = useMediaQuery(PHONE_QUERY)
  const viewing = typeof openId === 'string' && selectedId === openId
  // Multi-select mode: picked ids are checked against the live list, so a memo removed elsewhere drops out.
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [removing, setRemoving] = useState(false)
  // The memo 메모 작성 just made: the phone editor starts its title empty so the first body line can name it.
  const [freshId, setFreshId] = useState<string | null>(null)
  const selected = memos.find((memo) => memo.id === selectedId) ?? null

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ko')
    const scope = phone && searching ? 'all' : activeFolder
    const ids = new Set([scope, ...library.categories.filter(category => category.parentId === scope).map(category => category.id)])
    return memos.filter((memo) => {
      if (hideFolders) return !text || [memo.title, memoPlainText(memo.body)].join(' ').toLocaleLowerCase('ko').includes(text)
      if (scope === 'star' && memo.favorite !== true) return false
      if (scope === 'none' && memo.categoryId && library.categories.some(category => category.id === memo.categoryId)) return false
      if (scope !== 'all' && scope !== 'none' && scope !== 'star' && !ids.has(memo.categoryId ?? '')) return false
      if (!text) return true
      const path = categoryPath(memo.categoryId, library.categories) ?? ''
      return [memo.title, memoPlainText(memo.body), path].join(' ').toLocaleLowerCase('ko').includes(text)
    })
  }, [library.categories, memos, query, activeFolder, hideFolders, phone, searching])

  const createMemo = async () => {
    setCreateError('')
    try {
    const id = source
      ? await source.add({ title: t('custom.unnamed'), body: '', categoryId: activeFolder === 'all' || activeFolder === 'none' || activeFolder === 'star' ? null : activeFolder })
        : library.addMemo({ title: '새 메모', body: '', categoryId: activeFolder === 'all' || activeFolder === 'none' || activeFolder === 'star' ? null : activeFolder, tags: [] })
    setSelectedId(id)
    setFreshId(id)
    } catch (error) { setCreateError(error instanceof Error ? error.message : t('custom.saveFailed')) }
  }
  // Resolves to whether the memo went to the trash.
  const deleteMemo = async (memo: (typeof memos)[number]) => {
    if (!await confirm(`${memo.title} 메모를 삭제할까요? 휴지통에서 복구할 수 있습니다.`)) return false
    try {
      if (source) await source.remove(memo.id)
      else library.removeMemo(memo.id)
      if (selectedId === memo.id) setSelectedId(null)
      return true
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t('custom.saveFailed'))
      return false
    }
  }

  const visibleIds = visible.map(memo => memo.id)
  const pickedVisible = visibleIds.filter(id => picked.has(id))
  const allPicked = visibleIds.length > 0 && pickedVisible.length === visibleIds.length
  const togglePick = (id: string) => setPicked(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const stopPicking = () => { setPicking(false); setPicked(new Set()) }
  // Confirms, then moves the memos to the trash one by one; resolves to the ids that failed (null when cancelled).
  const removeMemos = async (ids: readonly string[]): Promise<string[] | null> => {
    const targets = memos.filter(memo => ids.includes(memo.id))
    if (!targets.length) return null
    if (!await confirm(`선택한 메모 ${targets.length}개를 삭제할까요? 휴지통에서 복구할 수 있습니다.`, { title: '메모 일괄 삭제', confirmLabel: `${targets.length}개 삭제` })) return null
    const failed: string[] = []
    for (const memo of targets) {
      try {
        if (source) await source.remove(memo.id)
        else library.removeMemo(memo.id)
      } catch { failed.push(memo.id) }
    }
    if (selectedId && targets.some(memo => memo.id === selectedId && !failed.includes(memo.id))) setSelectedId(null)
    setCreateError(failed.length ? `${failed.length}개 메모를 삭제하지 못했어요. 다시 시도해 주세요.` : '')
    return failed
  }
  const deletePicked = async () => {
    if (!pickedVisible.length || removing) return
    setRemoving(true)
    const failed = await removeMemos(pickedVisible)
    setRemoving(false)
    if (!failed) return
    if (failed.length) setPicked(new Set(failed))
    else stopPicking()
  }
  // Phone selection bar: a move keeps title and body, so a custom page's own save path takes it too.
  const moveMemos = async (ids: readonly string[], categoryId: string | null) => {
    setCreateError('')
    try {
      for (const memo of memos.filter(item => ids.includes(item.id))) {
        if (source) await source.save(memo.id, { title: memo.title, body: memo.body, categoryId })
        else library.updateMemo(memo.id, { title: memo.title, body: memo.body, categoryId, tags: memo.tags })
      }
      return true
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t('custom.saveFailed'))
      return false
    }
  }

  const page = (
    <div className="memo-layout grid w-full gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
      <div className={selected ? 'hidden min-h-0 md:flex md:flex-col' : phone ? 'memo-phone-column flex min-h-0 flex-col' : 'flex min-h-0 flex-col'}>
        {phone ? <>
          {createError ? <p role="alert" className="text-sm text-red-500">{createError}</p> : null}
          <MemoPhoneList
            heading={heading}
            memos={visible}
            categories={library.categories}
            folder={activeFolder}
            folderLabel={hideFolders ? heading : folderLabel}
            folderCount={hideFolders ? visible.length : count(activeFolder)}
            count={count}
            onFolder={chooseFolder}
            hideFolders={hideFolders}
            canFavorite={!source}
            query={query}
            onQuery={setQuery}
            searching={searching}
            onSearching={setSearching}
            selectedId={selectedId}
            onOpen={setSelectedId}
            onCreate={() => void createMemo()}
            onDelete={removeMemos}
            onMove={moveMemos}
            onFavorite={library.setMemoFavorite}
            empty={!memos.length && !query.trim() ? (
              <div className="mt-3">
                <ExampleCard title="회의에서 나온 아이디어" meta="미분류 · 방금" body="온보딩은 짧게, 예시는 화면에서만 보여 주기" action="첫 메모 작성" onStart={createMemo} />
              </div>
            ) : visible.length === 0 ? <EmptyState>{query.trim() ? t('memo.empty') : activeFolder === 'star' ? '즐겨찾기한 메모가 없어요. 메모를 길게 눌러 추가해 보세요.' : t('memo.empty')}</EmptyState> : null}
          />
        </> : <>
        <div data-theme-slot="page-header" className="flex items-center justify-between">
          <h1 className="text-2xl font-medium tracking-tight">{heading}</h1>
          <button data-tour="new-memo" data-theme-slot="button-primary"
            type="button"
            className="btn btn-primary"
            onClick={createMemo}
          >
            <ThemeIcon name="add" fallback={Plus} className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            메모 작성
          </button>
        </div>
        {createError ? <p role="alert" className="text-sm text-red-500">{createError}</p> : null}
        <div className="memo-browse">
        <input data-theme-slot="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="검색"
          className="field w-full"
        />
        {hideFolders ? null : <nav className="memo-folders" aria-label="메모 카테고리 폴더">
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
        </nav>}
        <div className="memo-list-head">
          <p className="memo-list-label">{hideFolders ? heading : activeFolder === 'all' ? '전체 메모' : activeFolder === 'none' ? '미분류' : categoryPath(activeFolder, library.categories)} <span>{visible.length}</span></p>
          {visible.length > 0 ? <button data-theme-slot="button" type="button" className="memo-pick-toggle" aria-pressed={picking} onClick={() => picking ? stopPicking() : setPicking(true)}>
            {picking ? '완료' : <><ListChecks size={14} strokeWidth={1.5} aria-hidden="true" />선택</>}
          </button> : null}
        </div>
        {picking ? <div className="memo-pick-bar" role="toolbar" aria-label="메모 선택">
          <label className="memo-pick-all">
            <input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(visibleIds))} />
            전체 선택
          </label>
          <span className="memo-pick-count" role="status">{pickedVisible.length}개 선택됨</span>
          <button data-theme-slot="button" type="button" className="btn btn-ghost memo-pick-delete" disabled={!pickedVisible.length || removing} onClick={() => void deletePicked()}>
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />{removing ? '삭제 중…' : '삭제'}
          </button>
        </div> : null}
        {!memos.length && !query.trim() ? (
          <div className="mt-3">
            <ExampleCard title="회의에서 나온 아이디어" meta="미분류 · 방금" body="온보딩은 짧게, 예시는 화면에서만 보여 주기" action="첫 메모 작성" onStart={createMemo} />
          </div>
        ) : visible.length === 0 ? <EmptyState>{t('memo.empty')}</EmptyState> : null}
        <ul className="mt-2">
          {visible.map((memo) => (
            <li key={memo.id} data-memo-row={memo.id} className={picking ? 'memo-row memo-row-picking group relative border-t border-line' : 'memo-row group relative border-t border-line'}>
              {picking ? <input type="checkbox" className="memo-row-check" aria-label={`${memo.title} 선택`} checked={picked.has(memo.id)} onChange={() => togglePick(memo.id)} /> : null}
              <button data-theme-slot="button" type="button" onClick={() => picking ? togglePick(memo.id) : setSelectedId(memo.id)} className="w-full py-3 pr-16 text-left">
                <p className={memo.id === selectedId ? 'truncate text-sm text-accent-text' : 'truncate text-sm text-neutral-900'}>
                  {memo.title}
                </p>
                <p className="mt-1 truncate text-xs text-neutral-400">{memoPlainText(memo.body) || '내용 없음'}</p>
              </button>
              {picking ? null : <div className="memo-row-actions reveal absolute top-2 right-0 flex">
                <button data-theme-slot="button" type="button" className="icon-btn" data-tip="수정" aria-label="수정" onClick={() => setSelectedId(memo.id)}>
                  <ThemeIcon name="edit" fallback={Pencil} className="size-3.5" strokeWidth={1.5} />
                </button>
                <button data-theme-slot="button"
                  type="button"
                  className="icon-btn"
                  data-tip="삭제"
                  aria-label={`${memo.title} 삭제`}
                  onClick={() => void deleteMemo(memo)}
                >
                  <ThemeIcon name="delete" fallback={Trash2} className="size-3.5" strokeWidth={1.5} />
                </button>
              </div>}
            </li>
          ))}
        </ul>
        </div>
        </>}
      </div>
      <div className={selected ? 'memo-editor-column block' : 'memo-editor-column hidden md:block'}>
        {selected && phone ? <>
          {createError ? <p role="alert" className="mb-2 text-sm text-red-500">{createError}</p> : null}
          <MemoPhoneEditor
            key={selected.id}
            memo={selected}
            categories={library.categories}
            hideCategory={hideFolders}
            canFavorite={!source}
            fresh={selected.id === freshId}
            defaultTitle={source ? t('custom.unnamed') : '새 메모'}
            backToList={!viewing}
            save={patch => source ? source.save(selected.id, patch) : library.updateMemo(selected.id, { ...patch, tags: selected.tags })}
            onBack={() => setSelectedId(null)}
            onDelete={() => deleteMemo(selected)}
            onFavorite={favorite => library.setMemoFavorite([selected.id], favorite)}
          />
        </> : selected ? (
          <MemoEditor
            key={selected.id}
            id={selected.id}
            memos={memos}
            titleLabel={titleLabel}
            hideCategory={hideFolders}
            onSave={source ? (id, patch) => source.save(id, patch) : undefined}
            onBack={() => setSelectedId(null)}
            onDelete={() => void deleteMemo(selected)}
          />
        ) : (
          <EmptyState>메모를 선택해 주세요.</EmptyState>
        )}
      </div>
    </div>
  )
  if (source) return page
  return (
    <PageCanvas
      pageId="memo"
      editing={editing}
      blocks={resolveLayout('memo', library.pageLayouts.memo)}
      onChange={(blocks) => library.setPageLayout('memo', blocks)}
      render={(block) => (block.type === 'page-body' ? <>{editing || (phone && viewing) ? null : <PageTour page="memo" />}{page}</> : null)}
    />
  )
}

function MemoEditor({
  id,
  memos: scoped,
  titleLabel,
  hideCategory,
  onSave,
  onBack,
  onDelete,
}: {
  id: string
  memos?: ReturnType<typeof useLibrary>['memos']
  titleLabel?: string
  hideCategory?: boolean
  onSave?: (id: string, patch: { title: string; body: string; categoryId: string | null }) => void | Promise<void>
  onBack: () => void
  onDelete: () => void
}) {
  const { memos, categories, updateMemo } = useLibrary()
  const memo = (scoped ?? memos).find((item) => item.id === id)
  const [title, setTitle] = useState(memo?.title ?? '')
  const [body, setBody] = useState(memo?.body ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(memo?.categoryId ?? null)
  const validCategoryId = categories.some(category => category.id === categoryId) ? categoryId : null
  const [saved, setSaved] = useState('')
  const { busy, error: saveError, run } = useSaveAndClose()
  const formRef = useRef<HTMLFormElement>(null)

  useLayoutEffect(() => {
    const form = formRef.current
    if (!form) return
    const resize = () => {
      const phone = window.matchMedia('(max-width: 767px)').matches
      const keyboard = document.querySelector('.theme-app-layout[data-keyboard-open="true"]')
      const bottom = phone ? keyboard ? 16 : 92 : 24
      const available = phone ? window.visualViewport?.height ?? window.innerHeight : window.innerHeight
      const height = `${Math.max(phone ? 220 : 0, available - form.getBoundingClientRect().top - bottom)}px`
      form.style.height = height
      form.closest<HTMLElement>('.memo-layout')?.style.setProperty('--memo-height', height)
    }
    resize()
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
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
        // The editor is its own tab on phones, so a save returns to the list there; on wider screens it stays open beside the list.
        void run(async () => {
          if (onSave) await onSave(id, { title, body, categoryId: validCategoryId })
          else updateMemo(id, { title, body, categoryId: validCategoryId, tags: memo.tags })
          return true
        }, () => {
          setSaved('저장되었습니다.')
          if (window.matchMedia('(max-width: 767px)').matches) onBack()
        })
      }}
    >
      {saveError ? <p role="alert" className="text-sm text-red-500">{saveError}</p> : null}
      <div className="memo-toolbar">
        {hideCategory ? <span className="sr-only">{titleLabel}</span> : <CategoryPicker categories={categories} value={validCategoryId} onChange={setCategoryId} />}
        <div className="memo-toolbar-actions">
        <button data-theme-slot="button" type="button" onClick={onDelete} className="btn btn-ghost">삭제</button>
        <button data-theme-slot="button-primary" type="submit" className="btn btn-primary" title="저장 (Ctrl+S)" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
      <div className="memo-writing-area">
        <input data-theme-slot="input" aria-label={titleLabel ?? '메모 제목'} value={title} onChange={(event) => { setTitle(event.target.value); setSaved('') }} className="memo-title" />
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
