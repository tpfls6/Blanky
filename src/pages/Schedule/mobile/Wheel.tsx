import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useI18n } from '../../../i18n/useI18n.ts'

/** Row height of a wheel; the middle (selected) row sits 80px from the top of a 200px column. */
const ITEM = 40

/**
 * One scroll-snap column. Scrolling settles on a row after a short pause and reports it;
 * a tap scrolls that row into the middle, and arrow keys step one row.
 */
export function WheelColumn({ options, index, onChange, label }: {
  options: { key: string | number; label: ReactNode }[]
  index: number
  onChange: (index: number) => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const latest = useRef({ index, onChange, count: options.length })
  const id = useId()
  useEffect(() => { latest.current = { index, onChange, count: options.length } })
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // Follows the value from outside (another column, a quick button) without fighting a scroll in progress.
  useLayoutEffect(() => {
    const element = ref.current
    if (element && Math.round(element.scrollTop / ITEM) !== index) element.scrollTop = index * ITEM
  }, [index, options.length])

  const settle = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const element = ref.current
      if (!element) return
      const { index: current, onChange: report, count } = latest.current
      const next = Math.max(0, Math.min(count - 1, Math.round(element.scrollTop / ITEM)))
      if (next !== current) report(next)
    }, 90)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = Math.max(0, Math.min(options.length - 1, index + step))
    if (next !== index) onChange(next)
  }
  return (
    <div ref={ref} className="mcal-wcol mcal-noscroll" role="listbox" tabIndex={0} aria-label={label}
      aria-activedescendant={`${id}-${index}`} onScroll={settle} onKeyDown={onKeyDown}>
      <div className="mcal-wpad" aria-hidden="true" />
      {options.map((option, at) => (
        <div key={option.key} id={`${id}-${at}`} role="option" aria-selected={at === index} className="mcal-wi"
          onClick={() => ref.current?.scrollTo({ top: at * ITEM, behavior: 'smooth' })}>{option.label}</div>
      ))}
      <div className="mcal-wpad" aria-hidden="true" />
    </div>
  )
}

const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate()

/**
 * Year · month · day wheels, plus AM/PM · hour · 5-minute wheels in `datetime` mode.
 * Reports a new Date for every settled column; a day past the month's end is clamped.
 */
export function DateWheel({ value, mode, onChange, yearUnit = false }: {
  value: Date
  mode: 'date' | 'datetime'
  onChange: (next: Date) => void
  /** Shows "2026년" instead of "2026" (the roomier header picker). */
  yearUnit?: boolean
}) {
  const { t } = useI18n()
  const base = new Date().getFullYear()
  const from = Math.min(base, value.getFullYear()) - 10
  const years = Array.from({ length: Math.max(base, value.getFullYear()) + 10 - from + 1 }, (_, index) => from + index)
  const year = value.getFullYear(), month = value.getMonth(), day = value.getDate()
  const hours = value.getHours(), minutes = value.getMinutes()
  const emit = (next: { year?: number; month?: number; day?: number; hours?: number; minutes?: number }) => {
    const y = next.year ?? year, m = next.month ?? month
    const d = Math.min(next.day ?? day, daysIn(y, m))
    onChange(new Date(y, m, d, next.hours ?? hours, next.minutes ?? minutes))
  }
  const weekday = (d: number) => t(`schedule.mobile.dow.${new Date(year, month, d).getDay()}`)
  return (
    <div className="mcal-wheels" style={{ gridTemplateColumns: mode === 'datetime' ? '1.05fr .85fr 1.25fr .9fr .55fr .65fr' : '1.2fr 1fr 1.3fr' }}>
      <WheelColumn label={t('schedule.mobile.wheelYear')} index={years.indexOf(year)} onChange={index => emit({ year: years[index] })}
        options={years.map(value => ({ key: value, label: yearUnit ? t('schedule.mobile.yearValue', { value }) : value }))} />
      <WheelColumn label={t('schedule.mobile.wheelMonth')} index={month} onChange={index => emit({ month: index })}
        options={Array.from({ length: 12 }, (_, index) => ({ key: index, label: t('schedule.mobile.monthValue', { value: index + 1 }) }))} />
      <WheelColumn label={t('schedule.mobile.wheelDay')} index={day - 1} onChange={index => emit({ day: index + 1 })}
        options={Array.from({ length: daysIn(year, month) }, (_, index) => ({ key: index, label: <>{t('schedule.mobile.dayValue', { value: index + 1 })}<em>{weekday(index + 1)}</em></> }))} />
      {mode === 'datetime' ? <>
        <WheelColumn label={t('schedule.mobile.wheelMeridiem')} index={hours >= 12 ? 1 : 0} onChange={index => emit({ hours: hours % 12 + index * 12 })}
          options={[{ key: 0, label: t('schedule.mobile.am') }, { key: 1, label: t('schedule.mobile.pm') }]} />
        <WheelColumn label={t('schedule.mobile.wheelHour')} index={hours % 12} onChange={index => emit({ hours: index + (hours >= 12 ? 12 : 0) })}
          options={Array.from({ length: 12 }, (_, index) => ({ key: index, label: index || 12 }))} />
        <WheelColumn label={t('schedule.mobile.wheelMinute')} index={Math.floor(minutes / 5)} onChange={index => emit({ minutes: index * 5 })}
          options={Array.from({ length: 12 }, (_, index) => ({ key: index, label: String(index * 5).padStart(2, '0') }))} />
      </> : null}
    </div>
  )
}
