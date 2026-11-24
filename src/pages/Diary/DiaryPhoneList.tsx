import { ArrowLeft, BookOpen, CalendarDays, Check, ChevronDown, List, Plus, Search, Share2, Star, StarOff, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { NotificationBell } from '../../components/calendars/NotificationBell.tsx'
import { MobileMoreLink } from '../../components/layout/MobileTopBar.tsx'
import { AddFab } from '../../components/common/AddFab.tsx'
import { showStatusToast } from '../../components/layout/statusToast.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { diaryTitle } from '../../services/diary/index.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import type { DiaryEntry } from '../../types/records.ts'
import { useBackLayer } from '../Schedule/mobile/layers.ts'
import { shareMemos } from '../Memo/memoShare.ts'
import '../Schedule/mobile/mobileCalendar.css'
import '../Memo/memo.css'
import { DiaryRow, DiaryMonthGroups } from './DiaryRows.tsx'
import { MOODS } from './diaryChoices.ts'

const LONG_PRESS_MS = 450
const MOVE_TOLERANCE = 8

/**
 * Phone diary list (<768px), laid out like the memo list: a filter dropdown (all / favorites / moods),
 * calendar and search in the top row, a + button for new entries, and long-press selection with a
 * favorite / share / delete bar over the bottom navigation. On /diary (`appBar`) the row also carries ☰ and the bell.
 */
export function DiaryPhoneList({
  heading, entries, all, filter, onFilter, appBar, view, onView, calendar, query, onQuery, searching, onSearching,
  busy, onOpen, onCreate, fab, onFavorite, onDelete, empty, caption,
}: {
  heading: string
  /** The entries on screen (filter, search and calendar day already applied), newest first. */
  entries: DiaryEntry[]
  /** Every entry, for the dropdown counts. */
  all: DiaryEntry[]
  filter: string
  onFilter: (filter: string) => void
  /** The /diary route hides MobileTopBar, so this row draws the ☰ more link and the bell itself. */
  appBar: boolean
  view: 'list' | 'calendar'
  onView: () => void
  calendar: ReactNode
  query: string
  onQuery: (value: string) => void
  searching: boolean
  onSearching: (open: boolean) => void
  busy: boolean
  onOpen: (entry: DiaryEntry) => void
  onCreate: () => void
  /** The phone + button (built-in diary); custom pages get a + in the top row instead. */
  fab: boolean
  onFavorite: (ids: string[], favorite: boolean) => Promise<boolean>
  /** Resolves to the ids that failed, or null when the confirm was cancelled. */
  onDelete: (ids: string[]) => Promise<string[] | null>
  empty: ReactNode
  caption?: string
}) {
  const { t } = useI18n()
  const menuId = useId()
  const menuRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const restoreSearchFocus = useRef(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [removing, setRemoving] = useState(false)
  // Long press: the pending timer and where the finger went down; `fired` swallows the click that follows.
  const press = useRef<{ timer: number; x: number; y: number } | null>(null)
  const fired = useRef(false)

  // Picked ids are checked against the list on screen, so an entry removed elsewhere drops out.
  const pickedEntries = entries.filter(entry => picked.has(entry.id))
  const pickedIds = pickedEntries.map(entry => entry.id)
  const allPicked = entries.length > 0 && pickedIds.length === entries.length
  const allFavorite = pickedEntries.length > 0 && pickedEntries.every(entry => entry.isFavorite)
  const iconClass = appBar ? 'mcal-ib' : 'memo-phone-icon'
  const countOf = (id: string) => all.filter(entry => id === 'all' || (id === 'favorites' ? entry.isFavorite : entry.mood === id)).length
  const mood = MOODS.find(item => item[0] === filter)
  const filterName = filter === 'favorites' ? t('diary.favorites') : mood ? `${mood[1]} ${mood[2]}` : heading

  const stopPicking = () => { setPicking(false); setPicked(new Set()) }
  const togglePick = (id: string) => setPicked(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const closeSearch = useCallback(() => {
    restoreSearchFocus.current = true
    onQuery('')
    onSearching(false)
  }, [onQuery, onSearching])

  // The system Back closes the filter list or leaves selection / search before it leaves the page.
  useBackLayer(filterOpen, () => setFilterOpen(false))
  useBackLayer(picking, stopPicking)
  useBackLayer(searching && !picking, closeSearch)

  useEffect(() => {
    if (filterOpen) menuRef.current?.querySelector<HTMLElement>('[aria-current=page]')?.focus({ preventScroll: true })
  }, [filterOpen])
  useEffect(() => {
    if (searching && !picking) searchRef.current?.focus({ preventScroll: true })
    if (!searching && restoreSearchFocus.current) {
      restoreSearchFocus.current = false
      searchButtonRef.current?.focus({ preventScroll: true })
    }
  }, [searching, picking])
  useEffect(() => {
    if (!filterOpen && !picking && !searching) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented || document.querySelector('dialog[open]')) return
      if (filterOpen) setFilterOpen(false)
      else if (picking) { setPicking(false); setPicked(new Set()) }
      else closeSearch()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filterOpen, picking, searching, closeSearch])
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
        else { setFilterOpen(false); setPicking(true); setPicked(new Set([id])) }
        try { navigator.vibrate?.(20) } catch { /* not supported */ }
      }, LONG_PRESS_MS),
    }
  }
  const movePress = (event: PointerEvent) => {
    const start = press.current
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE) cancelPress()
  }
  const tapRow = (entry: DiaryEntry) => {
    if (fired.current) { fired.current = false; return }
    if (picking) togglePick(entry.id)
    else onOpen(entry)
  }

  const chooseFilter = (id: string) => { onFilter(id); setFilterOpen(false) }
  const favorite = async () => {
    const on = !allFavorite, count = pickedIds.length
    if (!await onFavorite(pickedIds, on)) return
    showStatusToast({ text: t(on ? 'diary.favoritedMany' : 'diary.unfavoritedMany', { count }), tone: 'saved' })
    stopPicking()
  }
  const share = async () => {
    if (!pickedEntries.length) return
    const result = await shareMemos(pickedEntries.map(entry => ({ title: diaryTitle(entry), body: entry.body })))
    if (result === 'cancelled') return
    if (result === 'failed') { showStatusToast({ text: t('diary.shareFailed'), tone: 'failed' }); return }
    if (result === 'copied') showStatusToast({ text: t('diary.copied'), tone: 'saved' })
    stopPicking()
  }
  const remove = async () => {
    if (!pickedIds.length || removing) return
    setRemoving(true)
    const failed = await onDelete(pickedIds)
    setRemoving(false)
    if (!failed) return
    if (failed.length) setPicked(new Set(failed))
    else stopPicking()
  }

  const filterItem = (id: string, icon: ReactNode, name: string) => (
    <button key={id} type="button" className="memo-phone-folder-item" aria-current={filter === id ? 'page' : undefined} onClick={() => chooseFilter(id)}>
      {icon}<span>{name}</span><small>{countOf(id)}</small>
    </button>
  )
  const moods = MOODS.filter(([id]) => countOf(id) > 0)

  return (
    <div className="memo-phone diary-phone" data-picking={picking ? '' : undefined}>
      <h1 className="sr-only">{heading}</h1>
      <div className="memo-phone-head" data-app-bar={appBar ? '' : undefined}>
        {picking ? <>
          <button type="button" className={iconClass} aria-label={t('diary.closePick')} onClick={stopPicking}>
            <X size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <p className="memo-phone-picked" role="status" aria-live="polite">{pickedIds.length ? t('diary.picked', { count: pickedIds.length }) : t('diary.pickPrompt')}</p>
          <button type="button" className="memo-phone-all" aria-pressed={allPicked} disabled={!entries.length} onClick={() => setPicked(allPicked ? new Set() : new Set(entries.map(entry => entry.id)))}>
            <span className="memo-phone-check" aria-hidden="true">{allPicked ? <Check size={14} strokeWidth={3} /> : null}</span>
            {t('diary.pickAll')}
          </button>
        </> : searching ? <>
          <button type="button" className={iconClass} aria-label={t('diary.closeSearch')} onClick={closeSearch}>
            <ArrowLeft size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <input ref={searchRef} type="search" enterKeyHint="search" className="memo-phone-search" value={query} placeholder={t('diary.search')} aria-label={t('diary.search')} onChange={event => onQuery(event.target.value)} />
          {query ? <button type="button" className={iconClass} aria-label={t('diary.clearSearch')} onClick={() => { onQuery(''); searchRef.current?.focus() }}>
            <X size={20} strokeWidth={1.7} aria-hidden="true" />
          </button> : null}
        </> : <>
          {appBar ? <MobileMoreLink className="mcal-ib" iconClassName="size-5.5" strokeWidth={1.6} /> : null}
          <button type="button" data-tour="diary-filter" className="memo-phone-folder" aria-expanded={filterOpen} aria-controls={menuId} aria-label={t('diary.filterButton', { name: filterName, count: countOf(filter) })} onClick={() => setFilterOpen(open => !open)}>
            <span>{filterName}</span><small>{countOf(filter)}</small>
            <ChevronDown size={18} strokeWidth={1.7} aria-hidden="true" />
          </button>
          <button type="button" className={iconClass + ' diary-view-toggle'} aria-label={t(view === 'list' ? 'diary.calendarView' : 'diary.listView')} aria-pressed={view === 'calendar'} onClick={() => { setFilterOpen(false); onView() }}>
            {view === 'list' ? <ThemeIcon name="calendar" fallback={CalendarDays} size={22} strokeWidth={1.7} /> : <List size={22} strokeWidth={1.7} aria-hidden="true" />}
          </button>
          <button ref={searchButtonRef} type="button" className={iconClass} aria-label={t('diary.search')} onClick={() => { setFilterOpen(false); onSearching(true) }}>
            <Search size={22} strokeWidth={appBar ? 1.8 : 1.7} aria-hidden="true" />
          </button>
          {fab ? null : <button type="button" className={iconClass + ' diary-new'} aria-label={t('diary.newEntry')} disabled={busy} onClick={onCreate}>
            <Plus size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>}
          {appBar && isSupabaseConfigured ? <NotificationBell align="right" /> : null}
        </>}
        <nav ref={menuRef} id={menuId} className="memo-phone-folders" aria-label={t('diary.filterLabel')} data-open={filterOpen && !picking && !searching ? '' : undefined} inert={!filterOpen || picking || searching}>
          {filterItem('all', <BookOpen size={18} strokeWidth={1.5} aria-hidden="true" />, t('diary.filterAll'))}
          {filterItem('favorites', <Star size={18} strokeWidth={1.5} aria-hidden="true" className="memo-phone-star" />, t('diary.favorites'))}
          {moods.length ? <div className="memo-phone-sep" role="separator" /> : null}
          {moods.map(([id, icon, name]) => filterItem(id, <b className="diary-filter-emoji" aria-hidden="true">{icon}</b>, name))}
        </nav>
      </div>
      <div className="memo-phone-dim" data-open={filterOpen && !picking && !searching ? '' : undefined} aria-hidden="true" onClick={() => setFilterOpen(false)} />
      {searching && !picking
        ? <p className="memo-phone-count" role="status">{query.trim() ? t('diary.searchResults', { count: entries.length }) : t('diary.searchAll')}</p>
        : view === 'calendar' ? <>{calendar}<p className="memo-phone-count diary-cal-count" role="status">{caption}</p></> : null}
      {empty}
      {entries.length ? view === 'calendar' && !searching
        ? <ul className="diary-entries" aria-label={t(picking ? 'diary.pickListLabel' : 'diary.listLabel')}>{entries.map(entry => row(entry))}</ul>
        : <DiaryMonthGroups entries={entries} label={t(picking ? 'diary.pickListLabel' : 'diary.listLabel')} row={row} />
        : null}
      <div className="diary-phone-pad" aria-hidden="true" />
      {fab ? <AddFab tour="new-diary" hidden={picking || searching} onManual={onCreate} /> : null}
      {picking ? <div className="memo-phone-actions" role="toolbar" aria-label={t('diary.pickActions')}>
        <button type="button" aria-pressed={allFavorite} disabled={!pickedIds.length || busy || removing} onClick={() => void favorite()}>
          {allFavorite ? <StarOff size={22} strokeWidth={1.6} aria-hidden="true" /> : <Star size={22} strokeWidth={1.6} aria-hidden="true" />}
          {t(allFavorite ? 'diary.unfavorite' : 'diary.favorite')}
        </button>
        <button type="button" disabled={!pickedIds.length || removing} onClick={() => void share()}>
          <Share2 size={22} strokeWidth={1.6} aria-hidden="true" />{t('diary.share')}
        </button>
        <button type="button" className="memo-phone-delete" disabled={!pickedIds.length || busy || removing} onClick={() => void remove()}>
          <ThemeIcon name="delete" fallback={Trash2} size={22} strokeWidth={1.6} aria-hidden="true" />{t(removing ? 'diary.deleting' : 'diary.delete')}
        </button>
      </div> : null}
    </div>
  )

  function row(entry: DiaryEntry) {
    const on = picked.has(entry.id)
    return <DiaryRow key={entry.id} entry={entry} picking={picking} picked={on} onClick={() => tapRow(entry)}
      press={{ onPointerDown: event => startPress(event, entry.id), onPointerMove: movePress, onPointerUp: cancelPress, onPointerCancel: cancelPress, onPointerLeave: cancelPress }} />
  }
}
