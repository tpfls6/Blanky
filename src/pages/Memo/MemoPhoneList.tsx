import { ArrowLeft, Check, ChevronDown, FileText, Folder, FolderInput, Plus, Search, Share2, Star, StarOff, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { showStatusToast } from '../../components/layout/statusToast.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import type { Memo } from '../../types/records.ts'
import type { WorkspaceCategory } from '../../types/work.ts'
import { categoryPath } from '../../utils/work.ts'
import { useBackLayer } from '../Schedule/mobile/layers.ts'
import { Sheet } from '../Schedule/mobile/Sheet.tsx'
import '../Schedule/mobile/mobileCalendar.css'
import { memoPlainText } from './memoContent.ts'
import { shareMemos } from './memoShare.ts'

const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 8

/**
 * Phone memo list (<768px): folder dropdown and search in the top row, a + button for new memos,
 * and long-press selection with a move / favorite / share / delete bar over the bottom navigation.
 */
export function MemoPhoneList({
  heading, memos, categories, folder, folderLabel, folderCount, count, onFolder, hideFolders, canFavorite,
  query, onQuery, searching, onSearching, selectedId, onOpen, onCreate, onDelete, onMove, onFavorite, empty,
}: {
  heading: string
  /** The memos on screen (folder or search already applied). */
  memos: Memo[]
  categories: WorkspaceCategory[]
  folder: string
  folderLabel: string
  folderCount: number
  count: (id: string) => number
  onFolder: (id: string) => void
  hideFolders: boolean
  canFavorite: boolean
  query: string
  onQuery: (value: string) => void
  searching: boolean
  onSearching: (open: boolean) => void
  selectedId: string | null
  onOpen: (id: string) => void
  onCreate: () => void
  /** Resolves to the ids that failed, or null when the confirm was cancelled. */
  onDelete: (ids: string[]) => Promise<string[] | null>
  onMove: (ids: string[], categoryId: string | null) => Promise<boolean>
  onFavorite: (ids: string[], favorite: boolean) => void
  empty: ReactNode
}) {
  const menuId = useId()
  const menuRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [folderOpen, setFolderOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState<'remove' | 'move' | null>(null)
  // Long press: the pending timer and where the finger went down; `fired` swallows the click that follows.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const fired = useRef(false)

  // Picked ids are checked against the list on screen, so a memo removed elsewhere drops out.
  const pickedMemos = memos.filter(memo => picked.has(memo.id))
  const pickedIds = pickedMemos.map(memo => memo.id)
  const allPicked = memos.length > 0 && pickedIds.length === memos.length
  const allFavorite = pickedMemos.length > 0 && pickedMemos.every(memo => memo.favorite)
  const current = categories.find(category => category.id === folder)
  const ordered = categories.filter(category => category.parentId === null)
    .flatMap(parent => [parent, ...categories.filter(child => child.parentId === parent.id)])

  const stopPicking = () => { setPicking(false); setPicked(new Set()); setMoving(false) }
  const togglePick = (id: string) => setPicked(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const closeSearch = () => { onQuery(''); onSearching(false) }

  // The system Back closes the folder list or leaves selection mode before it leaves the page.
  useBackLayer(folderOpen, () => setFolderOpen(false))
  useBackLayer(picking, stopPicking)

  useEffect(() => {
    if (folderOpen) menuRef.current?.querySelector<HTMLElement>('[aria-current=page]')?.focus({ preventScroll: true })
  }, [folderOpen])
  useEffect(() => {
    if (searching && !picking) searchRef.current?.focus({ preventScroll: true })
  }, [searching, picking])
  useEffect(() => {
    if (!folderOpen && !picking && !searching) return
    const onKey = (event: KeyboardEvent) => {
      // A confirm dialog handles its own Escape; the sheet stops it before it gets here.
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented || document.querySelector('dialog[open]')) return
      if (folderOpen) setFolderOpen(false)
      else if (picking) { setPicking(false); setPicked(new Set()); setMoving(false) }
      else { onQuery(''); onSearching(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [folderOpen, picking, searching, onQuery, onSearching])
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer) }, [])

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }
  const startPress = (event: PointerEvent, id: string) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    cancelPress()
    fired.current = false
    press.current = {
      x: event.clientX,
      y: event.clientY,
      timer: window.setTimeout(() => {
        press.current = null
        fired.current = true
        if (picking) togglePick(id)
        else { setFolderOpen(false); setPicking(true); setPicked(new Set([id])) }
        try { navigator.vibrate?.(20) } catch { /* not supported */ }
      }, LONG_PRESS_MS),
    }
  }
  const movePress = (event: PointerEvent) => {
    const start = press.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancelPress()
  }
  const tapRow = (id: string) => {
    if (fired.current) { fired.current = false; return }
    if (picking) togglePick(id)
    else onOpen(id)
  }

  const chooseFolder = (id: string) => { onFolder(id); setFolderOpen(false) }
  const remove = async () => {
    if (!pickedIds.length || busy) return
    setBusy('remove')
    const failed = await onDelete(pickedIds)
    setBusy(null)
    if (!failed) return
    if (failed.length) setPicked(new Set(failed))
    else stopPicking()
  }
  const move = async (categoryId: string | null) => {
    const ids = pickedIds
    setMoving(false)
    setBusy('move')
    const ok = await onMove(ids, categoryId)
    setBusy(null)
    if (!ok) return
    const name = categoryId ? categoryPath(categoryId, categories) ?? '미분류' : '미분류'
    showStatusToast({ text: `${ids.length}개 메모를 "${name}"(으)로 옮겼어요.`, tone: 'saved' })
    stopPicking()
  }
  const favorite = () => {
    const on = !allFavorite
    onFavorite(pickedIds, on)
    showStatusToast({ text: on ? `${pickedIds.length}개 메모를 즐겨찾기에 추가했어요.` : `${pickedIds.length}개 메모를 즐겨찾기에서 뺐어요.`, tone: 'saved' })
    stopPicking()
  }
  const share = async () => {
    if (!pickedMemos.length) return
    const result = await shareMemos(pickedMemos)
    if (result === 'cancelled') return
    if (result === 'failed') { showStatusToast({ text: '메모를 공유하지 못했어요. 다시 시도해 주세요.', tone: 'failed' }); return }
    if (result === 'copied') showStatusToast({ text: `${pickedMemos.length}개 메모를 클립보드에 복사했어요.`, tone: 'saved' })
    stopPicking()
  }

  const folderIcon = (id: string, color?: string | null) => id === 'all'
    ? <FileText size={18} strokeWidth={1.5} aria-hidden="true" />
    : id === 'star'
      ? <Star size={18} strokeWidth={1.5} aria-hidden="true" className="memo-phone-star" />
      : <Folder size={18} strokeWidth={1.5} aria-hidden="true" style={{ color: color ?? 'var(--faint)' }} />
  const folderItem = (id: string, name: string, color?: string | null, sub = false) => (
    <button key={id} type="button" className={sub ? 'memo-phone-folder-item memo-phone-folder-sub' : 'memo-phone-folder-item'} aria-current={folder === id ? 'page' : undefined} onClick={() => chooseFolder(id)}>
      {folderIcon(id, color)}<span>{name}</span><small>{count(id)}</small>
    </button>
  )

  return (
    <div className="memo-phone" data-picking={picking ? '' : undefined}>
      <h1 className="sr-only">{heading}</h1>
      <div className="memo-phone-head">
        {picking ? <>
          <button type="button" className="memo-phone-icon" aria-label="선택 닫기" onClick={stopPicking}>
            <X size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <p className="memo-phone-picked" role="status" aria-live="polite">{pickedIds.length ? `${pickedIds.length}개 선택됨` : '메모 선택'}</p>
          <button type="button" className="memo-phone-all" aria-pressed={allPicked} disabled={!memos.length} onClick={() => setPicked(allPicked ? new Set() : new Set(memos.map(memo => memo.id)))}>
            <span className="memo-phone-check" aria-hidden="true">{allPicked ? <Check size={14} strokeWidth={3} /> : null}</span>
            전체 선택
          </button>
        </> : searching ? <>
          <button type="button" className="memo-phone-icon" aria-label="검색 닫기" onClick={closeSearch}>
            <ArrowLeft size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <input ref={searchRef} type="search" enterKeyHint="search" className="memo-phone-search" value={query} placeholder="메모 검색" aria-label="메모 검색" onChange={event => onQuery(event.target.value)} />
          {query ? <button type="button" className="memo-phone-icon" aria-label="검색어 지우기" onClick={() => { onQuery(''); searchRef.current?.focus() }}>
            <X size={20} strokeWidth={1.7} aria-hidden="true" />
          </button> : null}
        </> : <>
          {hideFolders
            ? <p className="memo-phone-folder"><span>{heading}</span><small>{folderCount}</small></p>
            : <button type="button" data-tour="memo-folders" className="memo-phone-folder" aria-expanded={folderOpen} aria-controls={menuId} aria-label={`메모 폴더: ${folderLabel}, ${folderCount}개`} onClick={() => setFolderOpen(open => !open)}>
              {current ? <span className="memo-phone-dot" style={{ background: current.color ?? 'var(--faint)' }} aria-hidden="true" /> : null}
              <span>{folderLabel}</span><small>{folderCount}</small>
              <ChevronDown size={18} strokeWidth={1.7} aria-hidden="true" />
            </button>}
          <button type="button" data-tour="memo-search" className="memo-phone-icon" aria-label="메모 검색" onClick={() => { setFolderOpen(false); onSearching(true) }}>
            <Search size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </>}
        {hideFolders ? null : <nav ref={menuRef} id={menuId} className="memo-phone-folders" aria-label="메모 카테고리 폴더" data-open={folderOpen && !picking && !searching ? '' : undefined} inert={!folderOpen || picking || searching}>
          {folderItem('all', '전체 메모')}
          {canFavorite ? folderItem('star', '즐겨찾기') : null}
          {folderItem('none', '미분류')}
          {ordered.length ? <div className="memo-phone-sep" role="separator" /> : null}
          {ordered.map(category => folderItem(category.id, category.name, category.color, category.parentId !== null))}
        </nav>}
      </div>
      {hideFolders ? null : <div className="memo-phone-dim" data-open={folderOpen && !picking && !searching ? '' : undefined} aria-hidden="true" onClick={() => setFolderOpen(false)} />}
      {searching && !picking ? <p className="memo-phone-count" role="status">{query.trim() ? `검색 결과 ${memos.length}개` : '전체 메모에서 검색'}</p> : null}
      {empty}
      <ul className="memo-phone-list" aria-label={picking ? '메모 선택 목록' : '메모 목록'}>
        {memos.map(memo => {
          const on = picked.has(memo.id)
          const category = hideFolders ? undefined : categories.find(item => item.id === memo.categoryId)
          return (
            <li key={memo.id} data-memo-row={memo.id} className="memo-phone-row" data-picked={on ? '' : undefined}>
              <button type="button" className="memo-phone-item" aria-pressed={picking ? on : undefined} aria-current={!picking && memo.id === selectedId ? 'true' : undefined}
                onPointerDown={event => startPress(event, memo.id)} onPointerMove={movePress} onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress}
                onContextMenu={event => event.preventDefault()} onClick={() => tapRow(memo.id)}>
                {picking ? <span className="memo-phone-check" aria-hidden="true">{on ? <Check size={14} strokeWidth={3} /> : null}</span> : null}
                <span className="memo-phone-body">
                  <span className="memo-phone-title">
                    <span>{memo.title}</span>
                    {memo.favorite ? <><Star size={14} aria-hidden="true" className="memo-phone-star" /><span className="sr-only">즐겨찾기</span></> : null}
                  </span>
                  <span className="memo-phone-preview">{memoPlainText(memo.body) || '내용 없음'}</span>
                  <span className="memo-phone-meta">
                    <span>{memo.updatedAt.slice(5, 10).replace('-', '.')}</span>
                    {hideFolders ? null : <span>{category ? <span className="memo-phone-dot" style={{ background: category.color ?? 'var(--faint)' }} aria-hidden="true" /> : null}{category ? categoryPath(category.id, categories) : '미분류'}</span>}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {picking || searching ? null : <button type="button" data-tour="new-memo" data-theme-slot="button-primary" className="memo-fab" aria-label="메모 작성" onClick={onCreate}>
        <ThemeIcon name="add" fallback={Plus} className="size-6" strokeWidth={2} aria-hidden="true" />
      </button>}
      {picking ? <div className="memo-phone-actions" role="toolbar" aria-label="선택한 메모 작업">
        {hideFolders ? null : <button type="button" disabled={!pickedIds.length || busy !== null} onClick={() => setMoving(true)}>
          <FolderInput size={22} strokeWidth={1.6} aria-hidden="true" />이동
        </button>}
        {canFavorite ? <button type="button" aria-pressed={allFavorite} disabled={!pickedIds.length || busy !== null} onClick={favorite}>
          {allFavorite ? <StarOff size={22} strokeWidth={1.6} aria-hidden="true" /> : <Star size={22} strokeWidth={1.6} aria-hidden="true" />}
          {allFavorite ? '즐겨찾기 해제' : '즐겨찾기'}
        </button> : null}
        <button type="button" disabled={!pickedIds.length || busy !== null} onClick={() => void share()}>
          <Share2 size={22} strokeWidth={1.6} aria-hidden="true" />공유
        </button>
        <button type="button" className="memo-phone-delete" disabled={!pickedIds.length || busy !== null} onClick={() => void remove()}>
          <ThemeIcon name="delete" fallback={Trash2} size={22} strokeWidth={1.6} aria-hidden="true" />{busy === 'remove' ? '삭제 중…' : '삭제'}
        </button>
      </div> : null}
      {moving && pickedIds.length ? <Sheet title={`${pickedIds.length}개 메모를 옮길 폴더`} onClose={() => setMoving(false)}>
        <div className="memo-move-list">
          <button type="button" className="memo-move-option" onClick={() => void move(null)}>
            <Folder size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: 'var(--faint)' }} />미분류
          </button>
          {ordered.map(category => <button key={category.id} type="button" className={category.parentId ? 'memo-move-option memo-move-sub' : 'memo-move-option'} onClick={() => void move(category.id)}>
            <Folder size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: category.color ?? 'var(--faint)' }} />{category.name}
          </button>)}
        </div>
      </Sheet> : null}
    </div>
  )
}
