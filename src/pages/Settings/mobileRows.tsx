import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n.ts'
import { Sheet } from '../Schedule/mobile/Sheet.tsx'
import { WheelColumn } from '../Schedule/mobile/Wheel.tsx'
import '../Schedule/mobile/mobileCalendar.css'
import '../More/more.css'

/** Phone settings (below lg): the More look — labelled 16px cards of 54px rows, segments on the right, sheets for long input. */

export function MLabel({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return <h2 className="more-label" id={id}>{children}{aside ? <small>{aside}</small> : null}</h2>
}

export function MHint({ children }: { children: ReactNode }) {
  return <p className="more-hint">{children}</p>
}

export function MCard({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="more-card" role={label ? 'group' : undefined} aria-label={label}>{children}</div>
}

/** One row: optional icon tile, title with hint, value, chevron. Pressable when `onPress` is set. */
export function MRow({ icon, label, hint, value, accent, danger, chevron, onPress, children, ...rest }: {
  icon?: ReactNode
  label: ReactNode
  hint?: ReactNode
  value?: ReactNode
  accent?: boolean
  danger?: boolean
  chevron?: boolean
  onPress?: () => void
  /** Trailing control (segment, switch) shown instead of a value. */
  children?: ReactNode
  'data-settings-row'?: string
}) {
  const body = (
    <>
      {icon ? <span className="more-ri">{icon}</span> : null}
      <span className="more-rt">{label}{hint ? <small>{hint}</small> : null}</span>
      {value !== undefined && value !== null && value !== '' ? <span className={accent ? 'more-rv more-rv-on' : 'more-rv'}>{value}</span> : null}
      {children}
      {chevron ?? Boolean(onPress && !danger) ? <ChevronRight className="more-chev" size={16} strokeWidth={1.5} aria-hidden="true" /> : null}
    </>
  )
  const className = `more-row${icon ? ' more-row-ic' : ''}${danger ? ' more-row-danger' : ''}`
  return onPress
    ? <button type="button" className={className} onClick={onPress} {...rest}>{body}</button>
    : <div className={className} {...rest}>{body}</div>
}

/** Short choices on the right of a row. */
export function MSeg<T extends string | number>({ label, value, options, onPick }: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onPick: (value: T) => void
}) {
  return (
    <span className="more-seg" role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={String(option)} type="button" role="radio" aria-checked={option === value} onClick={() => onPick(option)}>{text}</button>
      ))}
    </span>
  )
}

/** A whole row that toggles; reuses the app's `.switch` look. */
export function MSwitch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="more-row" onClick={onChange} disabled={disabled}>
      <span className="more-rt">{label}{hint ? <small>{hint}</small> : null}</span>
      <span className={checked ? 'switch switch-on' : 'switch'} aria-hidden="true" />
    </button>
  )
}

/** Block inside a card for content that is not a single row (theme previews, swatches, day toggles). */
export function MBlock({ title, aside, children }: { title?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="more-blk">
      {title ? <div className="more-blk-title">{title}{aside ? <small>{aside}</small> : null}</div> : null}
      {children}
    </div>
  )
}

/** Bottom sheet for long input; reuses the phone calendar sheet. `onSave` adds Cancel / Save buttons. */
export function MSheet({ title, onClose, onSave, saveLabel, busy, children }: {
  title: string
  onClose: () => void
  onSave?: () => void
  saveLabel?: string
  busy?: boolean
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="more-sheet-body" data-settings-sheet>
        {children}
        {onSave ? (
          <div className="more-sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>{saveLabel ?? t('save')}</button>
          </div>
        ) : null}
      </div>
    </Sheet>
  )
}

const pad = (value: number) => String(value).padStart(2, '0')

/** AM/PM · hour · minute wheels (the schedule editor's columns) for an "HH:MM" value; minutes step by 1 like the old time inputs. */
export function TimeWheel({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useI18n()
  const [h = 0, m = 0] = value.split(':').map(Number)
  const emit = (hours: number, minutes: number) => onChange(`${pad(hours)}:${pad(minutes)}`)
  return (
    <div className="mcal-wheels" style={{ gridTemplateColumns: '.8fr 1fr 1fr' }}>
      <WheelColumn label={t('schedule.mobile.wheelMeridiem')} index={h >= 12 ? 1 : 0} onChange={(index) => emit(h % 12 + index * 12, m)}
        options={[{ key: 0, label: t('schedule.mobile.am') }, { key: 1, label: t('schedule.mobile.pm') }]} />
      <WheelColumn label={t('schedule.mobile.wheelHour')} index={h % 12} onChange={(index) => emit(index + (h >= 12 ? 12 : 0), m)}
        options={Array.from({ length: 12 }, (_, index) => ({ key: index, label: index || 12 }))} />
      <WheelColumn label={t('schedule.mobile.wheelMinute')} index={m} onChange={(index) => emit(h, index)}
        options={Array.from({ length: 60 }, (_, index) => ({ key: index, label: pad(index) }))} />
    </div>
  )
}

/** A time row inside a sheet; the open row shows the wheel under it. An unset value starts the wheel at `fallback`. */
export function MTimeField({ label, value, fallback = '09:00', open, onToggle, onChange, emptyLabel }: {
  label: string
  value: string | null
  fallback?: string
  open: boolean
  onToggle: () => void
  onChange: (next: string) => void
  emptyLabel?: string
}) {
  return (
    <div className="more-time" data-open={open ? '' : undefined}>
      <button type="button" className="more-time-row" aria-expanded={open} onClick={() => { if (!open && !value) onChange(fallback); onToggle() }} data-time-field={label}>
        <span>{label}</span>
        <strong>{value || emptyLabel || '--:--'}</strong>
      </button>
      {open ? <TimeWheel value={value || fallback} onChange={onChange} /> : null}
    </div>
  )
}
