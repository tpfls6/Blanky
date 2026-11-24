import { ArrowLeft, CalendarDays, Check, EllipsisVertical, LoaderCircle, Share2, Star, Trash2 } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { showStatusToast } from '../../components/layout/statusToast.ts'
import { diaryTitle } from '../../services/diary/index.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import type { DiaryEntry } from '../../types/records.ts'
import { useBackLayer } from '../Schedule/mobile/layers.ts'
import { Sheet } from '../Schedule/mobile/Sheet.tsx'
import { shareMemos } from '../Memo/memoShare.ts'
import '../Schedule/mobile/mobileCalendar.css'
import '../Memo/memo.css'
import { ChoiceGrid, DiaryDateButton, DiaryTags } from './DiaryRows.tsx'
import { DiaryDatePicker } from './DiaryCalendar.tsx'
import { MOODS, WEATHER, choiceOf, entryTime, longDay } from './diaryChoices.ts'

/**
 * Phone diary editor (<768px): ← · date ▾ · ☆ · ⋮ (share / change date / delete) in the top bar,
 * then a chip row (mood · weather · tags · save status), the title and the body.
 * Saving stays with DiaryWorkspace (autosave, recovery draft); this only lays the fields out.
 */
export function DiaryPhoneEditor({ draft, entries, weekStartsOn, field, status, dirty, error, disabled, appBar, backToList, titleRef, composing, edit, onBack, onSave, onDelete }: {
  draft: DiaryEntry
  /** All entries, for the date picker's mood emoji. */
  entries: DiaryEntry[]
  weekStartsOn: 0 | 1
  field: (key: string) => string
  status: string
  dirty: boolean
  error: string
  disabled: boolean
  /** On /diary MobileTopBar is hidden, so this bar takes the top edge. */
  appBar: boolean
  /** The system Back returns to the list; off for an entry opened from elsewhere (Home 보기). */
  backToList: boolean
  titleRef: RefObject<HTMLInputElement | null>
  composing: { start: () => void; end: () => void }
  edit: (patch: Partial<DiaryEntry>) => void
  onBack: () => void
  onSave: () => void
  onDelete: () => void
}) {
  const { t, locale } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [sheet, setSheet] = useState<'mood' | 'weather' | 'date' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  // The control that opened the sheet (date button, chip, or ⋮ for the menu's 날짜 바꾸기) gets focus back when it closes.
  const sheetReturn = useRef<HTMLElement | null>(null)
  const menuId = useId()
  const mood = choiceOf(MOODS, draft.mood), weather = choiceOf(WEATHER, draft.weather)

  useBackLayer(backToList, onBack)
  useBackLayer(menuOpen, () => setMenuOpen(false))
  useLayoutEffect(() => { rootRef.current?.closest('main')?.scrollTo({ top: 0 }) }, [])
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

  const openSheet = (kind: 'mood' | 'weather' | 'date', from: HTMLElement | null) => { sheetReturn.current = from; setSheet(kind) }
  // Esc, system Back, the scrim or a pick. Runs a frame later, after the Sheet's own focus restore;
  // an editor that is closing unmounts the sheet without calling this.
  const closeSheet = () => {
    setSheet(null)
    const from = sheetReturn.current
    requestAnimationFrame(() => { if (from?.isConnected) from.focus({ preventScroll: true }) })
  }
  const share = async () => {
    setMenuOpen(false)
    const result = await shareMemos([{ title: diaryTitle(draft), body: draft.body }])
    if (result === 'copied') showStatusToast({ text: t('diary.copied'), tone: 'saved' })
    if (result === 'failed') showStatusToast({ text: t('diary.shareFailed'), tone: 'failed' })
  }
  const chip = (key: 'mood' | 'weather', choice: ReturnType<typeof choiceOf>) => (
    <button type="button" className={choice ? 'diary-chip' : 'diary-chip diary-chip-ghost'} aria-haspopup="dialog" onClick={event => openSheet(key, event.currentTarget)}
      aria-label={choice ? `${field(key)}: ${choice[2]}` : field(key)}>
      {choice ? `${choice[1]} ${choice[2]}` : `＋ ${field(key)}`}
    </button>
  )

  return (
    <div ref={rootRef} className="diary-pe" data-app-bar={appBar ? '' : undefined}>
      <div className="diary-pe-top">
        <button type="button" className="memo-phone-icon diary-back" aria-label={t('diary.back')} onClick={onBack}>
          <ArrowLeft size={22} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <span className="diary-date-field"><DiaryDateButton className="diary-pe-date" text={longDay(locale, draft.date)} open={sheet === 'date'} disabled={disabled} onToggle={button => openSheet('date', button)} /></span>
        <button type="button" className="memo-phone-icon diary-star" aria-label={draft.isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} aria-pressed={Boolean(draft.isFavorite)} disabled={disabled} onClick={() => edit({ isFavorite: !draft.isFavorite })}>
          <ThemeIcon name="favorite" fallback={Star} size={22} strokeWidth={1.7} fill={draft.isFavorite ? 'currentColor' : 'none'} />
        </button>
        <button ref={moreRef} type="button" className="memo-phone-icon" aria-label={t('diary.more')} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen(open => !open)}>
          <EllipsisVertical size={22} strokeWidth={1.7} aria-hidden="true" />
        </button>
        {menuOpen ? <>
          <div className="memo-pe-menu-dim" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <div ref={menuRef} id={menuId} className="memo-pe-menu" role="menu" aria-label={t('diary.entryActions')}>
            <button type="button" role="menuitem" onClick={() => void share()}>
              <Share2 size={18} strokeWidth={1.6} aria-hidden="true" />{t('diary.share')}
            </button>
            <button type="button" role="menuitem" disabled={disabled} onClick={() => { setMenuOpen(false); openSheet('date', moreRef.current) }}>
              <CalendarDays size={18} strokeWidth={1.6} aria-hidden="true" />{t('diary.changeDate')}
            </button>
            <button type="button" role="menuitem" className="memo-pe-danger" disabled={disabled} onClick={() => { setMenuOpen(false); onDelete() }}>
              <ThemeIcon name="delete" fallback={Trash2} size={18} strokeWidth={1.6} aria-hidden="true" />{t('diary.delete')}
            </button>
          </div>
        </> : null}
      </div>
      <fieldset disabled={disabled} className="diary-writing-fields">
        <div className="diary-pe-chips">
          {chip('mood', mood)}
          {chip('weather', weather)}
          <DiaryTags tags={draft.tags} label={field('tags')} composing={composing} onChange={tags => edit({ tags })} />
          <SaveStatus status={status} dirty={dirty} error={error} onRetry={onSave} />
        </div>
        <input data-theme-slot="input" ref={titleRef} aria-label={field('title')} className="diary-title-input" placeholder={field('title')} value={draft.title ?? ''}
          onChange={e => edit({ title: e.target.value })} onCompositionStart={composing.start} onCompositionEnd={composing.end} />
        <textarea data-theme-slot="input" aria-label={field('body')} className="diary-body-input" placeholder={field('body')} value={draft.body}
          onChange={e => edit({ body: e.target.value })} onCompositionStart={composing.start} onCompositionEnd={composing.end} />
      </fieldset>
      <footer className="diary-pe-foot"><span>{t('diary.chars', { count: draft.body.length.toLocaleString() })}</span><span>{t('diary.writtenAt', { time: entryTime(locale, draft) })}</span></footer>
      {sheet === 'date' ? <Sheet title={field('date')} onClose={closeSheet}>
        <DiaryDatePicker value={draft.date} entries={entries} weekStartsOn={weekStartsOn} onPick={date => { edit({ date }); closeSheet() }} onClose={closeSheet} />
      </Sheet> : sheet ? <Sheet title={field(sheet)} onClose={closeSheet}>
        <ChoiceGrid choices={sheet === 'mood' ? MOODS : WEATHER} value={draft[sheet]} onPick={value => { edit({ [sheet]: value }); closeSheet() }} />
      </Sheet> : null}
    </div>
  )
}

/** "저장 중… / ✓ 저장됨 / 저장 실패" with a retry (desktop toolbar and phone chip row). */
export function SaveStatus({ status, dirty, error, onRetry }: { status: string; dirty: boolean; error: string; onRetry: () => void }) {
  const { t } = useI18n()
  return <span className="diary-save-status-wrap">
    <span className="diary-save-status" role="status" data-state={error ? 'failed' : undefined}>
      {status === '저장 중…' ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : !dirty && status === '저장됨' ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : null}{status}
    </span>
    {error && dirty ? <button type="button" className="memo-pe-retry" onClick={onRetry}>{t('diary.retry')}</button> : null}
  </span>
}
