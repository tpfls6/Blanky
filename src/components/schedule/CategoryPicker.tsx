import { useEffect, useId, useMemo, useRef, useState } from 'react'
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

  useEffect(() => {
    setActive(0)
  }, [query, open])

  const choose = (id: string | null) => {
    onChange(id || null)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((valueNow) => !valueNow)}
        className="text-sm text-neutral-700 hover:text-neutral-900"
      >
        {label}
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-56 rounded-md border border-neutral-100 bg-white p-2 shadow-sm">
          <input
            ref={inputRef}
            value={query}
            aria-label="카테고리 검색"
            aria-controls={listId}
            aria-activedescendant={options[active] ? `${listId}-${options[active].id}` : undefined}
            placeholder="검색"
            onChange={(event) => setQuery(event.target.value)}
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
            className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
          />
          <div id={listId} role="listbox" aria-label="카테고리" className="mt-1 max-h-56 overflow-y-auto">
            {options.map((option, index) => (
              <button
                key={option.id}
                id={`${listId}-${option.id}`}
                type="button"
                role="option"
                aria-selected={option.id === '' ? value === null : value === option.id}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option.id)}
                className={[
                  'block w-full py-1 text-left text-sm',
                  option.depth === 1 ? 'pl-4' : 'px-1',
                  index === active ? 'text-neutral-900' : 'text-neutral-600',
                ].join(' ')}
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
