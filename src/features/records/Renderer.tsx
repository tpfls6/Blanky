import { useState } from 'react'
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { BlockBody } from './view.tsx'
import type { Block, BlockProps, FieldValue, RenderMode } from './schema.ts'

export function CustomRecordRenderer({
  blocks,
  mode,
  values,
  onValue,
  selectedId,
  onSelect,
  onProps,
  onMove,
  onRemove,
  onDuplicate,
  onRequestInsert,
}: {
  blocks: readonly Block[]
  mode: RenderMode
  values: Record<string, FieldValue>
  onValue?: (key: string, value: FieldValue) => void
  selectedId?: string | null
  onSelect?: (id: string) => void
  onProps?: (id: string, patch: Partial<BlockProps>) => void
  onMove?: (id: string, parentId: string | null, index: number) => void
  onRemove?: (id: string) => void
  onDuplicate?: (id: string) => void
  onRequestInsert?: (parentId: string | null, index: number, anchor: DOMRect) => void
}) {
  return (
    <BlockList
      blocks={blocks}
      parentId={null}
      mode={mode}
      values={values}
      onValue={onValue}
      selectedId={selectedId ?? null}
      onSelect={onSelect}
      onProps={onProps}
      onMove={onMove}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
      onRequestInsert={onRequestInsert}
    />
  )
}

function BlockList({
  blocks,
  parentId,
  mode,
  values,
  onValue,
  selectedId,
  onSelect,
  onProps,
  onMove,
  onRemove,
  onDuplicate,
  onRequestInsert,
}: {
  blocks: readonly Block[]
  parentId: string | null
  mode: RenderMode
  values: Record<string, FieldValue>
  onValue?: (key: string, value: FieldValue) => void
  selectedId: string | null
  onSelect?: (id: string) => void
  onProps?: (id: string, patch: Partial<BlockProps>) => void
  onMove?: (id: string, parentId: string | null, index: number) => void
  onRemove?: (id: string) => void
  onDuplicate?: (id: string) => void
  onRequestInsert?: (parentId: string | null, index: number, anchor: DOMRect) => void
}) {
  const editing = mode === 'edit-template'
  if (!editing) {
    return (
      <div className={parentId ? 'mt-2 border-l border-line pl-3' : ''}>
        {blocks.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            mode={mode}
            values={values}
            selected={selectedId === block.id}
            onValue={onValue}
            onSelect={onSelect}
            onProps={onProps}
            onMove={onMove}
            onRemove={onRemove}
            onDuplicate={onDuplicate}
            onRequestInsert={onRequestInsert}
            selectedId={selectedId}
          />
        ))}
      </div>
    )
  }
  const reorder = (next: readonly Block[]) => {
    const prev = blocks.map((block) => block.id)
    const ids = next.map((block) => block.id)
    const id = ids.find((item, index) => prev[index] !== item)
    if (!id) return
    onMove?.(id, parentId, ids.indexOf(id))
  }
  return (
    <div className={parentId ? 'mt-2 border-l border-line pl-3' : ''}>
      <Sortable
        items={blocks}
        onReorder={reorder}
        render={(block) => (
          <div>
            <InsertGap parentId={parentId} index={blocks.indexOf(block)} onRequestInsert={onRequestInsert} />
            <BlockRow
              block={block}
              mode={mode}
              values={values}
              selected={selectedId === block.id}
              onValue={onValue}
              onSelect={onSelect}
              onProps={onProps}
              onMove={onMove}
              onRemove={onRemove}
              onDuplicate={onDuplicate}
              onRequestInsert={onRequestInsert}
              selectedId={selectedId}
            />
          </div>
        )}
      />
      <InsertGap parentId={parentId} index={blocks.length} onRequestInsert={onRequestInsert} />
    </div>
  )
}

function InsertGap({
  parentId,
  index,
  onRequestInsert,
}: {
  parentId: string | null
  index: number
  onRequestInsert?: (parentId: string | null, index: number, anchor: DOMRect) => void
}) {
  return (
    <div className="group/gap relative h-3">
      <button
        type="button"
        aria-label="블록 추가"
        onClick={(event) => onRequestInsert?.(parentId, index, event.currentTarget.getBoundingClientRect())}
        className="absolute top-1/2 left-1 flex size-4 -translate-y-1/2 items-center justify-center rounded text-neutral-300 opacity-100 lg:opacity-0 lg:group-hover/gap:opacity-100"
      >
        <Plus className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  )
}

function BlockRow({
  block,
  mode,
  values,
  selected,
  selectedId,
  onValue,
  onSelect,
  onProps,
  onMove,
  onRemove,
  onDuplicate,
  onRequestInsert,
}: {
  block: Block
  mode: RenderMode
  values: Record<string, FieldValue>
  selected: boolean
  selectedId: string | null
  onValue?: (key: string, value: FieldValue) => void
  onSelect?: (id: string) => void
  onProps?: (id: string, patch: Partial<BlockProps>) => void
  onMove?: (id: string, parentId: string | null, index: number) => void
  onRemove?: (id: string) => void
  onDuplicate?: (id: string) => void
  onRequestInsert?: (parentId: string | null, index: number, anchor: DOMRect) => void
}) {
  const [open, setOpen] = useState(mode === 'edit-template' || block.props.defaultOpen === true)
  const editing = mode === 'edit-template'
  const value = block.fieldKey ? values[block.fieldKey] : undefined
  return (
    <div>
      <div
        className={[
          'group relative rounded-md py-1 pr-2 pl-7',
          selected ? 'bg-[color-mix(in_srgb,var(--accent-color)_8%,transparent)]' : '',
        ].join(' ')}
        onClick={() => onSelect?.(block.id)}
      >
        {editing ? (
          <span className="pointer-events-none absolute top-2 left-0 text-neutral-300 opacity-40 lg:opacity-0 lg:group-hover:opacity-100" aria-hidden="true">
            <GripVertical className="size-4" strokeWidth={1.5} />
          </span>
        ) : null}
        {editing && block.type !== 'title' ? (
          <span className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
            <button type="button" aria-label="블록 복제" onClick={() => onDuplicate?.(block.id)} className="text-neutral-300">
              <Copy className="size-3.5" strokeWidth={1.5} />
            </button>
            <button type="button" aria-label="블록 삭제" onClick={() => onRemove?.(block.id)} className="text-neutral-300">
              <Trash2 className="size-3.5" strokeWidth={1.5} />
            </button>
          </span>
        ) : null}
        <BlockBody
          ctx={{
            block,
            mode,
            value,
            setValue: (next) => {
              if (block.fieldKey) onValue?.(block.fieldKey, next)
            },
            onProps: (patch) => onProps?.(block.id, patch),
            open,
            onToggle: () => setOpen((current) => !current),
          }}
        />
      </div>
      {block.type === 'toggle' ? (
        <div className="fold" style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}>
          <div>
        <BlockList
          blocks={block.children ?? []}
          parentId={block.id}
          mode={mode}
          values={values}
          onValue={onValue}
          selectedId={selectedId}
          onSelect={onSelect}
          onProps={onProps}
          onMove={onMove}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onRequestInsert={onRequestInsert}
        />
          </div>
        </div>
      ) : null}
    </div>
  )
}
