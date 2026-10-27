import { useState, type ReactNode } from 'react'
import { EyeOff, Trash2 } from 'lucide-react'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import {
  BLOCK_LABEL,
  LAYOUT_TYPES,
  dropBlock,
  isRequiredType,
  patchBlock,
  resolveGap,
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

function LayoutBlock({ block }: { block: PageBlock }) {
  const [open, setOpen] = useState(true)
  if (block.type === 'heading') return <h2 className="text-lg font-medium">{block.text}</h2>
  if (block.type === 'text') return <p className="text-sm whitespace-pre-wrap text-neutral-700">{block.text}</p>
  if (block.type === 'divider') return <hr className="border-line" />
  if (block.type === 'spacer') return <div className="h-6" aria-hidden="true" />
  if (block.type === 'callout') {
    return (
      <div className="rounded-md bg-accent-light px-3 py-2 text-sm text-neutral-800">
        <p className="whitespace-pre-wrap">{block.text}</p>
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
        {title}
      </button>
      <div className="fold" style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}>
        <div>
          {body ? <p className="mt-1 pl-4 text-sm whitespace-pre-wrap text-neutral-600">{body}</p> : null}
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
  const { pageGaps } = useLibrary()
  const gap = resolveGap(pageId, pageGaps)
  const visible = blocks.filter((block) => !block.hidden || isRequiredType(pageId, block.type))
  const hidden = blocks.filter((block) => !isRequiredType(pageId, block.type) && block.hidden)
  const change = (next: PageBlock[]) => onChange?.(next)

  const bodyOf = (block: PageBlock) => {
    const bare = block.type === 'date-header' || block.type === 'quick-input' || block.type === 'page-body'
    const required = isRequiredType(pageId, block.type)
    const inner = isLayout(block.type) ? <LayoutBlock block={block} /> : render(block)
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
            {required ? null : (
              <button type="button" aria-label="숨기기" onClick={() => change(dropBlock(blocks, block.id))} className="icon-btn">
                {isLayout(block.type) ? <Trash2 className="size-3.5" strokeWidth={1.5} /> : <EyeOff className="size-3.5" strokeWidth={1.5} />}
              </button>
            )}
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
    <div
      className={tightHeader ? 'relative z-20 grid grid-cols-1 items-center overflow-visible lg:grid-cols-[auto_minmax(0,1fr)]' : 'grid grid-cols-1 items-start lg:grid-cols-3'}
      style={{ gap }}
    >
      {list.map((block) => (
        <div key={block.id} className={tightHeader ? 'min-w-0' : spanClass(block.span)}>
          {bodyOf(block)}
        </div>
      ))}
    </div>
  )

  return (
    <div className="w-full px-4 py-4 md:px-6 md:py-5">
      {editing ? (
        <Sortable
          items={visible}
          className="grid grid-cols-1 items-start lg:grid-cols-3"
          style={{ gap }}
          itemClassName={(block) => spanClass(block.span)}
          onReorder={(next) => change([...next, ...blocks.filter((block) => !next.some((item) => item.id === block.id))])}
          render={bodyOf}
        />
      ) : (
        <div style={{ display: 'grid', gap }}>
          {header.length > 0 ? grid(header, true) : null}
          {grid(rest, false)}
        </div>
      )}
      {editing && hidden.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
