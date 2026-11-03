import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { IconView } from '../../constants/icons.ts'
import type { WorkspaceCategory } from '../../types/work.ts'
import { categoryPath } from '../../utils/work.ts'

type CategoryPickerProps = {
  categories: WorkspaceCategory[]
  value: string | null
  onChange: (id: string | null) => void
}

// Fixed to the viewport so scroll containers and dialogs never clip the menu.
function placeMenu(anchor: DOMRect): CSSProperties {
  const margin = 8
  const gap = 4
  const width = Math.min(Math.max(224, anchor.width), window.innerWidth - margin * 2)
  const left = Math.min(Math.max(anchor.left, margin), window.innerWidth - margin - width)
  const below = window.innerHeight - anchor.bottom - margin - gap
  const above = anchor.top - margin - gap
  const up = below < 260 && above > below
  const maxHeight = Math.min(300, Math.max(140, up ? above : below))
  return { left, width, maxHeight, ...(up ? { bottom: window.innerHeight - anchor.top + gap } : { top: anchor.bottom + gap }) }
}

type Option = {
  id: string
  name: string
  depth: 0 | 1
  keywords: string
}

export function CategoryPicker({ categories, value, onChange }: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties | null>(null)
  const label = categoryPath(value, categories) ?? '카테고리'

  const options = useMemo(() => {
    const parents = categories.filter((category) => category.parentId === null)
    const rows: Option[] = []
    for (const parent of parents) {
      rows.push({ id: parent.id, name: parent.name, depth: 0, keywords: parent.name })
      for (const child of categories.filter((category) => category.parentId === parent.id)) {
        rows.push({
          id: child.id,
          name: child.name,
          depth: 1,
          keywords: `${parent.name} ${child.name}`,
        })
      }
    }
    const text = query.trim().toLocaleLowerCase('ko')
    const none: Option = { id: '', name: '없음', depth: 0, keywords: '' }
    if (!text) return [none, ...rows]
    return rows.filter((option) => option.keywords.toLocaleLowerCase('ko').includes(text))
  }, [categories, query])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) setPlace(placeMenu(rect))
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
    inputRef.current?.focus()
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [ready])


  const choose = (id: string | null) => {
    onChange(id || null)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button data-theme-slot="button"
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {setActive(0);setOpen(valueNow=>!valueNow)}}
        className="field flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-neutral-400" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && place ? createPortal(
        <div ref={menuRef} className="menu fixed z-[60] flex flex-col p-1.5" style={place}>
          <input data-theme-slot="input"
            ref={inputRef}
            value={query}
            aria-label="카테고리 검색"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
            placeholder="검색"
            onChange={(event) => {setQuery(event.target.value);setActive(0)}}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setOpen(false)
                return
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => Math.min(index + 1, Math.max(options.length - 1, 0)))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => Math.max(index - 1, 0))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                event.stopPropagation()
                const option = options[active]
                if (option) choose(option.id)
              }
            }}
            className="field w-full"
          />
          <div id={listId} role="listbox" aria-label="카테고리" className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {options.map((option, index) => {
              const selected = option.id === '' ? value === null : value === option.id
              const category = categories.find((item) => item.id === option.id)
              return (
              <button data-theme-slot="button"
                key={option.id}
                id={`${listId}-${option.id}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
                className={[
                  'block w-full rounded-md py-1 text-left text-sm transition-colors duration-150',
                  option.depth === 1 ? 'pl-4' : 'px-2',
                  index === active || selected ? 'bg-accent-light text-accent-text' : 'text-neutral-600',
                ].join(' ')}
              >
                {category ? (
                  <IconView name={category.icon} className="mr-1.5 inline size-3.5 align-middle" style={{ color: category.color || '#737373' }} />
                ) : null}
                {option.name}
              </button>
              )
            })}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
