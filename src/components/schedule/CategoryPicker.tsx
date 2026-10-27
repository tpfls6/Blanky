import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { IconView } from '../../constants/icons.ts'
import type { WorkspaceCategory } from '../../types/work.ts'
import { categoryPath } from '../../utils/work.ts'

type CategoryPickerProps = {
  categories: WorkspaceCategory[]
  value: string | null
  onChange: (id: string | null) => void
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

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])


  const choose = (id: string | null) => {
    onChange(id || null)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button data-theme-slot="button"
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {setActive(0);setOpen(valueNow=>!valueNow)}}
        className="field flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 text-neutral-400" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu absolute z-20 mt-1 w-56 p-1.5">
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
          <div id={listId} role="listbox" aria-label="카테고리" className="mt-1 max-h-56 overflow-y-auto">
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
        </div>
      ) : null}
    </div>
  )
}
