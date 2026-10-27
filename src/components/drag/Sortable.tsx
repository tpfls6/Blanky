import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

type Drag = { id: string; x: number; y: number; ox: number; oy: number; w: number; h: number }

type Pending = Drag & { sx: number; sy: number }

function nearestIndex(root: HTMLElement, id: string, x: number, y: number, items: readonly { id: string }[]): number | null {
  const nodes = [...root.querySelectorAll<HTMLElement>('[data-sort-id]')]
  let best: { id: string; distance: number } | null = null
  for (const node of nodes) {
    const sid = node.dataset.sortId
    if (!sid || sid === id) continue
    const rect = node.getBoundingClientRect()
    const dx = rect.left + rect.width / 2 - x
    const dy = rect.top + rect.height / 2 - y
    const distance = dx * dx + dy * dy
    if (!best || distance < best.distance) best = { id: sid, distance }
  }
  if (!best) return null
  const node = nodes.find((item) => item.dataset.sortId === best?.id)
  if (!node) return null
  const rect = node.getBoundingClientRect()
  const inside = x >= rect.left - 16 && x <= rect.right + 16 && y >= rect.top - 16 && y <= rect.bottom + 16
  if (!inside) return null
  const index = items.findIndex((item) => item.id === best?.id)
  return index < 0 ? null : index
}

export function Sortable<T extends { id: string }>({
  items,
  onReorder,
  className,
  itemClassName,
  render,
}: {
  items: readonly T[]
  onReorder: (items: T[]) => void
  className?: string
  itemClassName?: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const beforeRef = useRef<Map<string, DOMRect> | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const itemsRef = useRef(items)
  useLayoutEffect(() => { itemsRef.current = items }, [items])
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragId = drag?.id ?? null

  useLayoutEffect(() => {
    const before = beforeRef.current
    const root = rootRef.current
    if (!before || !root) return
    beforeRef.current = null
    root.querySelectorAll<HTMLElement>('[data-sort-id]').forEach((node) => {
      const id = node.dataset.sortId
      const prev = id ? before.get(id) : undefined
      if (!prev) return
      const next = node.getBoundingClientRect()
      const dx = prev.left - next.left
      const dy = prev.top - next.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 200, easing: 'ease' },
      )
    })
  })

  const snapshot = () => {
    const map = new Map<string, DOMRect>()
    rootRef.current?.querySelectorAll<HTMLElement>('[data-sort-id]').forEach((node) => {
      if (node.dataset.sortId) map.set(node.dataset.sortId, node.getBoundingClientRect())
    })
    beforeRef.current = map
  }

  const shift = (id: string, x: number, y: number) => {
    const root = rootRef.current
    if (!root) return
    const current = itemsRef.current
    const to = nearestIndex(root, id, x, y, current)
    const from = current.findIndex((item) => item.id === id)
    if (to === null || from < 0 || to === from) return
    snapshot()
    const next = current.slice()
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    itemsRef.current = next
    onReorder(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, select, button, a, label, [contenteditable="true"], [data-no-drag]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    pendingRef.current = {
      id,
      x: rect.left,
      y: rect.top,
      ox: event.clientX - rect.left,
      oy: event.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      sx: event.clientX,
      sy: event.clientY,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.stopPropagation()
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pending = pendingRef.current
    if (!pending) return
    const dx = event.clientX - pending.sx
    const dy = event.clientY - pending.sy
    if (!drag && dx * dx + dy * dy < 16) return
    const next = {
      id: pending.id,
      x: event.clientX - pending.ox,
      y: event.clientY - pending.oy,
      ox: pending.ox,
      oy: pending.oy,
      w: pending.w,
      h: pending.h,
    }
    setDrag(next)
    shift(pending.id, event.clientX, event.clientY)
  }

  const end = () => {
    pendingRef.current = null
    setDrag(null)
  }

  const floating = drag ? items.find((item) => item.id === drag.id) : undefined

  return (
    <div ref={rootRef} className={className}>
      {items.map((item) => {
        const active = dragId === item.id
        return (
          <div
            key={item.id}
            data-sort-id={item.id}
            onPointerDown={(event) => onPointerDown(event, item.id)}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
            className={[itemClassName?.(item) ?? '', active ? '' : 'cursor-grab'].join(' ')}
          >
            {active ? (
              <div className="block-placeholder" style={{ minHeight: drag?.h }} />
            ) : (
              render(item)
            )}
          </div>
        )
      })}
      {drag && floating ? (
        <div
          className="block-lift pointer-events-none fixed z-50 overflow-hidden"
          style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
        >
          {render(floating)}
        </div>
      ) : null}
    </div>
  )
}
