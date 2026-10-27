import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, BookOpen, CalendarDays, List, Check, LoaderCircle, Plus, Search, Star, Trash2 } from 'lucide-react'
import { PageCanvas } from '../../features/pages/PageCanvas.tsx'
import { resolveLayout } from '../../features/pages/layout.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import type { DiaryEntry } from '../../types/records.ts'
import { diaryTitle, readDiaryDraft, storeDiaryDraft, clearSavedDiaryDraft } from '../../services/diary/index.ts'
import { formatDisplayDate } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { todayISO } from '../../utils/date.ts'
import { DiaryCalendar } from './DiaryCalendar.tsx'
import './diary.css'

const MOODS = [
  ['happy', '😊', '기쁨'], ['good', '🙂', '좋음'], ['neutral', '😐', '보통'],
  ['sad', '😔', '우울'], ['angry', '😡', '화남'], ['tired', '😴', '피곤'], ['excited', '🥰', '설렘'],
] as const
const WEATHER = [
  ['sunny', '☀️', '맑음'], ['partly-cloudy', '🌤️', '구름 조금'], ['cloudy', '☁️', '흐림'],
  ['rain', '🌧️', '비'], ['snow', '🌨️', '눈'], ['wind', '🍃', '바람'],
] as const
const TABS = [{ id: 'records', label: '기록' }, { id: 'favorites', label: '즐겨찾기' }] as const
const emoji = (choices: readonly (readonly string[])[], value?: string) => choices.find(choice => choice[0] === value)?.[1]
function blankEntry(): DiaryEntry {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: '', body: '', date: todayISO(), tags: [], isFavorite: false, createdAt: now, updatedAt: now }
}
export function DiaryPage({ editing = false }: { editing?: boolean }) {
  const { user } = useSession()
  return <DiaryWorkspace key={user?.id ?? 'guest'} userId={user?.id ?? ''} editing={editing} />
}
function DiaryWorkspace({ userId, editing }: { userId: string; editing: boolean }) {
  const { t, locale } = useI18n()
  const { diaries, commitDiary, eraseDiary, diaryLoading, diaryError, settings, pageLayouts, setPageLayout } = useLibrary()
  const [tab, setTab] = useState<string>('records')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [month, setMonth] = useState(() => todayISO().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [favoriteError, setFavoriteError] = useState('')
  const [draft, setDraft] = useState<DiaryEntry | null>(() => readDiaryDraft(userId))
  const [dirty, setDirty] = useState(() => Boolean(readDiaryDraft(userId)))
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const deleting = useRef(false)
  const [tagsText, setTagsText] = useState(() => readDiaryDraft(userId)?.tags.join(', ') ?? '')
  const [showEditor, setShowEditor] = useState(() => Boolean(readDiaryDraft(userId)))
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
    try { storeDiaryDraft(userId, next) } catch { setError('임시 기록을 보관하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'); return }
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
          clearSavedDiaryDraft(userId, entry)
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
  }, [commitDiary, userId])
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
    storeDiaryDraft(userId, null)
    current.current = next
    revision.current += 1
    dirtyRef.current = false
    setDraft(next); setDirty(false); setTagsText(next.tags.join(', ')); setError('')
    setStatus(entry ? '저장됨' : '내용을 입력하면 저장됩니다')
    setShowEditor(true); setBusy(false)
    if (!entry) window.setTimeout(() => titleInput.current?.focus(), 0)
  }
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return diaries.filter(entry => (tab !== 'favorites' || entry.isFavorite) &&
      (!query || [diaryTitle(entry), entry.body, ...entry.tags].some(text => text.toLocaleLowerCase().includes(query))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [diaries, search, tab])
  const visible = useMemo(() => view === 'calendar' ? filtered.filter(entry => selectedDate ? entry.date === selectedDate : entry.date.startsWith(month)) : filtered, [filtered, view, selectedDate, month])
  const toggleListFavorite = async (entry: DiaryEntry) => {
    if (busy) return
    setBusy(true); setFavoriteError('')
    try {
      if (current.current?.id === entry.id) {
        edit({ isFavorite: !current.current.isFavorite })
        if (!await save()) throw new Error('즐겨찾기를 저장하지 못했습니다. 다시 시도해 주세요.')
      } else {
        if (!await save()) throw new Error('작성 중인 기록을 먼저 저장해 주세요.')
        await commitDiary({ ...entry, isFavorite: !entry.isFavorite })
      }
    } catch (e) { setFavoriteError(e instanceof Error ? e.message : '즐겨찾기를 저장하지 못했습니다.') }
    finally { setBusy(false) }
  }
  const changeView = () => {
    setView(previous => previous === 'list' ? 'calendar' : 'list')
    setShowEditor(false)
  }
  const remove = async () => {
    if (!draft) return
    deleting.current = true
    setBusy(true)
    try {
      if (pending.current) await pending.current
      const id = draft.id
      if (persisted.current.has(id)) await eraseDiary(id)
      storeDiaryDraft(userId, null)
      revision.current += 1; dirtyRef.current = false; current.current = null
      setDraft(null); setDirty(false); setShowEditor(false); setStatus(''); setError('')
      dialog.current?.close()
    } catch (e) { setError(e instanceof Error ? e.message : '삭제하지 못했습니다.') }
    finally { deleting.current = false; setBusy(false) }
  }

  return <PageCanvas pageId="diary" editing={editing} blocks={resolveLayout('diary', pageLayouts.diary)} onChange={blocks => setPageLayout('diary', blocks)} render={block => block.type === 'page-body' ? (
    <div className="diary-page">
      <header data-theme-slot="page-header" className="diary-heading"><div><h1>Diary</h1><p>지나가는 하루, 남겨두고 싶은 생각.</p></div><button type="button" data-theme-slot="button-secondary" className="diary-view-toggle" aria-label={view === 'list' ? '달력으로 보기' : '목록으로 보기'} aria-pressed={view === 'calendar'} onClick={changeView}><ThemeIcon name={view === 'list' ? 'calendar' : 'diary'} fallback={view === 'list' ? CalendarDays : List} size={17} strokeWidth={1.5} /><span>{view === 'list' ? '달력 보기' : '목록 보기'}</span></button></header>
      {diaryError && <p role="alert" className="diary-error">기록 연결 오류: {diaryError} <button data-theme-slot="button-secondary" type="button" className="btn btn-line" onClick={() => window.location.reload()}>다시 불러오기</button></p>}
      <div data-theme-slot="diary-page" className={'diary-workspace' + (showEditor ? ' diary-editor-open' : '')}>
        <aside data-theme-slot="diary-list" className="diary-list" aria-label="기록 목록">
          <div className="diary-tabs" aria-label="기록 필터">{TABS.map(item => <button data-theme-slot="button" key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={tab === item.id ? 'tab tab-on' : 'tab'}>{item.label}</button>)}</div>
          <div className="diary-list-tools"><label className="diary-search"><ThemeIcon name="search" fallback={Search} size={15} aria-hidden="true" /><input data-theme-slot="input" aria-label="기록 검색" placeholder="기록 검색…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button data-theme-slot="button" type="button" aria-label="검색 지우기" onClick={() => setSearch('')}>×</button>}</label>
          <button data-theme-slot="button-primary" type="button" className="btn btn-primary diary-new" onClick={() => void open(null)} disabled={busy || diaryLoading}><ThemeIcon name="add" fallback={Plus} size={15} />새 기록</button></div>
          {view === 'calendar' && <DiaryCalendar month={month} selectedDate={selectedDate} entries={filtered} weekStartsOn={settings.weekStartsOn} disabled={busy || diaryLoading} onMonth={next => { setMonth(next); setSelectedDate(null) }} onSelect={setSelectedDate} />}
          {favoriteError && <p role="alert" className="diary-error diary-list-error">{favoriteError}</p>}
          <div className="diary-list-caption"><span>{visible.length}개의 기록</span><span>{view === 'calendar' ? selectedDate ? selectedDate.replaceAll('-', '.') : month.replace('-', '.') : '최신 기록 순'}</span></div>
          {diaryLoading ? <p className="diary-list-empty" role="status">기록을 불러오는 중…</p> : visible.length === 0 ? <p className="diary-list-empty">{search ? '검색 결과가 없습니다.' : tab === 'favorites' ? '마음에 남는 기록에 별을 눌러보세요.' : view === 'calendar' ? '이 날짜에는 아직 기록이 없어요.' : '작은 생각부터 기록해보세요.'}</p> : <ul className="diary-entries">{visible.map(entry => <li key={entry.id}><div className="diary-entry-row"><button type="button" disabled={busy} onClick={() => void open(entry)} aria-current={draft?.id === entry.id ? 'true' : undefined} data-theme-slot="diary-entry" className="diary-entry"><div className="diary-entry-title"><span>{diaryTitle(entry)}</span></div><p className="diary-entry-date">{entry.date.replaceAll('-', '.')} · {new Date(entry.createdAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}</p><p className="diary-entry-preview">{entry.body || '제목만 작성된 기록'}</p><div className="diary-entry-meta"><span>{emoji(MOODS, entry.mood)} {emoji(WEATHER, entry.weather)}</span><span>{entry.tags.slice(0, 2).map(tag => '#' + tag).join(' ')}</span></div></button><button type="button" className="diary-list-star" data-theme-slot="button" disabled={busy || diaryLoading} aria-label={(entry.isFavorite ? '기록 즐겨찾기 해제: ' : '기록 즐겨찾기 추가: ') + diaryTitle(entry)} aria-pressed={Boolean(entry.isFavorite)} onClick={() => void toggleListFavorite(entry)}><ThemeIcon name="favorite" fallback={Star} size={15} strokeWidth={1.5} fill={entry.isFavorite ? 'currentColor' : 'none'} /></button></div></li>)}</ul>}
        </aside>
        <section className="diary-editor" aria-label="기록 작성 영역">
          {draft ? <>
            <div className="diary-editor-top"><button data-theme-slot="button" type="button" className="btn btn-ghost diary-back" onClick={async () => { if (await save()) setShowEditor(false) }}><ArrowLeft size={15} />목록</button><div className="diary-editor-actions"><button data-theme-slot="button" type="button" className="icon-btn diary-star" aria-label={draft.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={Boolean(draft.isFavorite)} disabled={busy} onClick={() => edit({ isFavorite: !draft.isFavorite })}><ThemeIcon name="favorite" fallback={Star} size={18} fill={draft.isFavorite ? 'currentColor' : 'none'} strokeWidth={1.5} /></button><button data-theme-slot="button" type="button" aria-label="기록 삭제" className="icon-btn" disabled={busy} onClick={() => { setDialogOpen(true); dialog.current?.showModal() }}><ThemeIcon name="delete" fallback={Trash2} size={16} strokeWidth={1.5} /></button></div></div>
            <fieldset disabled={busy || diaryLoading} className="diary-writing-fields">
              <p className="diary-date-heading">{formatDisplayDate(locale, draft.date, 'full')}</p><label className="diary-date-input">기록 날짜 <input data-theme-slot="input" type="date" aria-label="기록 날짜" value={draft.date} onChange={e => { if (e.target.value) edit({ date: e.target.value }) }} /></label>
              <input data-theme-slot="input" ref={titleInput} aria-label="기록 제목" className="diary-title-input" placeholder="제목을 입력하세요" value={draft.title ?? ''} onChange={e => edit({ title: e.target.value })} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; void save() }} />
              <div className="diary-feelings">{[{ label: t('diary.mood'), choices: MOODS, field: 'mood' as const }, { label: t('diary.weather'), choices: WEATHER, field: 'weather' as const }].map(group => <fieldset key={group.field} className="diary-choices"><legend>{group.label}</legend><div>{group.choices.map(([value, icon, label]) => <button data-theme-slot="button" key={value} type="button" title={label} aria-label={label} aria-pressed={draft[group.field] === value} className={'diary-choice' + (draft[group.field] === value ? ' diary-choice-on' : '')} onClick={() => edit({ [group.field]: draft[group.field] === value ? undefined : value })}>{icon}</button>)}</div></fieldset>)}</div>
              <label className="diary-tags"><span className="diary-tags-label">태그</span><span className="diary-tags-field"><input data-theme-slot="input" aria-label="기록 태그" placeholder="#학교, #데이트, #프로젝트" value={tagsText} onChange={e => { setTagsText(e.target.value); edit({ tags: [...new Set(e.target.value.split(/[,#]+/).map(tag => tag.trim()).filter(Boolean))] }) }} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; void save() }} /></span></label>
              <textarea data-theme-slot="input" aria-label="기록 본문" className="diary-body-input" placeholder="오늘 있었던 일이나 생각을 자유롭게 기록해보세요." value={draft.body} onChange={e => edit({ body: e.target.value })} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false; void save() }} />
            </fieldset>
            <footer className="diary-save-footer"><span>{draft.body.length.toLocaleString()}자</span><div><span role="status">{status === '저장 중…' ? <LoaderCircle size={12} className="animate-spin" /> : !dirty && status === '저장됨' ? <Check size={12} /> : null}{status}</span>{dirty && <button data-theme-slot="button" type="button" className="btn btn-ghost" disabled={busy || diaryLoading} onClick={() => void save()}>{error ? '다시 저장' : '지금 저장'}</button>}</div></footer>
          </> : <div className="diary-editor-empty"><ThemeIcon name="diary" fallback={BookOpen} size={32} strokeWidth={1} /><h2>{t('diary.emptyTitle')}</h2><p>{t('diary.emptyBody')}<br />{t('diary.emptyHint')}</p><button data-theme-slot="button-secondary" type="button" className="btn btn-line" disabled={diaryLoading} onClick={() => void open(null)}><ThemeIcon name="add" fallback={Plus} size={14} />{t('diary.newEntry')}</button></div>}
          {error && <p className="diary-error" role="alert">{error} 입력한 내용은 임시 보관되어 있습니다.</p>}
        </section>
      </div>
      <dialog data-theme-slot="modal" ref={dialog} className="diary-delete-dialog" onClose={() => setDialogOpen(false)} onCancel={event => { if (busy) event.preventDefault() }}><h2>이 기록을 삭제하시겠습니까?</h2><p>휴지통으로 이동하며, 거기서 복구할 수 있습니다.</p><div><button data-theme-slot="button-secondary" type="button" autoFocus className="btn btn-line" disabled={busy} onClick={() => dialog.current?.close()}>취소</button><button data-theme-slot="button-primary" type="button" className="btn btn-primary" disabled={busy} onClick={() => void remove()}>{busy ? '삭제 중…' : '삭제'}</button></div>{error && <p role="alert">{error}</p>}</dialog>
    </div>
  ) : null} />
}
