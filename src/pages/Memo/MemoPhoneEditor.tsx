import { ArrowLeft, Check, ChevronDown, EllipsisVertical, Folder, Share2, Star, StarOff, Trash2 } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { showStatusToast } from '../../components/layout/statusToast.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import type { Memo } from '../../types/records.ts'
import type { WorkspaceCategory } from '../../types/work.ts'
import { categoryPath } from '../../utils/work.ts'
import { useBackLayer } from '../Schedule/mobile/layers.ts'
import { Sheet } from '../Schedule/mobile/Sheet.tsx'
import '../Schedule/mobile/mobileCalendar.css'
import { memoPlainText } from './memoContent.ts'
import { createAutosave, memoAutoTitle, type AutosaveStatus } from './memoAutosave.ts'
import { MemoRichEditor } from './MemoRichEditor.tsx'
import { shareMemos } from './memoShare.ts'

type Patch = { title: string; body: string; categoryId: string | null }
const shortDate = (iso: string) => iso.slice(5, 10).replace('-', '.')

/**
 * Phone memo editor (<768px): ← and the title in the top bar, a ⋮ menu (favorite / share / delete),
 * a category chip, the body full width and the format row at the bottom. Changes save themselves
 * (800ms after typing stops, and at once on ←, the system Back, Ctrl+S, leaving the app or unmounting).
 */
export function MemoPhoneEditor({ memo, categories, hideCategory, canFavorite, fresh, defaultTitle, backToList = true, save, onBack, onDelete, onFavorite }: {
  memo: Memo
  categories: WorkspaceCategory[]
  hideCategory: boolean
  canFavorite: boolean
  /** Just created: the title field starts empty so the first body line can name it. */
  fresh: boolean
  defaultTitle: string
  /** The system Back returns to the memo list; off for a memo opened from elsewhere (Home 보기), where Back leaves the page. */
  backToList?: boolean
  save: (patch: Patch) => void | Promise<void>
  onBack: () => void
  /** Confirms and moves the memo to the trash; resolves to whether it was removed. */
  onDelete: () => Promise<boolean>
  onFavorite: (favorite: boolean) => void
}) {
  const [title, setTitle] = useState(fresh ? '' : memo.title)
  const [categoryId, setCategoryId] = useState<string | null>(memo.categoryId ?? null)
  const validCategoryId = categories.some(category => category.id === categoryId) ? categoryId : null
  const draft = useRef<Patch>({ title: fresh ? '' : memo.title, body: memo.body, categoryId: validCategoryId })
  const [status, setStatus] = useState<{ state: AutosaveStatus; error?: string }>({ state: 'idle' })
  const [menuOpen, setMenuOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  // One autosave per mounted memo; `sync` hands it the newest save callback after each render.
  const [{ autosave, sync }] = useState(() => {
    const latest = { save, defaultTitle }
    return {
      autosave: createAutosave<Patch>({
        save: patch => latest.save({ ...patch, title: memoAutoTitle(patch.title, memoPlainText(patch.body), latest.defaultTitle) }),
        onStatus: (state, error) => setStatus({ state, error }),
      }),
      sync: (next: typeof latest) => { Object.assign(latest, next) },
    }
  })
  useEffect(() => { sync({ save, defaultTitle }) })
  const change = (patch: Partial<Patch>) => {
    draft.current = { ...draft.current, ...patch }
    autosave.change(draft.current)
  }
  // ← and the system Back: save what is waiting first; a failed save keeps the memo open with the error.
  const back = async () => {
    if (await autosave.flush()) onBack()
  }

  useBackLayer(backToList, () => { void autosave.flush(); onBack() })
  useBackLayer(menuOpen, () => setMenuOpen(false))

  // Unmounting (another tab, another memo) or the app going to the background saves at once.
  useEffect(() => {
    const hide = () => { if (document.visibilityState === 'hidden') void autosave.flush() }
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      void autosave.flush()
    }
  }, [autosave])

  useEffect(() => {
    const saveOnShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void autosave.flush()
      }
    }
    window.addEventListener('keydown', saveOnShortcut)
    return () => window.removeEventListener('keydown', saveOnShortcut)
  }, [autosave])

  // The editor fills the visible viewport down to the bottom navigation, or to the keyboard while it is open,
  // so the format row at its bottom sits right above either one.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const main = root.closest('main')
    main?.scrollTo({ top: 0 })
    const resize = () => {
      const viewport = window.visualViewport
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0
      const visible = viewport ? viewport.offsetTop + viewport.height : window.innerHeight
      root.style.height = `${Math.max(220, visible - root.getBoundingClientRect().top - bottom)}px`
    }
    resize()
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    // data-keyboard-open flips a frame after the viewport resize; main's bottom padding changes with it.
    const layout = root.closest('.theme-app-layout')
    const observer = new MutationObserver(resize)
    if (layout) observer.observe(layout, { attributes: true, attributeFilter: ['data-keyboard-open'] })
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      setMenuOpen(false)
      moreRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const chooseCategory = (id: string | null) => {
    setPicking(false)
    setCategoryId(id)
    change({ categoryId: id })
    void autosave.flush()
  }
  const toggleFavorite = () => {
    setMenuOpen(false)
    const on = !memo.favorite
    onFavorite(on)
    showStatusToast({ text: on ? '즐겨찾기에 추가했어요.' : '즐겨찾기에서 뺐어요.', tone: 'saved' })
  }
  const share = async () => {
    setMenuOpen(false)
    const current = draft.current
    const result = await shareMemos([{ title: memoAutoTitle(current.title, memoPlainText(current.body), defaultTitle), body: current.body }])
    if (result === 'copied') showStatusToast({ text: '메모를 클립보드에 복사했어요.', tone: 'saved' })
    if (result === 'failed') showStatusToast({ text: '메모를 공유하지 못했어요. 다시 시도해 주세요.', tone: 'failed' })
  }
  const remove = async () => {
    setMenuOpen(false)
    // Save first so the trash keeps the latest text, then hold further saves while the memo is removed.
    await autosave.flush()
    autosave.stop()
    if (!await onDelete()) autosave.resume()
  }

  const category = categories.find(item => item.id === validCategoryId)
  const ordered = categories.filter(item => item.parentId === null)
    .flatMap(parent => [parent, ...categories.filter(child => child.parentId === parent.id)])
  const saving = status.state === 'pending' || status.state === 'saving'

  return (
    <div ref={rootRef} className="memo-phone-editor">
      <div className="memo-pe-top">
        <button type="button" data-tour="memo-back" className="memo-phone-icon" aria-label="목록으로" onClick={() => void back()}>
          <ArrowLeft size={22} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <input data-theme-slot="input" className="memo-title memo-pe-title" value={title} placeholder="제목" aria-label="메모 제목" enterKeyHint="next"
          onChange={event => { setTitle(event.target.value); change({ title: event.target.value }) }}
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
            event.preventDefault()
            rootRef.current?.querySelector<HTMLElement>('.memo-rich-content')?.focus()
          }} />
        <button ref={moreRef} type="button" className="memo-phone-icon" aria-label="더보기" aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen(open => !open)}>
          <EllipsisVertical size={22} strokeWidth={1.7} aria-hidden="true" />
        </button>
        {menuOpen ? <>
          <div className="memo-pe-menu-dim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <div ref={menuRef} id={menuId} className="memo-pe-menu" role="menu" aria-label="메모 작업">
            {canFavorite ? <button type="button" role="menuitem" onClick={toggleFavorite}>
              {memo.favorite ? <StarOff size={18} strokeWidth={1.6} aria-hidden="true" /> : <Star size={18} strokeWidth={1.6} aria-hidden="true" className="memo-phone-star" />}
              {memo.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
            </button> : null}
            <button type="button" role="menuitem" onClick={() => void share()}>
              <Share2 size={18} strokeWidth={1.6} aria-hidden="true" />공유
            </button>
            <button type="button" role="menuitem" className="memo-pe-danger" onClick={() => void remove()}>
              <ThemeIcon name="delete" fallback={Trash2} size={18} strokeWidth={1.6} aria-hidden="true" />삭제
            </button>
          </div>
        </> : null}
      </div>
      <div className="memo-pe-meta">
        {hideCategory ? null : <button type="button" className="memo-pe-chip" aria-haspopup="dialog" aria-label={`카테고리: ${category ? categoryPath(category.id, categories) : '미분류'}. 바꾸기`} onClick={() => setPicking(true)}>
          <span className="memo-phone-dot" style={{ background: category?.color ?? 'var(--faint)' }} aria-hidden="true" />
          <span>{category ? categoryPath(category.id, categories) : '미분류'}</span>
          <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true" />
        </button>}
        <span className="memo-pe-date" title={`작성 ${memo.createdAt.slice(0, 10)} · 수정 ${memo.updatedAt.slice(0, 10)}`}>작성 {shortDate(memo.createdAt)} · 수정 {shortDate(memo.updatedAt)}</span>
        <span className="memo-pe-status" role="status" data-state={status.state}>
          {saving ? '저장 중…' : status.state === 'saved' ? <><Check size={14} strokeWidth={2.4} aria-hidden="true" />저장됨</> : status.state === 'failed' ? '저장하지 못했어요' : ''}
        </span>
        {status.state === 'failed' ? <button type="button" className="memo-pe-retry" title={status.error} onClick={() => void autosave.flush()}>다시 시도</button> : null}
      </div>
      <MemoRichEditor phone initialBody={memo.body} onChange={value => change({ body: value })} />
      {picking ? <Sheet title="카테고리" onClose={() => setPicking(false)}>
        <div className="memo-move-list" role="radiogroup" aria-label="카테고리">
          {[{ id: null, name: '미분류', color: null, parentId: null } as const, ...ordered].map(item => (
            <button key={item.id ?? 'none'} type="button" role="radio" aria-checked={validCategoryId === item.id} className={item.parentId ? 'memo-move-option memo-move-sub' : 'memo-move-option'} onClick={() => chooseCategory(item.id)}>
              <Folder size={20} strokeWidth={1.5} aria-hidden="true" style={{ color: item.color ?? 'var(--faint)' }} />
              <span className="memo-pe-option-name">{item.name}</span>
              {validCategoryId === item.id ? <Check size={18} strokeWidth={2.2} aria-hidden="true" className="memo-pe-tick" /> : null}
            </button>
          ))}
        </div>
      </Sheet> : null}
    </div>
  )
}
