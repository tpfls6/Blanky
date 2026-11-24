import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { BookOpen, CalendarDays, List, Plus, Search, Star, Trash2, X } from 'lucide-react'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import type { DiaryEntry } from '../../types/records.ts'
import { diaryTitle, readDiaryDraft, storeDiaryDraft, clearSavedDiaryDraft } from '../../services/diary/index.ts'
import { DEFAULT_FIELD_LABELS, fieldLabel } from '../../features/pages/templates.ts'
import { formatDisplayDate } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { ROUTES } from '../../constants/routes.ts'
import { todayISO } from '../../utils/date.ts'
import { DiaryCalendar } from './DiaryCalendar.tsx'
import { DiaryPhoneList } from './DiaryPhoneList.tsx'
import { DiaryPhoneEditor, SaveStatus } from './DiaryPhoneEditor.tsx'
import { ChoiceGrid, DiaryDateButton, DiaryMonthGroups, DiaryRow, DiaryTags } from './DiaryRows.tsx'
import { MOODS, WEATHER, choiceOf, entryTime } from './diaryChoices.ts'
import { ExampleCard } from '../../features/onboarding/Example.tsx'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
import './diary.css'

/** 'all', 'favorites' or a mood id (the phone dropdown's 기분별 보기). */
type Filter = string
function blankEntry(): DiaryEntry {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: '', body: '', date: todayISO(), tags: [], isFavorite: false, createdAt: now, updatedAt: now }
}
export type DiaryWorkspaceProps = {
  userId: string
  pageKey?: string
  editing?: boolean
  canvas?: boolean
  heading?: string
  /** Kept for callers; the redesigned header shows only the title and count. */
  tagline?: string
  labels?: Record<string, string>
  entries?: DiaryEntry[]
  loading?: boolean
  error?: string
  save?: (entry: DiaryEntry) => Promise<DiaryEntry>
  remove?: (id: string) => Promise<void>
  /** Opens this entry once it has loaded (Home's 보기). */
  openId?: string
}

export function DiaryPage({ editing = false }: { editing?: boolean }) {
  const { user } = useSession()
  const openId = (useLocation().state as { openId?: unknown } | null)?.openId
  return <DiaryWorkspace key={user?.id ?? 'guest'} userId={user?.id ?? ''} editing={editing} openId={typeof openId === 'string' ? openId : undefined} />
}
export function DiaryWorkspace({
  userId,
  pageKey = 'builtin',
  editing = false,
  canvas = true,
  heading: headingProp,
  labels = DEFAULT_FIELD_LABELS.diary,
  entries,
  loading,
  error: errorProp,
  save: saveProp,
  remove: removeProp,
  openId,
}: DiaryWorkspaceProps) {
  const { t, locale } = useI18n()
  const confirm = useConfirm()
  const library = useLibrary()
  const diaries = entries ?? library.diaries
  const commitDiary = saveProp ?? library.commitDiary
  const eraseDiary = removeProp ?? library.eraseDiary
  const diaryLoading = loading ?? library.diaryLoading
  const diaryError = errorProp ?? library.diaryError
  const { settings, pageLayouts, setPageLayout } = library
  const field = (key: string) => fieldLabel('diary', key, labels)
  const heading = headingProp ?? t('diary.title')
  const phone = useMediaQuery(PHONE_QUERY)
  // Only the built-in /diary hides MobileTopBar; custom pages and previews keep it, so they keep their own header.
  const { pathname } = useLocation()
  const appBar = pageKey === 'builtin' && pathname === ROUTES.diary
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  // Phones search every entry from the app bar; desktop opens a search field under the title.
  const [searching, setSearching] = useState(false)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [listError, setListError] = useState('')
  const [draft, setDraft] = useState<DiaryEntry | null>(() => readDiaryDraft(userId, pageKey))
  const [dirty, setDirty] = useState(() => Boolean(readDiaryDraft(userId, pageKey)))
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [choiceOpen, setChoiceOpen] = useState<'mood' | 'weather' | null>(null)
  const deleting = useRef(false)
  const [showEditor, setShowEditor] = useState(() => Boolean(readDiaryDraft(userId, pageKey)))
  const persisted = useRef(new Set(diaries.map(entry => entry.id)))
  useEffect(() => { for (const entry of diaries) persisted.current.add(entry.id) }, [diaries])
  const current = useRef(draft)
  const revision = useRef(0)
  const pending = useRef<Promise<boolean> | null>(null)
  const dirtyRef = useRef(dirty)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleInput = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const edit = (patch: Partial<DiaryEntry>) => {
    const previous = current.current
    if (!previous) return
    const next = { ...previous, ...patch }
    // Write the recovery draft before scheduling a remote save.
    try { storeDiaryDraft(userId, next, pageKey) } catch { setError('임시 기록을 보관하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'); return }
    current.current = next
    revision.current += 1
    dirtyRef.current = true
    setDraft(next)
    setDirty(true)
    setError('')
    setStatus(next.title?.trim() || next.body.trim() ? '저장 대기 중' : '내용을 입력하면 저장됩니다')
  }
  const save = useCallback(async (): Promise<boolean> => {
    if (deleting.current) return false
    if (pending.current) {
      const ok = await pending.current
      if (!ok) return false
    }
    const entry = current.current
    if (!entry || !dirtyRef.current) return true
    if (!entry.title?.trim() && !entry.body.trim() && !persisted.current.has(entry.id)) {
      if (mounted.current) setStatus('내용을 입력하면 저장됩니다')
      return true
    }
    const version = revision.current
    if (mounted.current) { setStatus('저장 중…'); setError('') }
    const operation = (async () => {
      try {
        const saved = await commitDiary(entry)
        persisted.current.add(saved.id)
        if (version === revision.current) {
          clearSavedDiaryDraft(userId, entry, pageKey)
          dirtyRef.current = false
          current.current = saved
          if (mounted.current) { setDraft(saved); setDirty(false); setStatus('저장됨') }
        }
        return true
      } catch (e) {
        if (mounted.current) { setStatus('저장 실패'); setError(e instanceof Error ? e.message : '저장하지 못했습니다.') }
        return false
      }
    })()
    pending.current = operation
    const ok = await operation
    if (pending.current === operation) pending.current = null
    return ok
  }, [commitDiary, userId, pageKey])
  useEffect(() => {
    if (!dirty || diaryLoading || busy || dialogOpen) return
    const timer = window.setTimeout(() => { if (!composing.current) void save() }, 900)
    return () => window.clearTimeout(timer)
  }, [draft, dirty, diaryLoading, busy, dialogOpen, save])
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') void save() }
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && (current.current?.title?.trim() || current.current?.body.trim())) { event.preventDefault(); event.returnValue = '' }
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('beforeunload', unload)
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('beforeunload', unload) }
  }, [save])
  useEffect(() => {
    if (!choiceOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) setChoiceOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choiceOpen])
  // IME input saves once the syllable is committed, not while it is being composed.
  const composition = { start: () => { composing.current = true }, end: () => { composing.current = false; void save() } }

  const open = async (entry: DiaryEntry | null) => {
    if (busy) return
    setBusy(true)
    if (!await save()) { setBusy(false); return }
    // Edits made while a save was in flight must also be acknowledged.
    while (dirtyRef.current && (current.current?.body.trim() || current.current?.title?.trim())) {
      if (!await save()) { setBusy(false); return }
    }
    if (!mounted.current) return
    const next = entry ?? { ...blankEntry(), date: view === 'calendar' && selectedDate ? selectedDate : todayISO() }
    storeDiaryDraft(userId, null, pageKey)
    current.current = next
    revision.current += 1
    dirtyRef.current = false
    setDraft(next); setDirty(false); setError(''); setChoiceOpen(null)
    setStatus(entry ? '저장됨' : '내용을 입력하면 저장됩니다')
    setShowEditor(true); setBusy(false)
    if (!entry) window.setTimeout(() => titleInput.current?.focus(), 0)
  }
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open })
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || !openId || diaryLoading) return
    const entry = diaries.find(row => row.id === openId)
    if (!entry) return
    opened.current = true
    void openRef.current(entry)
  }, [openId, diaryLoading, diaries])
  const closeEditor = async () => { if (await save()) setShowEditor(false) }
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const scope = phone && searching ? 'all' : filter
    return diaries.filter(entry => (scope === 'all' || (scope === 'favorites' ? entry.isFavorite : entry.mood === scope)) &&
      (!query || [diaryTitle(entry), entry.body, ...entry.tags].some(text => text.toLocaleLowerCase().includes(query))))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [diaries, search, filter, phone, searching])
  const calendarOn = view === 'calendar' && !(phone && searching)
  const visible = useMemo(() => calendarOn ? filtered.filter(entry => selectedDate ? entry.date === selectedDate : entry.date.startsWith(month)) : filtered, [filtered, calendarOn, selectedDate, month])
  // Favorites from the list (phone selection bar): the entry open in the editor goes through its own draft.
  const setFavorites = async (ids: string[], favorite: boolean) => {
    if (busy) return false
    setBusy(true); setListError('')
    try {
      if (!await save()) throw new Error('작성 중인 기록을 먼저 저장해 주세요.')
      for (const entry of diaries.filter(row => ids.includes(row.id))) {
        if (current.current?.id === entry.id) {
          edit({ isFavorite: favorite })
          if (!await save()) throw new Error(t('diary.favoriteFailed'))
        } else await commitDiary({ ...entry, isFavorite: favorite })
      }
      return true
    } catch (e) { setListError(e instanceof Error ? e.message : t('diary.favoriteFailed')); return false }
    finally { setBusy(false) }
  }
  const dropDraft = () => {
    storeDiaryDraft(userId, null, pageKey)
    revision.current += 1; dirtyRef.current = false; current.current = null
    setDraft(null); setDirty(false); setShowEditor(false); setStatus(''); setError('')
  }
  // Phone selection bar: confirms, then moves the entries to the trash; resolves to the ids that failed (null when cancelled).
  const deleteEntries = async (ids: string[]): Promise<string[] | null> => {
    const targets = diaries.filter(entry => ids.includes(entry.id))
    if (!targets.length || busy) return null
    if (!await confirm(t('diary.deleteAsk', { count: targets.length }), { title: t('diary.deleteTitle'), confirmLabel: t('diary.deleteCount', { count: targets.length }) })) return null
    deleting.current = true
    setBusy(true)
    const failed: string[] = []
    try {
      if (pending.current) await pending.current
      for (const entry of targets) {
        try {
          await eraseDiary(entry.id)
          if (current.current?.id === entry.id) dropDraft()
        } catch { failed.push(entry.id) }
      }
    } finally { deleting.current = false; setBusy(false) }
    setListError(failed.length ? t('diary.deleteFailed', { count: failed.length }) : '')
    return failed
  }
  const changeView = () => {
    setView(previous => previous === 'list' ? 'calendar' : 'list')
    setSelectedDate(null)
    if (!phone) setShowEditor(false)
  }
  const remove = async () => {
    if (!draft) return
    deleting.current = true
    setBusy(true)
    try {
      if (pending.current) await pending.current
      const id = draft.id
      if (persisted.current.has(id)) await eraseDiary(id)
      dropDraft()
      dialog.current?.close()
    } catch (e) { setError(e instanceof Error ? e.message : '삭제하지 못했습니다.') }
    finally { deleting.current = false; setBusy(false) }
  }
  const askDelete = () => { setDialogOpen(true); dialog.current?.showModal() }

  const calendar = calendarOn ? <DiaryCalendar month={month} selectedDate={selectedDate} entries={filtered} weekStartsOn={settings.weekStartsOn} disabled={busy || diaryLoading} onMonth={next => { setMonth(next); setSelectedDate(null) }} onSelect={setSelectedDate} /> : null
  const caption = (selectedDate ? formatDisplayDate(locale, selectedDate) + ' · ' : '') + t('diary.entries', { count: visible.length })
  const mood = MOODS.find(item => item[0] === filter)
  const empty = diaryLoading ? <p className="diary-list-empty" role="status">기록을 불러오는 중…</p>
    : !diaries.length && !search && filter === 'all' && !calendarOn ? <div className="diary-example"><ExampleCard title="퇴근길에 본 노을" meta={`${formatDisplayDate(locale, todayISO())} · 🙂 · ☀️`} body="오늘은 일찍 나와서 한강까지 걸었다. 하늘이 천천히 붉어졌다." action="첫 기록 쓰기" onStart={() => void open(null)} /></div>
    : visible.length === 0 ? <p className="diary-list-empty">{search.trim() ? '검색 결과가 없습니다.' : calendarOn ? '이 날짜에는 아직 기록이 없어요.' : filter === 'favorites' ? (phone ? t('diary.emptyFavorites') : '마음에 남는 기록에 별을 눌러보세요.') : mood ? t('diary.emptyMood') : '작은 생각부터 기록해보세요.'}</p>
    : null
  const errorBanner = diaryError ? <p role="alert" className="diary-error">기록 연결 오류: {diaryError} <button data-theme-slot="button-secondary" type="button" className="btn btn-line" onClick={() => window.location.reload()}>다시 불러오기</button></p> : null
  const deleteDialog = <dialog data-theme-slot="modal" ref={dialog} className="diary-delete-dialog" onClose={() => setDialogOpen(false)} onCancel={event => { if (busy) event.preventDefault() }}><h2>이 기록을 삭제하시겠습니까?</h2><p>휴지통으로 이동하며, 거기서 복구할 수 있습니다.</p><div><button data-theme-slot="button-secondary" type="button" autoFocus className="btn btn-line" disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button data-theme-slot="button-primary" type="button" className="btn btn-primary" disabled={busy} onClick={() => void remove()}>{busy ? '삭제 중…' : '삭제'}</button></div>{error && <p role="alert">{error}</p>}</dialog>
  const editorError = error ? <p className="diary-error" role="alert">{error} 입력한 내용은 임시 보관되어 있습니다.</p> : null

  const phonePage = (
    <div className="diary-page diary-phone-page" data-app-bar={appBar ? '' : undefined}>
      {errorBanner}
      {showEditor && draft ? <>
        <DiaryPhoneEditor key={draft.id} draft={draft} field={field} status={status} dirty={dirty} error={error} disabled={busy || diaryLoading} appBar={appBar}
          backToList={!(openId && draft.id === openId)} titleRef={titleInput} composing={composition} edit={edit}
          onBack={() => void closeEditor()} onSave={() => void save()} onDelete={askDelete} />
        {editorError}
      </> : <>
        {listError ? <p role="alert" className="diary-error diary-list-error">{listError}</p> : null}
        <DiaryPhoneList heading={heading} entries={diaryLoading ? [] : visible} all={diaries} filter={filter} onFilter={next => { setFilter(next); setSelectedDate(null) }}
          appBar={appBar} view={view} onView={changeView} calendar={calendar} caption={caption} query={search} onQuery={setSearch} searching={searching} onSearching={setSearching}
          busy={busy || diaryLoading} onOpen={entry => void open(entry)} onCreate={() => void open(null)} fab={pageKey === 'builtin'}
          onFavorite={setFavorites} onDelete={deleteEntries} empty={empty} />
      </>}
      {deleteDialog}
    </div>
  )

  const choiceChip = (key: 'mood' | 'weather') => {
    const choice = choiceOf(key === 'mood' ? MOODS : WEATHER, draft?.[key])
    return <span className="diary-chip-pop">
      <button type="button" className={choice ? 'diary-chip' : 'diary-chip diary-chip-ghost'} aria-haspopup="dialog" aria-expanded={choiceOpen === key}
        aria-label={choice ? `${field(key)}: ${choice[2]}` : field(key)} onClick={() => setChoiceOpen(open => open === key ? null : key)}>
        {choice ? `${choice[1]} ${choice[2]}` : `＋ ${field(key)}`}
      </button>
      {choiceOpen === key && draft ? <>
        <div className="diary-pop-dim" aria-hidden="true" onClick={() => setChoiceOpen(null)} />
        <div className="diary-pop" role="dialog" aria-label={field(key)}>
          <p>{field(key)}</p>
          <ChoiceGrid choices={key === 'mood' ? MOODS : WEATHER} value={draft[key]} onPick={value => { edit({ [key]: value }); setChoiceOpen(null) }} />
        </div>
      </> : null}
    </span>
  }
  const searchOpen = searching || Boolean(search)
  const desktopPage = (
    <div className="diary-page">
      {errorBanner}
      <div data-theme-slot="diary-page" className="diary-workspace">
        <aside data-theme-slot="diary-list" className="diary-list" aria-label="기록 목록">
          <header data-theme-slot="page-header" className="diary-heading">
            <h1>{heading}<small>{diaries.length}</small></h1>
            <button type="button" data-theme-slot="button" className="diary-icon-btn diary-view-toggle" aria-label={t(view === 'list' ? 'diary.calendarView' : 'diary.listView')} aria-pressed={view === 'calendar'} onClick={changeView}>
              {view === 'list' ? <ThemeIcon name="calendar" fallback={CalendarDays} size={19} strokeWidth={1.6} /> : <List size={19} strokeWidth={1.6} aria-hidden="true" />}
            </button>
            <button type="button" data-theme-slot="button" className="diary-icon-btn" aria-label={t('diary.search')} aria-pressed={searchOpen} onClick={() => { if (searchOpen) { setSearch(''); setSearching(false) } else setSearching(true) }}>
              <ThemeIcon name="search" fallback={Search} size={19} strokeWidth={1.6} />
            </button>
          </header>
          {searchOpen ? <label className="diary-search"><ThemeIcon name="search" fallback={Search} size={15} aria-hidden="true" /><input data-theme-slot="input" autoFocus aria-label={t('diary.search')} placeholder={t('diary.search') + '…'} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setSearch(''); setSearching(false) } }} />{search && <button data-theme-slot="button" type="button" aria-label={t('diary.clearSearch')} onClick={() => setSearch('')}><X size={14} aria-hidden="true" /></button>}</label> : null}
          <div className="diary-tabs" role="group" aria-label={t('diary.filterLabel')}>{[['all', t('diary.filterAllShort')], ['favorites', t('diary.favorites')]].map(([id, label]) => <button data-theme-slot="button" key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setSelectedDate(null) }}>{label}</button>)}</div>
          <button data-theme-slot="button-primary" type="button" className="btn btn-primary diary-new" onClick={() => void open(null)} disabled={busy || diaryLoading}><ThemeIcon name="add" fallback={Plus} size={16} />{pageKey === 'builtin' ? t('diary.newDiary') : t('diary.newEntry')}</button>
          {calendar ? <div className="diary-card diary-cal-card">{calendar}</div> : null}
          {listError ? <p role="alert" className="diary-error diary-list-error">{listError}</p> : null}
          <div className="diary-card diary-list-card">
            {calendarOn ? <p className="diary-list-caption">{caption}</p> : null}
            {empty}
            {visible.length && !diaryLoading ? calendarOn
              ? <ul className="diary-entries" aria-label={t('diary.listLabel')}>{visible.map(entry => desktopRow(entry))}</ul>
              : <DiaryMonthGroups entries={visible} label={t('diary.listLabel')} row={desktopRow} /> : null}
          </div>
        </aside>
        <section className="diary-editor" aria-label="기록 작성 영역">
          {draft ? <>
            <div className="diary-card diary-toolbar">
              <DiaryDateButton className="diary-tb-date" value={draft.date} text={formatDisplayDate(locale, draft.date, 'full')} label={field('date')} disabled={busy || diaryLoading} onChange={date => edit({ date })} />
              {choiceChip('mood')}
              {choiceChip('weather')}
              <SaveStatus status={status} dirty={dirty} error={error} onRetry={() => void save()} />
              <button data-theme-slot="button" type="button" className="diary-icon-btn diary-star" aria-label={draft.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={Boolean(draft.isFavorite)} disabled={busy} onClick={() => edit({ isFavorite: !draft.isFavorite })}><ThemeIcon name="favorite" fallback={Star} size={19} fill={draft.isFavorite ? 'currentColor' : 'none'} strokeWidth={1.6} /></button>
              <button data-theme-slot="button" type="button" aria-label="기록 삭제" className="diary-icon-btn" disabled={busy} onClick={askDelete}><ThemeIcon name="delete" fallback={Trash2} size={18} strokeWidth={1.6} /></button>
            </div>
            <fieldset disabled={busy || diaryLoading} className="diary-card diary-write-card diary-writing-fields">
              <input data-theme-slot="input" ref={titleInput} aria-label={field('title')} className="diary-title-input" placeholder={field('title')} value={draft.title ?? ''} onChange={e => edit({ title: e.target.value })} onCompositionStart={composition.start} onCompositionEnd={composition.end} />
              <div className="diary-write-tags"><DiaryTags key={draft.id} tags={draft.tags} label={field('tags')} composing={composition} onChange={tags => edit({ tags })} /></div>
              <textarea data-theme-slot="input" aria-label={field('body')} className="diary-body-input" placeholder={field('body')} value={draft.body} onChange={e => edit({ body: e.target.value })} onCompositionStart={composition.start} onCompositionEnd={composition.end} />
              <footer className="diary-save-footer"><span>{t('diary.chars', { count: draft.body.length.toLocaleString() })}</span><div><span>{t('diary.writtenAt', { time: entryTime(locale, draft) })}</span>{dirty && <button data-theme-slot="button" type="button" className="btn btn-ghost" disabled={busy || diaryLoading} onClick={() => void save()}>{error ? '다시 저장' : '지금 저장'}</button>}</div></footer>
            </fieldset>
          </> : <div className="diary-card diary-editor-empty"><ThemeIcon name="diary" fallback={BookOpen} size={32} strokeWidth={1} /><h2>{t('diary.emptyTitle')}</h2><p>{t('diary.emptyBody')}<br />{t('diary.emptyHint')}</p><button data-theme-slot="button-secondary" type="button" className="btn btn-line" disabled={diaryLoading} onClick={() => void open(null)}><ThemeIcon name="add" fallback={Plus} size={14} />{t('diary.newEntry')}</button></div>}
          {editorError}
        </section>
      </div>
      {deleteDialog}
    </div>
  )
  function desktopRow(entry: DiaryEntry) {
    return <DiaryRow key={entry.id} entry={entry} current={draft?.id === entry.id} disabled={busy} onClick={() => void open(entry)} />
  }

  const page = phone ? phonePage : desktopPage
  if (!canvas) return page
  return <PageCanvas pageId="diary" editing={editing} blocks={resolveLayout('diary', pageLayouts.diary)} onChange={blocks => setPageLayout('diary', blocks)} render={block => block.type === 'page-body' ? <>{pageKey === 'builtin' && !editing && !(phone && showEditor) ? <PageTour page="diary" /> : null}{page}</> : null} />
}
