import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, ChevronRight, MoreHorizontal, Search, Share2, type LucideIcon } from 'lucide-react'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { CustomizationSheet } from '../Custom/CustomizationSheet.tsx'
import '../More/more.css'
import './store.css'

export type StoreMenuItem = { label: string; hint?: string; icon: LucideIcon; to?: string; onClick?: () => void; accent?: boolean }

/**
 * The store's top: phones get the 56px app bar (‹ · 스토어 · 🔍 · ⋯), where 🔍 turns the bar into a search field
 * and 취소 clears it; wider screens get one header line (title · search field · actions).
 */
export function StoreBar({ phone, query, onQuery, searchLabel, menu, actions, onBack }: {
  phone: boolean
  query: string
  onQuery: (value: string) => void
  searchLabel: string
  menu: StoreMenuItem[]
  actions: ReactNode
  /** Leaves an in-store view (내 등록) instead of the store. */
  onBack?: () => void
}) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [searching, setSearching] = useState(false)
  const [sheet, setSheet] = useState(false)
  const open = searching || Boolean(query)
  const back = () => {
    if (onBack) return onBack()
    // A store opened directly (no history in the app) goes back to 커스텀, where it lives.
    if (location.key === 'default') navigate(ROUTES.custom)
    else navigate(-1)
  }

  if (!phone) {
    return (
      <header className="store-head">
        <h1>{t('nav.store')}</h1>
        <label className="store-search">
          <Search className="size-4.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          <input data-tour="store-search" type="search" value={query} onChange={event => onQuery(event.target.value)} aria-label={searchLabel} placeholder={t('templates.search')} />
        </label>
        <div className="store-head-actions">{actions}</div>
      </header>
    )
  }

  return (
    <>
      {open ? (
        <header className="more-bar store-bar">
          <label className="store-search">
            <Search className="size-4.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
            <input data-tour="store-search" type="search" autoFocus value={query} onChange={event => onQuery(event.target.value)} aria-label={searchLabel} placeholder={t('templates.search')} />
          </label>
          <button type="button" className="store-cancel" onClick={() => { onQuery(''); setSearching(false) }}>{t('store.cancel')}</button>
        </header>
      ) : (
        <header className="more-bar store-bar">
          <button type="button" className="more-ib" onClick={back} aria-label={t('custom.goBack')}><ArrowLeft className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></button>
          <h1>{t('nav.store')}</h1>
          <button type="button" data-tour="store-search" className="more-ib" onClick={() => setSearching(true)} aria-label={searchLabel}><Search className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></button>
          <button type="button" className="more-ib" aria-haspopup="dialog" onClick={() => setSheet(true)} aria-label={t('store.more')}><MoreHorizontal className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></button>
        </header>
      )}
      {sheet ? (
        <CustomizationSheet title={t('nav.store')} onClose={() => setSheet(false)}>
          <div className="more-card">
            {menu.map(item => {
              const body = <>
                <span className={item.accent ? 'more-ri store-ri-accent' : 'more-ri store-ri'}><item.icon className="size-4.5" strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="more-rt">{item.label}{item.hint ? <small>{item.hint}</small> : null}</span>
                <ChevronRight className="more-chev size-4.5" aria-hidden="true" />
              </>
              return item.to
                ? <Link key={item.label} to={item.to} className="more-row" onClick={() => setSheet(false)}>{body}</Link>
                : <button key={item.label} type="button" className="more-row" onClick={() => { setSheet(false); item.onClick?.() }}>{body}</button>
            })}
          </div>
        </CustomizationSheet>
      ) : null}
    </>
  )
}

/** One line of filter chips that scrolls sideways on phones. */
export function StoreChips({ label, children }: { label: string; children: ReactNode }) {
  return <div className="store-chips" role="group" aria-label={label}>{children}</div>
}

export function StoreChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className="store-chip" aria-pressed={on} onClick={onClick}>{children}</button>
}

/**
 * "n개 · 추천순 ▾": the order opens a small listbox right under the button (not a sheet). Arrow keys move,
 * Enter/Space pick, Esc or a tap outside closes and focus returns to the button.
 */
export function SortMenu<T extends string>({ count, value, options, onChange }: {
  count: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const current = options.find(option => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const close = () => { setOpen(false); button.current?.focus() }
  const pick = (next: T) => { onChange(next); close() }
  const keys = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const move = (to: number) => { event.preventDefault(); items[(to + items.length) % items.length]?.focus() }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Escape') { event.preventDefault(); close() }
    else if (event.key === 'Tab') setOpen(false)
    else if ((event.key === 'Enter' || event.key === ' ') && index >= 0) { event.preventDefault(); pick(options[index].value) }
  }

  return (
    <div className="store-sortrow" ref={root}>
      <span>{count}</span>
      <button ref={button} type="button" className="store-sort" aria-haspopup="listbox" aria-expanded={open} aria-label={t('store.sortBy', { order: current.label })}
        onClick={() => setOpen(!open)} onKeyDown={event => { if (event.key === 'ArrowDown' && !open) { event.preventDefault(); setOpen(true) } }}>
        {current.label}<ChevronDown className="size-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
      {open ? (
        <ul ref={list} role="listbox" aria-label={t('store.sortLabel')} className="store-sortmenu" onKeyDown={keys}>
          {options.map(option => (
            <li key={option.value} role="option" tabIndex={-1} aria-selected={option.value === value} onClick={() => pick(option.value)}>
              <Check className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />{option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Bottom toast above the action bar; `action` adds one button (e.g. 열기). */
export function StoreToast({ message, action }: { message: string; action?: ReactNode }) {
  return <div className="store-toast" role="status" aria-live="polite" data-on={message ? '' : undefined}>{message ? <><span>{message}</span>{action}</> : null}</div>
}

/** Detail app bar on phones: ‹ · (title) · 공유 · ⋯. `over` floats it on the hero image. */
export function StoreDetailBar({ title, over, onShare, onMore, backTo }: { title?: string; over?: boolean; onShare: () => void; onMore: () => void; backTo: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <header className={over ? 'more-bar store-detail-bar store-detail-bar-over' : 'more-bar store-detail-bar'}>
      <button type="button" className="more-ib" aria-label={t('custom.goBack')} onClick={() => (location.key === 'default' ? navigate(backTo) : navigate(-1))}><ArrowLeft className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></button>
      {title ? <h1>{title}</h1> : <span className="flex-1" />}
      <button type="button" className="more-ib" aria-label={t('store.copyLink')} onClick={onShare}><Share2 className="size-5" strokeWidth={1.8} aria-hidden="true" /></button>
      <button type="button" className="more-ib" aria-haspopup="dialog" aria-label={t('store.moreActions')} onClick={onMore}><MoreHorizontal className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></button>
    </header>
  )
}

/** Creator row: initial avatar · name · a line of what is known · chevron, opening the creator page. */
export function CreatorRow({ to, name, hint }: { to: string; name: string; hint: string }) {
  return (
    <div className="more-card store-creator">
      <Link to={to} className="more-row">
        <span className="store-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        <span className="more-rt">{name}<small>{hint}</small></span>
        <ChevronRight className="more-chev size-4.5" aria-hidden="true" />
      </Link>
    </div>
  )
}

/** Up to three stat cells; callers pass only the values that exist. */
export function StoreStats({ items }: { items: { value: ReactNode; label: string }[] }) {
  if (!items.length) return null
  return <dl className="store-stats" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>{items.map(item => <div key={item.label}><dd>{item.value}</dd><dt>{item.label}</dt></div>)}</dl>
}

export type StoreSheetItem = StoreMenuItem & { danger?: boolean }

/** ⋯ action sheet: groups of rows; a row is a link, an action, or (`node`) a ready-made control. */
export function StoreMenuSheet({ title, subtitle, groups, onClose }: { title: string; subtitle?: string; groups: (StoreSheetItem | ReactNode)[][]; onClose: () => void }) {
  return (
    <CustomizationSheet title={title} subtitle={subtitle} onClose={onClose}>
      {groups.filter(group => group.length).map((group, index) => (
        <div key={index} className="more-card">
          {group.map((item, row) => {
            if (!item || typeof item !== 'object' || !('icon' in item)) return <div key={row} className="store-sheet-node">{item as ReactNode}</div>
            const body = <>
              <span className={item.danger ? 'more-ri store-ri-danger' : item.accent ? 'more-ri store-ri-accent' : 'more-ri store-ri'}><item.icon className="size-4.5" strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="more-rt">{item.label}{item.hint ? <small>{item.hint}</small> : null}</span>
              {item.to ? <ChevronRight className="more-chev size-4.5" aria-hidden="true" /> : null}
            </>
            return item.to
              ? <Link key={item.label} to={item.to} className="more-row" onClick={onClose}>{body}</Link>
              : <button key={item.label} type="button" className={item.danger ? 'more-row store-danger' : 'more-row'} onClick={() => { onClose(); item.onClick?.() }}>{body}</button>
          })}
        </div>
      ))}
    </CustomizationSheet>
  )
}
