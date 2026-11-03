import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, useState } from 'react'
import './spotlight.css'

export type TourStep = { target: string; title: string; body: string; prepare?: string }
type Box = { x: number; y: number; width: number; height: number }
type Layout = { box: Box; left: number; top: number; maxHeight: number }
const GAP = 14

function visibleTarget(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(el => {
    const rect = el.getBoundingClientRect()
    return el.getClientRects().length > 0 && rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
  })
}

/** One portal, no cloned UI or z-index mutations on application elements. */
export function SpotlightTour({ steps, onClose, prepare }: {
  steps: TourStep[]; onClose: () => void; prepare: (action: string) => void | (() => void)
}) {
  const [index, setIndex] = useState(0)
  const [layout, setLayout] = useState<Layout | null>(null)
  const panel = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const callbacks = useRef({ onClose, prepare })
  const origin = useRef<HTMLElement | null>(null)
  const firstTarget = useRef(steps[0].target)
  const target = useRef<HTMLElement | null>(null)
  const direction = useRef(1)
  const titleId = useId()
  const bodyId = useId()
  const step = steps[index]
  useEffect(() => { callbacks.current = { onClose, prepare } })

  useEffect(() => {
    const fallbackSelector = firstTarget.current
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); callbacks.current.onClose()
      }
      if (event.key === 'Tab') {
        const buttons = [...panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []]
        if (!buttons.length) return
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (current < 0 || (!event.shiftKey && current === buttons.length - 1) || (event.shiftKey && current === 0)) {
          event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus()
        }
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      // Step cleanup may close a panel and move focus; restore after all cleanups.
      queueMicrotask(() => {
        const el = origin.current?.isConnected && origin.current !== document.body && origin.current.getClientRects().length
          ? origin.current : visibleTarget(fallbackSelector) ?? target.current
        if (el?.isConnected) {
          const previous = el.getAttribute('tabindex')
          if (!el.matches('button, input, textarea, select, a[href], [tabindex]')) el.tabIndex = -1
          el.focus({ preventScroll: true })
          if (previous === null) el.removeAttribute('tabindex')
        }
      })
    }
  }, [])

  useEffect(() => {
    let frame = 0
    let cancelled = false
    let cleanup: void | (() => void)
    let found: HTMLElement | undefined
    let focused = false
    let missingSince = performance.now()
    try { if (step.prepare) cleanup = callbacks.current.prepare(step.prepare) } catch { /* resolve or skip below */ }
    const advanceMissing = () => {
      const next = index + direction.current
      if (next < 0 || next >= steps.length) callbacks.current.onClose()
      else setIndex(next)
    }
    const measure = () => {
      if (cancelled) return
      const el = visibleTarget(step.target)
      if (!el) {
        setLayout(null)
        if (performance.now() - missingSince > 1600) { advanceMissing(); return }
      } else {
        missingSince = performance.now()
        if (el !== found) {
          found = el; target.current = el
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        }
        const rect = el.getBoundingClientRect()
        const viewport = window.visualViewport
        const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0
        const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight
        const x = Math.max(vx + 4, rect.left - 6), y = Math.max(vy + 4, rect.top - 6)
        const box = { x, y, width: Math.max(0, Math.min(rect.right + 6, vx + width - 4) - x), height: Math.max(0, Math.min(rect.bottom + 6, vy + height - 4) - y) }
        const pw = Math.min(336, width - 24)
        const ph = panel.current?.getBoundingClientRect().height ?? 235
        const bottom = vy + height - (y + box.height) - GAP - 12
        const top = y - vy - GAP - 12
        const right = vx + width - (x + box.width) - GAP - 12
        const left = x - vx - GAP - 12
        let px = Math.min(Math.max(x, vx + 12), vx + width - pw - 12)
        let py: number, maxHeight: number
        if (bottom >= ph || (bottom >= top && right < pw && left < pw)) {
          py = y + box.height + GAP; maxHeight = bottom
        } else if (top >= ph || (top > bottom && right < pw && left < pw)) {
          maxHeight = top; py = y - GAP - Math.min(ph, maxHeight)
        } else {
          px = right >= pw ? x + box.width + GAP : x - pw - GAP
          maxHeight = height - 24; py = Math.min(Math.max(y, vy + 12), vy + height - ph - 12)
        }
        const next = { box, left: px, top: py, maxHeight: Math.max(60, maxHeight) }
        setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
        if (!focused && panel.current && getComputedStyle(panel.current).visibility === 'visible') {
          heading.current?.focus({ preventScroll: true }); focused = true
        }
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => { cancelled = true; cancelAnimationFrame(frame); cleanup?.() }
  }, [index, steps, step])

  const go = (value: number) => { setLayout(null); direction.current = value > index ? 1 : -1; setIndex(value) }
  return createPortal(<div className="spotlight-root">
    {layout ? <>
      <svg className="spotlight-overlay" aria-hidden="true" width="100%" height="100%">
        <defs><mask id={titleId + '-mask'}><rect width="100%" height="100%" fill="white"/><rect {...{ x: layout.box.x, y: layout.box.y, width: layout.box.width, height: layout.box.height }} rx="9" fill="black"/></mask></defs>
        <path d={`M0 0H${innerWidth}V${innerHeight}H0Z M${layout.box.x} ${layout.box.y}h${layout.box.width}v${layout.box.height}h-${layout.box.width}Z`} fillRule="evenodd" fill="#14243c" fillOpacity=".48" mask={`url(#${titleId}-mask)`}/>
        <rect className="spotlight-border" x={layout.box.x} y={layout.box.y} width={layout.box.width} height={layout.box.height} rx="9" fill="none" stroke="#83a9df" strokeWidth="1.5"/>
      </svg>
    </> : <div className="spotlight-wait" aria-hidden="true" />}
    <section ref={panel} data-page-tour data-tour-target={step.target} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}
      className="spotlight-popover" style={layout ? { left: layout.left, top: layout.top, maxHeight: layout.maxHeight } : { visibility: 'hidden' }}>
      <div className="spotlight-top"><span aria-label={`${steps.length}단계 중 ${index + 1}단계`}>시작 안내 · {index + 1} / {steps.length}</span><button type="button" onClick={onClose} aria-label="안내 닫기">×</button></div>
      <div aria-live="polite" aria-atomic="true"><h2 ref={heading} tabIndex={-1} id={titleId}>{step.title}</h2><p id={bodyId}>{step.body}</p></div>
      <div className="spotlight-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>건너뛰기</button><div><button type="button" className="btn btn-line" disabled={index === 0} onClick={() => go(index - 1)}>이전</button><button type="button" className="btn btn-primary" onClick={() => index === steps.length - 1 ? onClose() : go(index + 1)}>{index === steps.length - 1 ? '완료' : '다음'}</button></div></div>
    </section>
  </div>, document.body)
}
