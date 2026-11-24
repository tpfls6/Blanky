import { Check, ChevronDown, Star, X } from 'lucide-react'
import { useState, type PointerEventHandler, type ReactNode, type Ref } from 'react'
import type { DiaryEntry } from '../../types/records.ts'
import { diaryTitle } from '../../services/diary/index.ts'
import { formatMonthTitle } from '../../i18n/format.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { todayISO } from '../../utils/date.ts'
import { MOODS, WEATHER, choiceOf, entryTime, noon, weekdayShort, type Choices } from './diaryChoices.ts'

/** One diary row: date block · title (+ star) · one-line preview · time / weather / tags · mood emoji. */
export function DiaryRow({ entry, current, picking, picked, disabled, onClick, press }: {
  entry: DiaryEntry
  current?: boolean
  picking?: boolean
  picked?: boolean
  disabled?: boolean
  onClick: () => void
  /** Long-press handlers (phone selection). */
  press?: { onPointerDown: PointerEventHandler; onPointerMove: PointerEventHandler; onPointerUp: () => void; onPointerCancel: () => void; onPointerLeave: () => void }
}) {
  const { t, locale } = useI18n()
  const mood = choiceOf(MOODS, entry.mood), weather = choiceOf(WEATHER, entry.weather)
  const day = noon(entry.date)
  return (
    <li className="diary-row" data-picked={picked ? '' : undefined} data-entry-id={entry.id}>
      <button type="button" data-theme-slot="diary-entry" className="diary-entry" disabled={disabled} onClick={onClick}
        aria-current={current ? 'true' : undefined} aria-pressed={picking ? Boolean(picked) : undefined}
        onContextMenu={press ? event => event.preventDefault() : undefined} {...press}>
        {picking ? <span className="memo-phone-check" aria-hidden="true">{picked ? <Check size={14} strokeWidth={3} /> : null}</span> : null}
        <span className={'diary-day' + (entry.date === todayISO() ? ' diary-day-today' : '')} aria-hidden="true">
          <b>{day.getDate()}</b><small className={day.getDay() === 0 ? 'cal-holiday' : undefined}>{weekdayShort(locale, entry.date)}</small>
        </span>
        <span className="diary-entry-body">
          <span className="diary-entry-title">
            <span>{diaryTitle(entry)}</span>
            {entry.isFavorite ? <><Star size={14} aria-hidden="true" className="memo-phone-star" /><span className="sr-only">{t('diary.favorites')}</span></> : null}
          </span>
          <span className="diary-entry-preview">{entry.body || '제목만 작성된 기록'}</span>
          <span className="diary-entry-meta">
            <span>{entryTime(locale, entry)}</span>
            {weather ? <span>{weather[1]} {weather[2]}</span> : null}
            {entry.tags.length ? <span>{entry.tags.map(tag => '#' + tag).join(' ')}</span> : null}
          </span>
        </span>
        {mood ? <span className="diary-entry-mood" title={mood[2]}>{mood[1]}<span className="sr-only">{mood[2]}</span></span> : null}
      </button>
    </li>
  )
}

/** Rows under "2026년 11월 · N개" month headers (entries come sorted newest first). */
export function DiaryMonthGroups({ entries, label, row }: { entries: DiaryEntry[]; label: string; row: (entry: DiaryEntry) => ReactNode }) {
  const { t, locale } = useI18n()
  const groups: [string, DiaryEntry[]][] = []
  for (const entry of entries) {
    const key = entry.date.slice(0, 7), last = groups.at(-1)
    if (last?.[0] === key) last[1].push(entry)
    else groups.push([key, [entry]])
  }
  return <div className="diary-entries" aria-label={label}>{groups.map(([key, rows]) => (
    <section key={key} className="diary-month">
      <h2 className="diary-month-head"><span>{formatMonthTitle(locale, noon(key + '-01'))}</span><small>{t('diary.count', { count: rows.length })}</small></h2>
      <ul>{rows.map(row)}</ul>
    </section>
  ))}</div>
}

/** The date as a button that opens the in-app date picker (DiaryDatePicker in a sheet or popover). */
export function DiaryDateButton({ text, className, open, onToggle, disabled, buttonRef }: {
  text: string; className: string; open: boolean
  /** Gets the button, so the picker can hand focus back to it when it closes. */
  onToggle: (button: HTMLButtonElement) => void; disabled?: boolean
  /** Lets a menu item ("날짜 바꾸기") open the same picker. */
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const { t } = useI18n()
  return (
    <button ref={buttonRef} type="button" className={className} disabled={disabled} aria-label={t('diary.dateButton', { date: text })} aria-haspopup="dialog" aria-expanded={open} onClick={event => onToggle(event.currentTarget)}>
      <span>{text}</span><ChevronDown size={16} strokeWidth={1.7} aria-hidden="true" />
    </button>
  )
}

/** Mood or weather grid; tapping the chosen one again clears it. */
export function ChoiceGrid({ choices, value, onPick }: { choices: Choices; value?: string; onPick: (value: string | undefined) => void }) {
  return <div className="diary-pick">{choices.map(([key, icon, name]) => (
    <button key={key} type="button" data-theme-slot="button" aria-label={name} aria-pressed={value === key} className="diary-pick-option" onClick={() => onPick(value === key ? undefined : key)}>
      <b aria-hidden="true">{icon}</b><span aria-hidden="true">{name}</span>
    </button>
  ))}</div>
}

/** #tag chips (× removes) and a "＋ 태그" chip that turns into an input; Enter, a comma or leaving the field adds. */
export function DiaryTags({ tags, label, onChange, composing }: {
  tags: string[]; label: string; onChange: (tags: string[]) => void
  composing: { start: () => void; end: () => void }
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const commit = (value: string) => {
    const next = [...new Set([...tags, ...value.split(/[,#]+/).map(tag => tag.trim()).filter(Boolean)])]
    if (next.length !== tags.length) onChange(next)
    setText('')
  }
  return (
    <span className="diary-tags">
      {tags.map(tag => <span key={tag} className="diary-tag">#{tag}
        <button type="button" aria-label={t('diary.removeTag', { tag })} onClick={() => onChange(tags.filter(item => item !== tag))}><X size={12} strokeWidth={2} aria-hidden="true" /></button>
      </span>)}
      {adding
        ? <input data-theme-slot="input" autoFocus className="diary-tag-input" aria-label={label} placeholder={t('diary.tagPlaceholder')} value={text} enterKeyHint="done"
          onChange={event => { const value = event.target.value; if (value.endsWith(',')) commit(value); else setText(value) }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); commit(text) }
            if (event.key === 'Escape') { setText(''); setAdding(false) }
          }}
          onBlur={() => { commit(text); setAdding(false) }}
          onCompositionStart={composing.start} onCompositionEnd={composing.end} />
        : <button type="button" className="diary-chip diary-chip-ghost" onClick={() => setAdding(true)}>＋ {label}</button>}
    </span>
  )
}
