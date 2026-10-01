import { ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'

type TaskGroupProps = {
  name: string
  count?: number
  depth?: 0 | 1
  children: ReactNode
}

export function TaskGroup({ name, count, depth = 0, children }: TaskGroupProps) {
  const [open, setOpen] = useState(true)

  return (
    <section className={depth === 0 ? 'mt-6' : 'mt-3'}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 py-1 text-left"
      >
        <ChevronRight
          className={[
            'size-3.5 text-neutral-400',
            open ? 'rotate-90' : '',
          ].join(' ')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span
          className={
            depth === 0 ? 'text-sm font-medium text-neutral-900' : 'text-sm text-neutral-600'
          }
        >
          {name}
        </span>
        {count !== undefined ? (
          <span className="text-sm font-normal text-neutral-400">{count}</span>
        ) : null}
      </button>
      {open ? <div className="pl-5">{children}</div> : null}
    </section>
  )
}
