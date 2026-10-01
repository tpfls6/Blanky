import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { filterIcons, ICONS, iconByName } from '../../constants/icons.ts'
import { SWATCHES } from '../../constants/swatches.ts'
import { RECENT_ICONS_KEY } from '../../state/storage.ts'

type IconPickerProps = {
  value: string
  onChange: (name: string) => void
  color?: string | null
  onColor?: (hex: string) => void
  plain?: boolean
}

type IconItem = (typeof ICONS)[number]

function loadRecent(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_ICONS_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && ICONS.some((icon) => icon.name === item)).slice(0, 8)
  } catch {
    return []
  }
}

function saveRecent(name: string): string[] {
  const next = [name, ...loadRecent().filter((item) => item !== name)].slice(0, 8)
  localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(next))
  return next
}

function placePanel(anchor: DOMRect): { sheet: boolean; style: CSSProperties } {
  if (window.matchMedia('(max-width: 639px)').matches) return { sheet: true, style: {} }
  const width = 292
  const margin = 8
  const gap = 6
  let left = anchor.left
  if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width
  if (left < margin) left = margin
  const spaceBelow = window.innerHeight - anchor.bottom - margin
  const spaceAbove = anchor.top - margin
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow
  const maxHeight = Math.min(380, Math.max(180, (openUp ? spaceAbove : spaceBelow) - gap))
  return {
    sheet: false,
    style: {
      left,
      width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - anchor.top + gap } : { top: anchor.bottom + gap }),
    },
  }
}

function IconButton({
  item,
  selected,
  color,
  sheet,
  onPick,
}: {
  item: IconItem
  selected: boolean
  color?: string | null
  sheet: boolean
  onPick: (name: string) => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      aria-label={item.name}
      aria-pressed={selected}
      title={item.name}
      onClick={() => onPick(item.name)}
      className={sheet ? 'icon-btn size-10!' : 'icon-btn'}
      style={
        selected
          ? { background: 'var(--accent-light)', color: color || 'var(--accent-text)', boxShadow: `inset 0 0 0 1px ${color || 'var(--accent-color)'}` }
          : undefined
      }
    >
      <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
    </button>
  )
}

export function IconPicker({ value, onChange, color, onColor, plain }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [place, setPlace] = useState<{ sheet: boolean; style: CSSProperties } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const Current = iconByName(value)
  const list = filterIcons(query)
  const recentItems = query.trim()
    ? []
    : recent.flatMap((name) => {
        const item = ICONS.find((icon) => icon.name === name)
        return item ? [item] : []
      })

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setPlace(null)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setPlace(placePanel(rect))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  const ready = open && place !== null

  useEffect(() => {
    if (!ready) return
    setRecent(loadRecent())
    searchRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [ready, close])

  const pick = (name: string) => {
    setRecent(saveRecent(name))
    onChange(name)
    if (!onColor) close()
  }

  const panel = place ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="아이콘 선택"
      className={
        place.sheet
          ? 'flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-md border-t border-line bg-surface p-3'
          : 'menu fixed z-50 flex flex-col overflow-hidden p-2'
      }
      style={place.sheet ? undefined : place.style}
    >
      {place.sheet ? <p className="mb-2 text-sm">아이콘 선택</p> : null}
      <input
        ref={searchRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="아이콘 검색"
        aria-label="아이콘 검색"
        className="field w-full"
      />
      {recentItems.length > 0 ? (
        <div className="mt-2">
          <p className="px-0.5 text-[11px] text-neutral-400">최근 항목</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {recentItems.map((item) => (
              <IconButton key={item.name} item={item} selected={item.name === value} color={color} sheet={place.sheet} onPick={pick} />
            ))}
          </div>
          <div className="mt-2 border-t border-line" />
        </div>
      ) : null}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {list.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-neutral-400">해당하는 아이콘이 없습니다.</p>
        ) : (
          <div className={place.sheet ? 'grid grid-cols-6 gap-1' : 'grid grid-cols-8 gap-1'}>
            {list.map((item) => (
              <IconButton key={item.name} item={item} selected={item.name === value} color={color} sheet={place.sheet} onPick={pick} />
            ))}
          </div>
        )}
      </div>
      {onColor ? (
        <div className="mt-2 border-t border-line pt-2">
          <p className="px-0.5 text-[11px] text-neutral-400">색</p>
          <div className="mt-1.5 flex gap-1.5" role="radiogroup" aria-label="색">
            {SWATCHES.map((swatch) => {
              const selected = color === swatch.hex
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={swatch.name}
                  onClick={() => onColor(swatch.hex)}
                  className="size-4 rounded-full"
                  style={{
                    backgroundColor: swatch.hex,
                    boxShadow: selected ? '0 0 0 2px var(--bg), 0 0 0 3px var(--fg)' : undefined,
                  }}
                />
              )
            })}
          </div>
        </div>
      ) : null}
      {place.sheet ? (
        <button type="button" className="btn btn-ghost mt-3 w-full" onClick={close}>
          닫기
        </button>
      ) : null}
    </div>
  ) : null

  return (
    <span className="group/icon inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-label={onColor ? '아이콘과 색' : '아이콘'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpen(true))}
        className={plain ? 'inline-flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-hover' : 'icon-btn border border-line'}
        style={color ? { color } : undefined}
      >
        <Current className="size-4" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {plain && color ? (
        <span
          aria-hidden="true"
          className={
            open
              ? 'ml-1.5 size-1.5 shrink-0 rounded-full'
              : 'ml-0 size-0 shrink-0 rounded-full opacity-0 group-hover/icon:ml-1.5 group-hover/icon:size-1.5 group-hover/icon:opacity-100'
          }
          style={{ backgroundColor: color }}
        />
      ) : null}
      {open && place ? createPortal(place.sheet ? <div className="fixed inset-0 z-50 flex items-end bg-black/20">{panel}</div> : panel, document.body) : null}
    </span>
  )
}
