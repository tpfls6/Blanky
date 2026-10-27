import { useEffect, useRef, useState } from 'react'
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { useI18n } from '../../i18n/useI18n.ts'
import { filterMenu, type InsertItem } from './catalog.ts'
import {
  convertBlock,
  createBlock,
  duplicateBlock,
  emptyHistory,
  findBlock,
  insertBlock,
  moveBy,
  moveBlock,
  patchBlock,
  pushHistory,
  redo,
  removeBlock,
  setColumnWidth,
  toColumns,
  undo,
  type BuilderBlock,
  type BuilderBlockType,
  type History,
} from './schema.ts'
import { WidgetBlock } from './widgets.tsx'
import type { WidgetType } from './schema.ts'
import { CollectionView } from '../workspace/CollectionView.tsx'
import { createBlock as createField } from '../records/registry.ts'
import { insertBlock as insertField, moveBlock as moveField, patchBlock as patchField, removeBlock as removeField, type BlockType } from '../records/schema.ts'
import { ColorDots } from '../records/properties.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import type { CustomRecordType } from '../../types/records.ts'
import type { DataView } from '../workspace/model.ts'

const CONVERT: { type: BuilderBlockType; level?: 1 | 2 | 3; key: string }[] = [
  { type: 'text', key: 'builder.block.text' },
  { type: 'heading', level: 1, key: 'builder.block.h1' },
  { type: 'heading', level: 2, key: 'builder.block.h2' },
  { type: 'heading', level: 3, key: 'builder.block.h3' },
  { type: 'bullet', key: 'builder.block.bullet' },
  { type: 'numbered', key: 'builder.block.numbered' },
  { type: 'check', key: 'builder.block.check' },
  { type: 'quote', key: 'builder.block.quote' },
  { type: 'callout', key: 'builder.block.callout' },
]

type Menu = { parentId: string | null; index: number; top: number; left: number; replaceId?: string }

export function PageBuilder({
  blocks,
  editing,
  onChange,
}: {
  blocks: BuilderBlock[]
  editing: boolean
  onChange: (blocks: BuilderBlock[]) => void
}) {
  const { t } = useI18n()
  const { recordTypes, addRecordType, updateRecordType } = useLibrary()
  const [settings, setSettings] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null)
  const selected = selectedId ? findBlock(blocks, selectedId)?.block ?? null : null
  const [menu, setMenu] = useState<Menu | null>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [ctx, setCtx] = useState<{ id: string; top: number; left: number } | null>(null)
  const history = useRef<History>(emptyHistory())
  const items = filterMenu(query)

  useEffect(() => {
    if (!menu && !ctx) return
    const close = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-block-menu]')) return
      setMenu(null)
      setCtx(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu, ctx])

  const write = (next: BuilderBlock[], record = true) => {
    if (record) history.current = pushHistory(history.current, blocks)
    onChange(next)
  }

  const insert = (item: InsertItem, parentId: string | null, index: number, replaceId?: string) => {
    const block = item.id === 'collection'
      ? createBlock('collection', {
          collectionId: addRecordType({
            name: t('builder.newCollection'),
            icon: 'StickyNote',
            color: '#3A62B0',
            description: '',
            blocks: [createField('title', { label: t('builder.titleField') })],
          }) ?? '',
          view: 'table',
          span: 3,
        })
      : item.create()
    const base = replaceId ? removeBlock(blocks, replaceId) : blocks
    write(insertBlock(base, block, parentId, index))
    setSelectedId(block.id)
    setMenu(null)
    setQuery('')
    if (item.id === 'collection') setSettings(true)
  }

  const openMenu = (parentId: string | null, index: number, anchor: DOMRect, replaceId?: string) => {
    setQuery('')
    setCursor(0)
    const height = 320
    const top = anchor.bottom + height > window.innerHeight ? Math.max(8, anchor.top - height) : anchor.bottom + 4
    setMenu({ parentId, index, top, left: Math.min(anchor.left, window.innerWidth - 260), replaceId })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!editing) return
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        const next = event.shiftKey ? redo(history.current, blocks) : undo(history.current, blocks)
        history.current = next.history
        onChange(next.blocks)
      } else if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        const next = redo(history.current, blocks)
        history.current = next.history
        onChange(next.blocks)
      } else if (meta && event.key.toLowerCase() === 'd' && selectedId) {
        event.preventDefault()
        write(duplicateBlock(blocks, selectedId))
      } else if (event.altKey && selectedId && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault()
        write(moveBy(blocks, selectedId, event.key === 'ArrowUp' ? -1 : 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div>
      <BlockList
        root={blocks}
        blocks={blocks}
        parentId={null}
        editing={editing}
        selectedId={selectedId}
        onSelect={setSelectedId}
        write={write}
        onMenu={openMenu}
        onContext={(id, rect) => setCtx({ id, top: rect.bottom + 4, left: rect.left })}
        t={t}
      />
      {editing ? (
        <button type="button" className="mt-2 text-sm text-neutral-400" onClick={(event) => openMenu(null, blocks.length, event.currentTarget.getBoundingClientRect())}>
          + {t('builder.addBlock')}
        </button>
      ) : null}
      {menu ? (
        <div className="fixed z-50 w-60" style={{ top: menu.top, left: menu.left }} data-block-menu>
          <SlashMenu items={items} cursor={cursor} query={query} onQuery={(value) => { setQuery(value); setCursor(0) }} onCursor={setCursor} onPick={(item) => insert(item, menu.parentId, menu.index, menu.replaceId)} t={t} />
        </div>
      ) : null}
      {ctx ? (
        <div className="fixed z-50 w-44 rounded-md border border-line bg-surface py-1 shadow-[var(--shadow)]" style={{ top: ctx.top, left: ctx.left }} data-block-menu>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover" onClick={() => { write(duplicateBlock(blocks, ctx.id)); setCtx(null) }}>{t('builder.duplicate')}</button>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover" onClick={() => { write(moveBy(blocks, ctx.id, -1)); setCtx(null) }}>{t('builder.moveUp')}</button>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover" onClick={() => { write(moveBy(blocks, ctx.id, 1)); setCtx(null) }}>{t('builder.moveDown')}</button>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover" onClick={() => { write(toColumns(blocks, ctx.id, 2)); setCtx(null) }}>{t('builder.block.columns2')}</button>
          {CONVERT.map((item) => (
            <button
              key={item.key}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover"
              onClick={() => {
                write(patchBlock(convertBlock(blocks, ctx.id, item.type), ctx.id, item.level ? { level: item.level } : {}))
                setCtx(null)
              }}
            >
              {t(item.key)}
            </button>
          ))}
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-hover" onClick={() => { setSelectedId(ctx.id); setSettings(true); setCtx(null) }}>{t('builder.settings')}</button>
          <button type="button" className="block w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-hover" onClick={() => { write(removeBlock(blocks, ctx.id)); setCtx(null) }}>{t('delete')}</button>
        </div>
      ) : null}
      {settings && selected ? (
        <aside className="mt-4 border-t border-line pt-3 lg:mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t('builder.settings')}</h2>
            <button type="button" className="text-xs text-neutral-400" onClick={() => setSettings(false)}>{t('builder.close')}</button>
          </div>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-neutral-400">{t('builder.background')}</p>
            <ColorDots value={selected.props.background || '#3A62B0'} onChange={(background) => write(patchBlock(blocks, selected.id, { background }), false)} />
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input type="checkbox" checked={selected.props.border === true} onChange={(event) => write(patchBlock(blocks, selected.id, { border: event.target.checked }), false)} />
              {t('builder.border')}
            </label>
          </div>
          {selected.type === 'collection' ? (
            <CollectionFields
              type={recordTypes.find((item) => item.id === selected.props.collectionId) ?? null}
              view={selected.props.view ?? 'table'}
              onView={(view) => write(patchBlock(blocks, selected.id, { view }))}
              onType={updateRecordType}
            />
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}

function SlashMenu({
  items,
  cursor,
  query,
  onQuery,
  onCursor,
  onPick,
  t,
}: {
  items: InsertItem[]
  cursor: number
  query: string
  onQuery: (value: string) => void
  onCursor: (value: number) => void
  onPick: (item: InsertItem) => void
  t: (key: string) => string
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface shadow-[var(--shadow)]">
      <input
        autoFocus
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            onCursor(Math.min(items.length - 1, cursor + 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            onCursor(Math.max(0, cursor - 1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const picked = items[cursor]
            if (picked) onPick(picked)
          }
        }}
        placeholder={t('builder.searchBlock')}
        className="w-full border-b border-line bg-transparent px-3 py-2 text-sm outline-none"
      />
      <div className="max-h-64 overflow-y-auto py-1">
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <button key={item.id} type="button" className={index === cursor ? 'flex w-full items-center gap-2 bg-hover px-3 py-1.5 text-left text-sm' : 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-hover'} onClick={() => onPick(item)}>
              <Icon className="size-4 text-neutral-400" strokeWidth={1.5} />
              {t(item.labelKey)}
            </button>
          )
        })}
        {items.length === 0 ? <p className="px-3 py-2 text-sm text-neutral-400">{t('builder.noBlock')}</p> : null}
      </div>
    </div>
  )
}

function BlockList({
  root,
  blocks,
  parentId,
  editing,
  selectedId,
  onSelect,
  write,
  onMenu,
  onContext,
  t,
}: {
  root: BuilderBlock[]
  blocks: readonly BuilderBlock[]
  parentId: string | null
  editing: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  write: (blocks: BuilderBlock[], record?: boolean) => void
  onMenu: (parentId: string | null, index: number, anchor: DOMRect, replaceId?: string) => void
  onContext: (id: string, rect: DOMRect) => void
  t: (key: string) => string
}) {
  const row = (block: BuilderBlock) => (
    <BlockView root={root} block={block} editing={editing} selected={selectedId === block.id} selectedId={selectedId} onSelect={onSelect} write={write} onMenu={onMenu} onContext={onContext} t={t} />
  )
  if (!editing) return <div>{blocks.map((block) => <div key={block.id}>{row(block)}</div>)}</div>
  return (
    <div>
      <Sortable
        items={blocks}
        onReorder={(next) => {
          const prev = blocks.map((block) => block.id)
          const id = next.map((block) => block.id).find((item, index) => prev[index] !== item)
          if (!id) return
          write(moveBlock(root, id, parentId, next.findIndex((item) => item.id === id)))
        }}
        render={(block) => (
          <div>
            <InsertGap onClick={(rect) => onMenu(parentId, blocks.findIndex((item) => item.id === block.id), rect)} />
            {row(block)}
          </div>
        )}
      />
      <InsertGap onClick={(rect) => onMenu(parentId, blocks.length, rect)} />
    </div>
  )
}

function InsertGap({ onClick }: { onClick: (rect: DOMRect) => void }) {
  return (
    <div className="group/gap relative h-3">
      <button type="button" aria-label="+" onClick={(event) => onClick(event.currentTarget.getBoundingClientRect())} className="absolute top-1/2 left-1 flex size-4 -translate-y-1/2 items-center justify-center rounded text-neutral-300 opacity-100 lg:opacity-0 lg:group-hover/gap:opacity-100">
        <Plus className="size-3.5" strokeWidth={1.5} />
      </button>
    </div>
  )
}

function BlockView({
  root,
  block,
  editing,
  selected,
  selectedId,
  onSelect,
  write,
  onMenu,
  onContext,
  t,
}: {
  root: BuilderBlock[]
  block: BuilderBlock
  editing: boolean
  selected: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  write: (blocks: BuilderBlock[], record?: boolean) => void
  onMenu: (parentId: string | null, index: number, anchor: DOMRect, replaceId?: string) => void
  onContext: (id: string, rect: DOMRect) => void
  t: (key: string) => string
}) {
  const [open, setOpen] = useState(true)
  if (block.type === 'columns') {
    return (
      <div className="my-2 flex flex-col gap-3 md:flex-row">
        {(block.children ?? []).map((column, index) => (
          <div key={column.id} className="relative min-w-0" style={{ flexGrow: column.props.width ?? 50, flexBasis: 0 }}>
            {editing && index > 0 ? <ResizeHandle root={root} columnId={column.id} write={write} /> : null}
            <BlockList root={root} blocks={column.children ?? []} parentId={column.id} editing={editing} selectedId={selectedId} onSelect={onSelect} write={write} onMenu={onMenu} onContext={onContext} t={t} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={['group relative rounded-md py-1 pr-2 pl-7', selected && editing ? 'bg-[color-mix(in_srgb,var(--accent-color)_8%,transparent)]' : ''].join(' ')} onClick={() => onSelect(block.id)}>
      {editing ? <span className="pointer-events-none absolute top-2 left-0 text-neutral-300 opacity-40 lg:opacity-0 lg:group-hover:opacity-100"><GripVertical className="size-4" strokeWidth={1.5} /></span> : null}
      {editing ? (
        <span className="absolute top-1 right-1 hidden gap-1 group-hover:flex">
          <button type="button" aria-label={t('builder.duplicate')} onClick={() => write(duplicateBlock(root, block.id))} className="icon-btn"><Copy className="size-3.5" strokeWidth={1.5} /></button>
          <button type="button" aria-label={t('delete')} onClick={() => write(removeBlock(root, block.id))} className="icon-btn"><Trash2 className="size-3.5" strokeWidth={1.5} /></button>
        </span>
      ) : null}
      <div
        className={block.props.border ? 'rounded-md border border-line p-2' : ''}
        style={{ backgroundColor: block.props.background || undefined, color: block.props.color || undefined }}
        onContextMenu={(event) => { if (!editing) return; event.preventDefault(); onContext(block.id, event.currentTarget.getBoundingClientRect()) }}
      >
        {block.props.hideContent ? <p className="text-xs text-neutral-400">{block.type}</p> : (
          <BlockBody root={root} block={block} editing={editing} open={open} onToggle={() => setOpen((value) => !value)} write={write} onMenu={onMenu} t={t} />
        )}
      </div>
      {block.type === 'toggle' && open ? (
        <div className="mt-1 pl-4">
          <BlockList root={root} blocks={block.children ?? []} parentId={block.id} editing={editing} selectedId={selectedId} onSelect={onSelect} write={write} onMenu={onMenu} onContext={onContext} t={t} />
        </div>
      ) : null}
    </div>
  )
}

function ResizeHandle({ root, columnId, write }: { root: BuilderBlock[]; columnId: string; write: (blocks: BuilderBlock[], record?: boolean) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null)
  return (
    <button
      type="button"
      aria-label="resize"
      className="absolute top-0 -left-1 z-10 hidden h-full w-2 cursor-col-resize md:block"
      onPointerDown={(event) => {
        const found = findBlock(root, columnId)
        start.current = { x: event.clientX, width: found?.block.props.width ?? 50 }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!start.current) return
        write(setColumnWidth(root, columnId, start.current.width + (event.clientX - start.current.x) / 4), false)
      }}
      onPointerUp={() => {
        start.current = null
      }}
    />
  )
}

function BlockBody({
  root,
  block,
  editing,
  open,
  onToggle,
  write,
  onMenu,
  t,
}: {
  root: BuilderBlock[]
  block: BuilderBlock
  editing: boolean
  open: boolean
  onToggle: () => void
  write: (blocks: BuilderBlock[], record?: boolean) => void
  onMenu: (parentId: string | null, index: number, anchor: DOMRect, replaceId?: string) => void
  t: (key: string) => string
}) {
  const text = block.props.text ?? ''
  const found = findBlock(root, block.id)
  const parentId = found?.parent?.id ?? null
  const index = found?.index ?? 0
  const headingClass = block.props.level === 1 ? 'text-2xl font-medium' : block.props.level === 3 ? 'text-base font-medium' : 'text-lg font-medium'
  const prefix = block.type === 'bullet' ? '• ' : block.type === 'numbered' ? '1. ' : ''
  const box = block.type === 'quote' || block.type === 'callout'

  if (block.type === 'collection') return <CollectionBlock root={root} block={block} write={write} />
  if (block.type === 'bookmark' || block.type === 'button') {
    return editing ? (
      <div className="flex gap-2">
        <input value={text} placeholder={t(`builder.block.${block.type}`)} onChange={(event) => write(patchBlock(root, block.id, { text: event.target.value }), false)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <input value={block.props.url ?? ''} placeholder="https://" onChange={(event) => write(patchBlock(root, block.id, { url: event.target.value }), false)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
    ) : block.props.url ? <a href={block.props.url} className={block.type === 'button' ? 'btn btn-primary' : 'text-sm underline'} target="_blank" rel="noreferrer">{text || block.props.url}</a> : null
  }
  if (block.type.startsWith('widget-')) {
    const key = block.type.replace('widget-', '')
    return (
      <div>
        {editing ? <p className="mb-1 text-[11px] text-neutral-400">{t(`builder.block.${key}`)}</p> : null}
        <WidgetBlock type={block.type as WidgetType} />
      </div>
    )
  }
  if (block.type === 'divider') return <hr className="my-2 border-line" />
  if (block.type === 'image') {
    return editing ? (
      <input value={block.props.url ?? ''} placeholder={t('builder.imageUrl')} onChange={(event) => write(patchBlock(root, block.id, { url: event.target.value }), false)} className="w-full bg-transparent text-sm outline-none" />
    ) : block.props.url ? <img src={block.props.url} alt={block.props.alt ?? ''} className="max-h-80 rounded-md" /> : null
  }
  if (block.type === 'link') {
    return editing ? (
      <div className="flex gap-2">
        <input value={text} placeholder={t('builder.block.link')} onChange={(event) => write(patchBlock(root, block.id, { text: event.target.value }), false)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        <input value={block.props.url ?? ''} placeholder="https://" onChange={(event) => write(patchBlock(root, block.id, { url: event.target.value }), false)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </div>
    ) : block.props.url ? <a href={block.props.url} className="text-sm underline" target="_blank" rel="noreferrer">{text || block.props.url}</a> : null
  }
  if (block.type === 'toggle') {
    return (
      <button type="button" onClick={onToggle} className="flex items-center gap-1 text-sm font-medium">
        <span className="chevron text-neutral-400" style={{ transform: open ? 'rotate(90deg)' : undefined }}>›</span>
        {editing ? <input value={text} onClick={(event) => event.stopPropagation()} onChange={(event) => write(patchBlock(root, block.id, { text: event.target.value }), false)} className="bg-transparent outline-none" /> : text || t('builder.block.toggle')}
      </button>
    )
  }
  if (!editing) {
    if (block.type === 'check') return <p className="text-sm"><span className="mr-2">{block.props.checked ? '☑' : '☐'}</span>{text}</p>
    if (!text.trim() && !prefix) return null
    return <p className={block.type === 'heading' ? headingClass : box ? 'rounded-md bg-accent-light px-3 py-2 text-sm whitespace-pre-wrap' : 'text-sm whitespace-pre-wrap'}>{prefix}{text}</p>
  }
  return (
    <div className="flex items-start gap-2">
      {block.type === 'check' ? (
        <input type="checkbox" checked={block.props.checked === true} onChange={(event) => write(patchBlock(root, block.id, { checked: event.target.checked }), false)} className="mt-1" />
      ) : prefix ? <span className="mt-1 text-neutral-400">{prefix}</span> : null}
      <textarea
        value={text}
        rows={1}
        placeholder={t('builder.typeOrSlash')}
        onChange={(event) => {
          const value = event.target.value
          if (value === '/') {
            onMenu(parentId, index, event.currentTarget.getBoundingClientRect(), block.id)
            return
          }
          write(patchBlock(root, block.id, { text: value }), false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            const created = createBlock(block.type === 'heading' ? 'text' : block.type)
            write(insertBlock(root, created, parentId, index + 1))
          }
          if (event.key === 'Backspace' && text === '') {
            event.preventDefault()
            write(removeBlock(root, block.id))
          }
        }}
        className={`w-full resize-none bg-transparent outline-none placeholder:text-neutral-300 ${block.type === 'heading' ? headingClass : box ? 'rounded-md bg-accent-light px-3 py-2 text-sm' : 'text-sm'}`}
      />
    </div>
  )
}

function CollectionBlock({ root, block, write }: { root: BuilderBlock[]; block: BuilderBlock; write: (blocks: BuilderBlock[], record?: boolean) => void }) {
  const { t } = useI18n()
  const { recordTypes, records, addRecord, updateRecord, removeRecord } = useLibrary()
  const type = recordTypes.find((item) => item.id === block.props.collectionId)
  if (!type) return <p className="text-sm text-neutral-400">{t('builder.missingCollection')}</p>
  return (
    <CollectionView
      type={type}
      rows={records.filter((item) => item.typeId === type.id)}
      view={block.props.view ?? 'table'}
      onView={(view) => write(patchBlock(root, block.id, { view }))}
      onAdd={(input) => addRecord(type.id, input)}
      onUpdate={updateRecord}
      onRemove={removeRecord}
    />
  )
}

const FIELD_TYPES: { type: BlockType; label: string }[] = [
  { type: 'textField', label: '텍스트' },
  { type: 'number', label: '숫자' },
  { type: 'date', label: '날짜' },
  { type: 'checkbox', label: '체크박스' },
  { type: 'url', label: 'URL' },
  { type: 'image', label: '이미지' },
  { type: 'rating', label: '별점' },
  { type: 'progress', label: '진행률' },
  { type: 'tags', label: '태그' },
  { type: 'longText', label: '긴 텍스트' },
]

function CollectionFields({
  type,
  view,
  onView,
  onType,
}: {
  type: CustomRecordType | null
  view: DataView
  onView: (view: DataView) => void
  onType: (id: string, patch: Partial<Pick<CustomRecordType, 'name' | 'blocks'>>) => void
}) {
  const { t } = useI18n()
  if (!type) return <p className="mt-4 text-sm text-neutral-400">{t('builder.missingCollection')}</p>
  const fields = type.blocks.filter((item) => item.type !== 'title')
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-xs text-neutral-500">
        {t('builder.collectionName')}
        <input value={type.name} onChange={(event) => onType(type.id, { name: event.target.value })} className="field mt-1 w-full" />
      </label>
      <div className="flex flex-wrap gap-1">
        {(['table', 'card', 'gallery', 'calendar', 'kanban', 'chart'] as DataView[]).map((item) => (
          <button key={item} type="button" className={view === item ? 'chip chip-on' : 'chip'} onClick={() => onView(item)}>{item}</button>
        ))}
      </div>
      <ul className="space-y-2">
        {fields.map((field, index) => (
          <li key={field.id} className="flex items-center gap-1">
            <input value={field.props.label ?? ''} onChange={(event) => onType(type.id, { blocks: patchField(type.blocks, field.id, { label: event.target.value }) })} className="field min-w-0 flex-1 text-xs" />
            <button type="button" className="text-xs text-neutral-400" disabled={index === 0} onClick={() => onType(type.id, { blocks: moveField(type.blocks, field.id, null, index - 1) })}>↑</button>
            <button type="button" className="text-xs text-neutral-400" onClick={() => onType(type.id, { blocks: moveField(type.blocks, field.id, null, index + 2) })}>↓</button>
            <button type="button" className="text-xs text-neutral-400" onClick={() => onType(type.id, { blocks: removeField(type.blocks, field.id) })}>{t('delete')}</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1">
        {FIELD_TYPES.map((item) => (
          <button key={item.type} type="button" className="chip" onClick={() => onType(type.id, { blocks: insertField(type.blocks, createField(item.type), null, type.blocks.length) })}>+ {item.label}</button>
        ))}
      </div>
    </div>
  )
}
