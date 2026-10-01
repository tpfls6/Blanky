import { useState, type ReactNode } from 'react'
import { EyeOff, Plus, Trash2 } from 'lucide-react'
import { Sortable } from '../../components/drag/Sortable.tsx'
import {
  BLOCK_LABEL,
  LAYOUT_TYPES,
  addBlock,
  catalog,
  dropBlock,
  patchBlock,
  type BlockType,
  type PageBlock,
  type PageId,
  type Span,
} from './layout.ts'

function spanClass(span: Span): string {
  if (span === 3) return 'lg:col-span-3'
  if (span === 2) return 'lg:col-span-2'
  return 'lg:col-span-1'
}

function LayoutBlock({
  block,
  editing,
  onText,
}: {
  block: PageBlock
  editing: boolean
  onText: (text: string) => void
}) {
  const [open, setOpen] = useState(true)
  if (block.type === 'heading') {
    return editing ? (
      <input value={block.text} onChange={(event) => onText(event.target.value)} className="w-full bg-transparent text-lg font-medium outline-none" />
    ) : (
      <h2 className="text-lg font-medium">{block.text}</h2>
    )
  }
  if (block.type === 'text') {
    return editing ? (
      <textarea value={block.text} onChange={(event) => onText(event.target.value)} placeholder="텍스트" className="min-h-16 w-full resize-y bg-transparent text-sm outline-none" />
    ) : (
      <p className="text-sm whitespace-pre-wrap text-neutral-700">{block.text}</p>
    )
  }
  if (block.type === 'divider') return <hr className="border-line" />
  if (block.type === 'spacer') return <div className="h-6" aria-hidden="true" />
  if (block.type === 'callout') {
    return (
      <div className="rounded-md bg-accent-light px-3 py-2 text-sm text-neutral-800">
        {editing ? (
          <textarea value={block.text} onChange={(event) => onText(event.target.value)} className="min-h-12 w-full resize-y bg-transparent outline-none" />
        ) : (
          <p className="whitespace-pre-wrap">{block.text}</p>
        )}
      </div>
    )
  }
  const [title, ...rest] = (block.text || '토글').split('\n')
  const body = rest.join('\n')
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-1 text-sm font-medium" aria-expanded={open}>
        <span className="chevron inline-block text-neutral-400" style={{ transform: open ? 'rotate(90deg)' : undefined }}>
          ›
        </span>
        {editing ? (
          <input
            value={title}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onText(`${event.target.value}\n${body}`)}
            className="bg-transparent outline-none"
          />
        ) : (
          title
        )}
      </button>
      <div className="fold" style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}>
        <div>
          {editing ? (
            <textarea
              value={body}
              onChange={(event) => onText(`${title}\n${event.target.value}`)}
              placeholder="내용"
              className="mt-2 min-h-12 w-full resize-y bg-transparent text-sm outline-none"
            />
          ) : body ? (
            <p className="mt-1 pl-4 text-sm whitespace-pre-wrap text-neutral-600">{body}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function isLayout(type: BlockType): boolean {
  return (LAYOUT_TYPES as readonly string[]).includes(type)
}

export function PageCanvas({
  pageId,
  editing = false,
  blocks,
  onChange,
  render,
}: {
  pageId: PageId
  editing?: boolean
  blocks: PageBlock[]
  onChange?: (blocks: PageBlock[]) => void
  render: (block: PageBlock) => ReactNode
}) {
  const [menu, setMenu] = useState(false)
  const visible = blocks.filter((block) => !block.hidden)
  const hidden = blocks.filter((block) => block.hidden)
  const change = (next: PageBlock[]) => onChange?.(next)

  const bodyOf = (block: PageBlock) => {
    const bare = block.type === 'date-header' || block.type === 'quick-input' || block.type === 'page-body'
    const inner = isLayout(block.type) ? (
      <LayoutBlock block={block} editing={editing} onText={(text) => change(patchBlock(blocks, block.id, { text }))} />
    ) : (
      render(block)
    )
    return (
      <section className={bare ? 'min-w-0' : 'panel min-w-0'}>
        {editing ? (
          <div className="mb-2 flex items-center gap-1 text-[11px] text-neutral-400">
            <span className="min-w-0 flex-1 truncate">{BLOCK_LABEL[block.type]}</span>
            {([1, 2, 3] as const).map((span) => (
              <button
                key={span}
                type="button"
                aria-label={`너비 ${span}`}
                aria-pressed={block.span === span}
                onClick={() => change(patchBlock(blocks, block.id, { span }))}
                className={block.span === span ? 'chip chip-on px-1.5' : 'chip px-1.5'}
              >
                {span}
              </button>
            ))}
            <button type="button" aria-label="숨기기" onClick={() => change(dropBlock(blocks, block.id))} className="icon-btn">
              {isLayout(block.type) ? <Trash2 className="size-3.5" strokeWidth={1.5} /> : <EyeOff className="size-3.5" strokeWidth={1.5} />}
            </button>
          </div>
        ) : null}
        {inner}
      </section>
    )
  }

  const tight =
    !editing &&
    visible[0]?.type === 'date-header' &&
    visible[1]?.type === 'quick-input' &&
    visible[0].span === 1 &&
    visible[1].span === 2
  const header = tight ? visible.slice(0, 2) : []
  const rest = tight ? visible.slice(2) : visible

  const grid = (list: PageBlock[], tightHeader: boolean) => (
    <div className={tightHeader ? 'relative z-20 grid grid-cols-1 items-center gap-3 overflow-visible lg:grid-cols-[auto_minmax(0,1fr)]' : 'grid grid-cols-1 items-start gap-4 lg:grid-cols-3'}>
      {list.map((block) => (
        <div key={block.id} className={tightHeader ? 'min-w-0' : spanClass(block.span)}>
          {bodyOf(block)}
        </div>
      ))}
    </div>
  )

  const offered = catalog(pageId).filter((type) => {
    if (isLayout(type)) return true
    return !blocks.some((block) => block.type === type && !block.hidden)
  })

  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-5">
      {editing ? (
        <Sortable
          items={visible}
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3"
          itemClassName={(block) => spanClass(block.span)}
          onReorder={(next) => change([...next, ...hidden])}
          render={bodyOf}
        />
      ) : (
        <div className="space-y-4">
          {header.length > 0 ? grid(header, true) : null}
          {grid(rest, false)}
        </div>
      )}
      {editing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" className="btn btn-line" onClick={() => setMenu((value) => !value)}>
              <Plus className="size-3.5" strokeWidth={1.5} />
              블록 추가
            </button>
            {menu ? (
              <div className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-44 overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-[var(--shadow)]">
                {offered.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover"
                    onClick={() => {
                      change(addBlock(blocks, type))
                      setMenu(false)
                    }}
                  >
                    {BLOCK_LABEL[type]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {hidden.map((block) => (
            <button
              key={block.id}
              type="button"
              className="chip"
              onClick={() => change(patchBlock(blocks, block.id, { hidden: false }))}
            >
              {BLOCK_LABEL[block.type]} 표시
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
