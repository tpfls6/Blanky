import { ChevronLeft, Search } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { colorOf } from '../../../components/schedule/calendarRows.ts'
import { useI18n } from '../../../i18n/useI18n.ts'
import type { WorkItem, WorkspaceCategory } from '../../../types/work.ts'
import { parseISODate } from '../../../utils/date.ts'

/** Marks every match of `query` in `text`. */
function highlight(text: string, query: string): ReactNode {
  const lower = text.toLocaleLowerCase('ko'), needle = query.toLocaleLowerCase('ko')
  const parts: ReactNode[] = []
  let from = 0
  for (let at = lower.indexOf(needle); at >= 0 && needle; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at}>{text.slice(at, at + needle.length)}</mark>)
    from = at + needle.length
  }
  parts.push(text.slice(from))
  return parts
}

/** Title search over events and tasks, grouped by date; a result opens its day on the calendar. */
export function SearchPage({ items, categories, onClose, onPick }: {
  items: WorkItem[]
  categories: WorkspaceCategory[]
  onClose: () => void
  /** Called with the result's date; undated tasks open the editor instead. */
  onPick: (item: WorkItem) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus({ preventScroll: true }) }, [])
  const needle = query.trim().toLocaleLowerCase('ko')
  const results = needle
    ? items.filter((item) => item.title.toLocaleLowerCase('ko').includes(needle))
      .sort((a, b) => Number(Boolean(a.undated)) - Number(Boolean(b.undated)) || a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    : []
  const dateLabel = (item: WorkItem) => {
    if (item.undated) return t('schedule.mobile.noDate')
    const date = parseISODate(item.date)
    return t('schedule.mobile.searchDate', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), weekday: t(`schedule.mobile.dow.${date.getDay()}`) })
  }
  return (
    <section className="mcal-page" aria-label={t('schedule.mobile.search')} data-mobile-search>
      <div className="mcal-page-head">
        <button type="button" className="mcal-ib" aria-label={t('schedule.mobile.back')} onClick={onClose}><ChevronLeft aria-hidden="true" className="size-5.5" /></button>
        <label className="mcal-sbox">
          <Search aria-hidden="true" className="size-4.5" />
          <input ref={input} type="search" value={query} placeholder={t('schedule.mobile.searchPlaceholder')} aria-label={t('schedule.mobile.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery('') } }} />
        </label>
      </div>
      <div className="mcal-page-body mcal-noscroll">
        <div className="mcal-sres">
          {!needle ? <p className="mcal-hint">{t('schedule.mobile.searchHint')}</p>
            : !results.length ? <p className="mcal-hint">{t('schedule.mobile.searchEmpty', { query: query.trim() })}</p>
              : results.map((item, index) => {
                const label = dateLabel(item)
                const heading = !index || dateLabel(results[index - 1]) !== label ? <p className="mcal-sdate">{label}</p> : null
                return (
                  <div key={item.id}>
                    {heading}
                    <button type="button" className="mcal-srow" data-search-result={item.id} onClick={() => onPick(item)}>
                      {item.kind === 'event'
                        ? <span className="mcal-ebar" style={{ '--cal-color': colorOf(item, categories) } as CSSProperties} aria-hidden="true" />
                        : <span className="mcal-box" aria-hidden="true" />}
                      <b>{highlight(item.title, query.trim())}</b>
                      <small>{item.kind === 'task' ? t('schedule.kindTask') : item.endDate && item.endDate > item.date ? t('schedule.mobile.period') : item.startTime ?? t('schedule.mobile.allDay')}</small>
                    </button>
                  </div>
                )
              })}
        </div>
      </div>
    </section>
  )
}
