import { ChevronLeft, GripVertical, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { chromeNavLabel, MOBILE_BAR_SIZE, type NavItem } from '../../constants/navigation.ts'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { ThemeIcon } from '../../theme/ThemeIcon.tsx'
import { defaultZonesPatch, MENU_ZONES, menuZones, moveMenu, zonesPatch, zonesProblem, type MenuZone, type MenuZones } from './menuZones.ts'
import './more.css'

type Drag = {
  id: string
  zone: MenuZone
  index: number
  /** Pointer y and the grab offset inside the row, for the floating copy. */
  y: number
  dy: number
  left: number
  width: number
}

const EDGE = 80
const STEP = 8

/** Phone menu layout: drag rows by their handle between the bottom bar, More and hidden. */
export function MenuLayoutPage() {
  const { settings, customPages, updateSettings } = useLibrary()
  const { t } = useI18n()
  const { zones, items } = menuZones(settings.nav, customPages, settings.mobileBarIds)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [notice, setNotice] = useState('')
  const zoneRefs = useRef<Partial<Record<MenuZone, HTMLDivElement | null>>>({})
  const dragRef = useRef<Drag | null>(null)

  const item = (id: string): NavItem | undefined => items.find((entry) => entry.id === id)
  const label = (id: string) => chromeNavLabel(id, t, item(id)?.label ?? id)
  const zoneName = (zone: MenuZone) => t(`nav.layout.${zone}`)
  const live = drag ? moveMenu(zones, drag.id, drag.zone, drag.index) : zones
  const problem = drag ? zonesProblem(live) : null

  const say = (message: string) => setNotice(message)
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  const problemText = (kind: NonNullable<ReturnType<typeof zonesProblem>>, id: string) =>
    kind === 'full' ? t('nav.layout.full') : kind === 'empty' ? t('nav.layout.empty') : t('nav.layout.locked', { name: label(id) })

  /** Saves a layout, or keeps the old one and says why. */
  const commit = (next: MenuZones, id: string): boolean => {
    const kind = zonesProblem(next)
    if (kind) { say(problemText(kind, id)); return false }
    updateSettings(zonesPatch(settings.nav, next))
    return true
  }

  // Pointer drag: document listeners keep following the finger while the row moves between zone cards.
  const dragging = Boolean(drag)
  useEffect(() => {
    if (!dragging) return
    const scroller = document.querySelector<HTMLElement>('.theme-app-layout > main') ?? document.scrollingElement as HTMLElement
    let frame = 0
    const place = (y: number) => {
      const current = dragRef.current
      if (!current) return
      const boxes = MENU_ZONES.flatMap((zone) => {
        const el = zoneRefs.current[zone]
        return el ? [{ zone, el, rect: el.getBoundingClientRect() }] : []
      })
      const hit = boxes.find(({ rect }) => y >= rect.top - 24 && y <= rect.bottom + 24)
        ?? [...boxes].sort((a, b) => Math.min(Math.abs(y - a.rect.top), Math.abs(y - a.rect.bottom)) - Math.min(Math.abs(y - b.rect.top), Math.abs(y - b.rect.bottom)))[0]
      if (!hit) return
      const rows = [...hit.el.querySelectorAll<HTMLElement>('[data-menu-row]')].filter((row) => row.dataset.menuRow !== current.id)
      const before = rows.findIndex((row) => { const box = row.getBoundingClientRect(); return y < box.top + box.height / 2 })
      const index = before < 0 ? rows.length : before
      if (hit.zone !== current.zone || index !== current.index || y !== current.y) {
        dragRef.current = { ...current, zone: hit.zone, index, y }
        setDrag(dragRef.current)
      }
    }
    const scroll = () => {
      const current = dragRef.current
      if (!current) return
      const box = scroller.getBoundingClientRect()
      const step = current.y < box.top + EDGE ? -STEP : current.y > Math.min(box.bottom, window.innerHeight) - EDGE ? STEP : 0
      if (step) {
        const top = scroller.scrollTop
        scroller.scrollTop += step
        if (scroller.scrollTop !== top) place(current.y)
      }
      frame = requestAnimationFrame(scroll)
    }
    const move = (event: PointerEvent) => { event.preventDefault(); place(event.clientY) }
    const end = (event: PointerEvent) => {
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!current || event.type === 'pointercancel') return
      const next = moveMenu(zones, current.id, current.zone, current.index)
      commit(next, current.id)
    }
    frame = requestAnimationFrame(scroll)
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
    document.body.classList.add('menu-dragging')
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
      document.body.classList.remove('menu-dragging')
    }
    // Settings cannot change mid-drag, so the zones and commit captured when the drag started stay current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, id: string, zone: MenuZone) => {
    if (event.button > 0) return
    event.preventDefault()
    const row = event.currentTarget.closest<HTMLElement>('[data-menu-row]')
    if (!row) return
    const box = row.getBoundingClientRect()
    dragRef.current = { id, zone, index: zones[zone].indexOf(id), y: event.clientY, dy: event.clientY - box.top, left: box.left, width: box.width }
    setDrag(dragRef.current)
  }

  // Keyboard: ↑↓ reorder inside a zone, ←→ move to the previous or next zone.
  const onGripKey = (event: KeyboardEvent<HTMLButtonElement>, id: string, zone: MenuZone) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const index = zones[zone].indexOf(id)
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    const to = vertical ? zone : MENU_ZONES[MENU_ZONES.indexOf(zone) + (event.key === 'ArrowLeft' ? -1 : 1)]
    if (!to) return
    const at = vertical ? index + (event.key === 'ArrowUp' ? -1 : 1) : zones[to].length
    if (vertical && (at < 0 || at >= zones[zone].length)) return
    const next = moveMenu(zones, id, to, at)
    if (!commit(next, id)) return
    // The row may now live in another zone card; keep focus on its handle there.
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-menu-grip="${CSS.escape(id)}"]`)?.focus())
    // More and hidden follow the menu order, so announce where the menu actually lands.
    const settled = menuZones(zonesPatch(settings.nav, next).nav, customPages, next.bar)
    say(t('nav.layout.moved', { name: label(id), zone: zoneName(to), count: settled.zones[to].indexOf(id) + 1 }))
  }

  const restore = () => {
    updateSettings(defaultZonesPatch(settings.nav))
    say(t('nav.layout.restored'))
  }

  const row = (id: string, zone: MenuZone, placeholder = false) => {
    const entry = item(id)
    if (!entry) return null
    const name = label(id)
    const position = live[zone].indexOf(id)
    // While dragging, the grabbed row stays mounted (hidden) in its own card so the pointer keeps its target;
    // a placeholder copy marks where it will land.
    const grabbed = !placeholder && drag?.id === id
    return (
      <div key={placeholder ? `drop-${id}` : id} role="listitem" className="more-row more-drow" data-menu-row={placeholder ? undefined : id} data-dragging={placeholder ? '' : undefined} hidden={grabbed} aria-hidden={placeholder || undefined}>
        <button
          type="button"
          className="more-grip"
          data-menu-grip={placeholder ? undefined : id}
          tabIndex={placeholder ? -1 : undefined}
          aria-label={t('nav.layout.grip', { name })}
          aria-describedby="menu-layout-intro"
          onPointerDown={placeholder ? undefined : (event) => startDrag(event, id, zone)}
          onKeyDown={placeholder ? undefined : (event) => onGripKey(event, id, zone)}
        >
          <GripVertical size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>
        {zone === 'bar' && position >= 0 ? <span className="more-num" aria-hidden="true">{position + 1}</span> : null}
        <span className="more-ri"><ThemeIcon name={id} fallback={entry.icon} size={18} strokeWidth={1.6} aria-hidden="true" /></span>
        <span className="more-rt">{name}</span>
      </div>
    )
  }

  const zoneCard = (zone: MenuZone) => {
    const over = drag?.zone === zone
    const rows = zones[zone].map((id) => row(id, zone))
    if (drag && over) {
      // Insert the placeholder among the rows that stay visible, matching the drop index.
      const visible = zones[zone].filter((id) => id !== drag.id)
      const at = drag.index < visible.length ? zones[zone].indexOf(visible[drag.index]) : zones[zone].length
      rows.splice(at, 0, row(drag.id, zone, true))
    }
    const empty = !live[zone].length
    return (
      <div
        ref={(el) => { zoneRefs.current[zone] = el }}
        className="more-card more-dzone"
        data-zone={zone}
        data-state={over ? (problem ? 'full' : 'over') : undefined}
        role="list"
        aria-label={zoneName(zone)}
      >
        {rows}
        {empty ? <div className="more-row more-dzone-empty">{t(`nav.layout.${zone}Empty`)}</div> : null}
      </div>
    )
  }

  const ghost = drag ? item(drag.id) : null

  return (
    <div className="more-page" data-menu-layout>
      <header className="more-bar">
        <Link to={ROUTES.more} className="more-ib" aria-label={t('nav.layout.back')}><ChevronLeft size={22} strokeWidth={1.6} aria-hidden="true" /></Link>
        <h1>{t('nav.menuLayout')}</h1>
        <button type="button" className="more-ib" aria-label={t('nav.layout.restore')} title={t('nav.layout.restore')} onClick={restore} data-menu-restore>
          <RotateCcw size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
      </header>
      <div className="more-body">
        <p className="more-hint more-hint-top" id="menu-layout-intro">
          <GripVertical size={14} strokeWidth={1.6} aria-hidden="true" /> {t('nav.layout.intro')}
        </p>
        <h2 className="more-label">{t('nav.layout.preview')}</h2>
        <div className="more-navprev" aria-label={t('nav.layout.previewLabel')} role="img">
          {Array.from({ length: MOBILE_BAR_SIZE }, (_, index) => {
            const id = live.bar[index]
            const entry = id ? item(id) : null
            return entry ? (
              <span key={id}><ThemeIcon name={id} fallback={entry.icon} size={20} strokeWidth={1.6} aria-hidden="true" />{label(id)}</span>
            ) : <span key={`empty-${index}`} />
          })}
        </div>
        <h2 className="more-label">{t('nav.layout.bar')}<small data-state={live.bar.length > MOBILE_BAR_SIZE ? 'full' : undefined}>{live.bar.length}/{MOBILE_BAR_SIZE}</small></h2>
        {zoneCard('bar')}
        <h2 className="more-label">{t('nav.layout.more')}<small>{t('nav.layout.moreHint')}</small></h2>
        {zoneCard('more')}
        <h2 className="more-label">{t('nav.layout.hidden')}<small>{t('nav.layout.hiddenHint')}</small></h2>
        {zoneCard('hidden')}
        <p className="more-hint">{t('nav.layout.footer')}</p>
      </div>
      {ghost && drag ? (
        <div className="more-row more-ghost" aria-hidden="true" style={{ top: drag.y - drag.dy, left: drag.left, width: drag.width }}>
          <span className="more-grip"><GripVertical size={18} strokeWidth={1.6} /></span>
          <span className="more-ri"><ThemeIcon name={drag.id} fallback={ghost.icon} size={18} strokeWidth={1.6} /></span>
          <span className="more-rt">{label(drag.id)}</span>
        </div>
      ) : null}
      <p className="more-toast" role="status" aria-live="polite" data-on={notice ? '' : undefined}>{notice}</p>
    </div>
  )
}
