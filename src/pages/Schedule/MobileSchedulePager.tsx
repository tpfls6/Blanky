import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

export type SchedulePane = { id: string; label: string; badge?: number; content: ReactNode }

/**
 * Phone schedule: one tab per pane, switched by tapping a tab or swiping sideways.
 * Swiping is native horizontal scroll-snap, so a gesture that starts inside a
 * horizontal scroller, a resize handle or a drag stays with that element.
 */
export function MobileSchedulePager({ panes, initial = 0 }: { panes: SchedulePane[]; initial?: number }) {
  const [active, setActive] = useState(initial)
  const track = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  // While a tapped tab animates the track, intermediate panes don't flash as active.
  const heading = useRef<number | null>(null)
  // Chrome drops the click of a tap that lands right after a swipe (it only stops the fling), so touch taps switch on pointerup.
  const press = useRef<{ id: number; x: number; y: number } | null>(null)
  const tapped = useRef(0)

  // Keep every pane's snap area intact. Only the track follows the active pane's
  // height, so a shorter tab does not leave a long blank page below it.
  useLayoutEffect(() => {
    const element = track.current
    const pane = element?.children[active]
    if (!element || !(pane instanceof HTMLElement)) return
    const measure = () => { element.style.height = `${pane.getBoundingClientRect().height}px` }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [active, panes.length])

  // Follows the swipe: the pane nearest the snap position is the active tab.
  useEffect(() => {
    const element = track.current
    if (!element) return
    let frame = 0
    let touching = false
    let timer: ReturnType<typeof setTimeout>
    const queueSettle = () => {
      clearTimeout(timer)
      // Some mobile browsers don't emit scrollend after a layout resize.
      timer = setTimeout(() => { if (!touching) settle() }, 200)
    }
    const sync = () => {
      queueSettle()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const width = element.clientWidth
        if (!width) return
        if (heading.current !== null) {
          if (Math.abs(element.scrollLeft - heading.current * width) > 2) return
          heading.current = null
        }
        setActive(Math.max(0, Math.min(panes.length - 1, Math.round(element.scrollLeft / width))))
      })
    }
    const release = () => { heading.current = null; touching = true; clearTimeout(timer) }
    const finish = () => { touching = false; queueSettle() }
    const settle = () => {
      if (touching) return
      const width = element.clientWidth
      if (!width) return
      const index = Math.max(0, Math.min(panes.length - 1, Math.round(element.scrollLeft / width)))
      if (Math.abs(element.scrollLeft - index * width) > 2) {
        element.scrollTo({ left: index * width, behavior: 'instant' as ScrollBehavior })
      }
      heading.current = null
      setActive(index)
    }
    element.addEventListener('scroll', sync, { passive: true })
    element.addEventListener('scrollend', settle)
    element.addEventListener('pointerdown', release, { passive: true })
    element.addEventListener('touchstart', release, { passive: true })
    window.addEventListener('pointerup', finish, { passive: true })
    window.addEventListener('touchend', finish, { passive: true })
    window.addEventListener('touchcancel', finish, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      element.removeEventListener('scroll', sync)
      element.removeEventListener('scrollend', settle)
      element.removeEventListener('pointerdown', release)
      element.removeEventListener('touchstart', release)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('touchend', finish)
      window.removeEventListener('touchcancel', finish)
    }
  }, [panes.length])

  // Keeps the visible pane in place when the width changes (rotation, resize).
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => {
    const element = track.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth
      element.scrollTo({ left: activeRef.current * width, behavior: 'instant' as ScrollBehavior })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const go = (index: number, focus = false) => {
    const element = track.current
    setActive(index)
    if (element) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      heading.current = Math.abs(element.scrollLeft - index * element.clientWidth) > 2 ? index : null
      element.scrollTo({ left: index * element.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
      // A tap during a swipe's momentum can cancel the smooth scroll; land on the tab unless a new touch took over.
      window.setTimeout(() => {
        if (heading.current !== index) return
        heading.current = null
        if (Math.abs(element.scrollLeft - index * element.clientWidth) > 2) element.scrollTo({ left: index * element.clientWidth, behavior: 'auto' })
        setActive(index)
      }, 600)
    }
    if (focus) tabs.current[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const next = event.key === 'ArrowRight' ? active + 1 : event.key === 'ArrowLeft' ? active - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? panes.length - 1 : null
    if (next === null || next < 0 || next >= panes.length) return
    event.preventDefault()
    go(next, true)
  }

  return (
    <div className="schedule-pager" data-schedule-pager>
      <div role="tablist" aria-label="일정 보기" className="schedule-pager-tabs" onKeyDown={onKeyDown}>
        {panes.map((pane, index) => (
          <button key={pane.id} ref={(node) => { tabs.current[index] = node }} type="button" role="tab" id={`${id}-tab-${pane.id}`}
            aria-selected={active === index} aria-controls={`${id}-pane-${pane.id}`} tabIndex={active === index ? 0 : -1}
            data-schedule-tab={pane.id} className="schedule-pager-tab"
            onPointerDown={(event) => { press.current = event.pointerType === 'touch' ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null }}
            onPointerUp={(event: PointerEvent) => {
              const start = press.current
              press.current = null
              if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return
              tapped.current = performance.now()
              go(index)
            }}
            onClick={() => { if (performance.now() - tapped.current > 500) go(index) }}>
            {pane.label}
            {pane.badge ? <span className="schedule-pager-badge">{pane.badge}</span> : null}
          </button>
        ))}
        <span className="schedule-pager-indicator" aria-hidden="true" style={{ width: `${100 / panes.length}%`, transform: `translateX(${active * 100}%)` }} />
      </div>
      <div ref={track} className="schedule-pager-track">
        {panes.map((pane, index) => (
          <section key={pane.id} role="tabpanel" id={`${id}-pane-${pane.id}`} aria-labelledby={`${id}-tab-${pane.id}`}
            data-schedule-pane={pane.id} className="schedule-pager-pane" inert={active === index ? undefined : true}>
            {pane.content}
          </section>
        ))}
      </div>
    </div>
  )
}
