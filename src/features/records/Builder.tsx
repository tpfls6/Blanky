import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { InlineName } from '../../components/common/InlineName.tsx'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { IconView } from '../../constants/icons.ts'
import { CustomRecordRenderer } from './Renderer.tsx'
import { BlockProperties, ColorDots } from './properties.tsx'
import { filterMenu, groupLabel, INSERT_MENU, type InsertItem, type MenuGroup } from './registry.ts'
import {
  blankValues,
  duplicateBlock,
  findBlock,
  insertBlock,
  moveBlock,
  patchBlock,
  removeBlock,
  type Block,
  type CustomRecordType,
  type FieldValue,
} from './schema.ts'

const GROUPS: MenuGroup[] = ['basic', 'fields', 'layout']

export function RecordBuilder({
  type,
  onBack,
  onChange,
}: {
  type: CustomRecordType
  onBack: () => void
  onChange: (patch: Partial<Pick<CustomRecordType, 'name' | 'icon' | 'color' | 'description' | 'blocks'>>) => void
}) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [selectedId, setSelectedId] = useState<string | null>(type.blocks[0]?.id ?? null)
  const [name, setName] = useState(type.name)
  const [description, setDescription] = useState(type.description)
  const [colorOpen, setColorOpen] = useState(false)
  const [previewValues, setPreviewValues] = useState<Record<string, FieldValue>>({})
  const [menu, setMenu] = useState<{ parentId: string | null; index: number; top: number; left: number } | null>(null)
  const [slash, setSlash] = useState('')
  const [cursor, setCursor] = useState(0)
  const selected = selectedId ? findBlock(type.blocks, selectedId)?.block ?? null : null
  const slashQuery = slash.startsWith('/') ? slash.slice(1) : ''
  const slashItems = slash.startsWith('/') ? filterMenu(slashQuery, false) : []

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-block-menu]')) return
      setMenu(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const writeBlocks = (blocks: readonly Block[]) => onChange({ blocks: [...blocks] })

  const insert = (block: Block, parentId: string | null, index: number) => {
    writeBlocks(insertBlock(type.blocks, block, parentId, index))
    setSelectedId(block.id)
    setMenu(null)
    setSlash('')
  }

  const openMenu = (parentId: string | null, index: number, anchor: DOMRect) => {
    const height = 320
    const top = anchor.bottom + height > window.innerHeight ? Math.max(8, anchor.top - height) : anchor.bottom + 4
    setMenu({ parentId, index, top, left: Math.min(anchor.left, window.innerWidth - 240) })
    setCursor(0)
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-surface md:left-52">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-neutral-500">
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          기록 유형
        </button>
        <div className="flex gap-1" role="tablist" aria-label="편집 모드">
          <button type="button" role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')} className={tab === 'edit' ? 'chip chip-on' : 'chip'}>
            편집
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'preview'}
            onClick={() => {
              setPreviewValues(blankValues(type.blocks))
              setTab('preview')
              setMenu(null)
            }}
            className={tab === 'preview' ? 'chip chip-on' : 'chip'}
          >
            미리보기
          </button>
        </div>
        <span className="text-xs text-neutral-300">자동 저장</span>
      </header>
      {tab === 'preview' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PageFrame type={type} name={type.name} description={type.description} editing={false}>
            <CustomRecordRenderer blocks={type.blocks} mode="fill-record" values={previewValues} onValue={(key, value) => setPreviewValues((current) => ({ ...current, [key]: value }))} />
            <p className="mt-6 text-xs text-neutral-400">미리보기는 저장되지 않습니다.</p>
          </PageFrame>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[12.5rem_minmax(0,1fr)_17rem]">
          <aside className="hidden overflow-y-auto border-r border-line px-2 py-3 lg:block">
            {GROUPS.map((group) => (
              <div key={group}>
                <p className="px-2 pt-3 pb-1 text-[11px] text-neutral-400">{groupLabel(group)}</p>
                {INSERT_MENU.filter((entry) => entry.group === group).map((entry) => {
                  const Icon = entry.icon
                  return (
                    <button
                      key={entry.label}
                      type="button"
                      onClick={() => insert(entry.create(), null, type.blocks.length)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-neutral-600 hover:bg-hover"
                    >
                      <Icon className="size-4" strokeWidth={1.5} />
                      {entry.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </aside>
          <div className="min-h-0 overflow-y-auto">
            <PageFrame
              type={type}
              name={name}
              description={description}
              editing
              colorOpen={colorOpen}
              onName={(value) => {
                setName(value)
                onChange({ name: value })
              }}
              onDescription={(value) => {
                setDescription(value)
                onChange({ description: value })
              }}
              onIcon={(icon) => onChange({ icon })}
              onColor={(color) => onChange({ color })}
              onToggleColor={() => setColorOpen((current) => !current)}
            >
              <CustomRecordRenderer
                blocks={type.blocks}
                mode="edit-template"
                values={{}}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onProps={(id, patch) => writeBlocks(patchBlock(type.blocks, id, patch))}
                onMove={(id, parentId, index) => writeBlocks(moveBlock(type.blocks, id, parentId, index))}
                onRemove={(id) => {
                  writeBlocks(removeBlock(type.blocks, id))
                  if (selectedId === id) setSelectedId(null)
                }}
                onDuplicate={(id) => writeBlocks(duplicateBlock(type.blocks, id))}
                onRequestInsert={openMenu}
              />
              <div className="relative mt-4">
                <input
                  value={slash}
                  onChange={(event) => {
                    setSlash(event.target.value)
                    setCursor(0)
                  }}
                  onKeyDown={(event) => {
                    if (!slash.startsWith('/')) return
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      setCursor((current) => Math.min(slashItems.length - 1, current + 1))
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      setCursor((current) => Math.max(0, current - 1))
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      const picked = slashItems[cursor]
                      if (picked) insert(picked.create(), null, type.blocks.length)
                    } else if (event.key === 'Escape') {
                      setSlash('')
                    }
                  }}
                  placeholder="블록을 추가하거나 / 를 입력"
                  aria-label="슬래시 명령"
                  className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-neutral-300"
                />
                {slash.startsWith('/') ? (
                  <div className="absolute top-8 left-0 z-50" data-block-menu>
                    <MenuList items={slashItems} cursor={cursor} onPick={(entry) => insert(entry.create(), null, type.blocks.length)} />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="mt-2 text-sm text-neutral-400"
                onClick={(event) => openMenu(null, type.blocks.length, event.currentTarget.getBoundingClientRect())}
              >
                + 블록 추가
              </button>
              {selected ? (
                <div className="mt-8 border-t border-line pt-4 lg:hidden">
                  <BlockProperties
                    block={selected}
                    onChange={(patch) => writeBlocks(patchBlock(type.blocks, selected.id, patch))}
                    onRemove={() => {
                      writeBlocks(removeBlock(type.blocks, selected.id))
                      setSelectedId(null)
                    }}
                    onDuplicate={() => writeBlocks(duplicateBlock(type.blocks, selected.id))}
                  />
                </div>
              ) : null}
            </PageFrame>
          </div>
          <aside className="hidden overflow-y-auto border-l border-line p-4 lg:block">
            <p className="pb-3 text-xs text-neutral-400">속성</p>
            {selected ? (
              <BlockProperties
                block={selected}
                onChange={(patch) => writeBlocks(patchBlock(type.blocks, selected.id, patch))}
                onRemove={() => {
                  writeBlocks(removeBlock(type.blocks, selected.id))
                  setSelectedId(null)
                }}
                onDuplicate={() => writeBlocks(duplicateBlock(type.blocks, selected.id))}
              />
            ) : (
              <p className="text-sm text-neutral-400">블록을 선택하면 설정이 나타납니다.</p>
            )}
          </aside>
        </div>
      )}
      {menu ? (
        <div className="fixed z-50 w-56" style={{ top: menu.top, left: menu.left }} data-block-menu>
          <MenuSearch
            nested={menu.parentId !== null}
            onPick={(entry) => insert(entry.create(), menu.parentId, menu.index)}
            onClose={() => setMenu(null)}
          />
        </div>
      ) : null}
    </div>
  )
}

function PageFrame({
  type,
  name,
  description,
  editing,
  colorOpen,
  onName,
  onDescription,
  onIcon,
  onColor,
  onToggleColor,
  children,
}: {
  type: CustomRecordType
  name: string
  description: string
  editing: boolean
  colorOpen?: boolean
  onName?: (value: string) => void
  onDescription?: (value: string) => void
  onIcon?: (icon: string) => void
  onColor?: (color: string) => void
  onToggleColor?: () => void
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-xl px-6 py-8">
      <div className="mb-6 flex items-start gap-3">
        {editing && onIcon ? (
          <IconPicker value={type.icon} onChange={onIcon} />
        ) : (
          <IconView name={type.icon} className="mt-2 size-5" />
        )}
        <div className="min-w-0 flex-1">
          {editing && onName ? (
            <InlineName
              value={name}
              label="기록 유형 이름"
              emptyMessage="이름을 입력해주세요."
              className="w-full text-3xl font-medium tracking-tight"
              onCommit={onName}
            />
          ) : (
            <h1 className="text-3xl font-medium tracking-tight">{name}</h1>
          )}
          {editing && onDescription ? (
            <textarea
              value={description}
              aria-label="설명"
              rows={2}
              placeholder="설명을 입력하세요..."
              onChange={(event) => onDescription(event.target.value)}
              className="mt-2 w-full resize-none bg-transparent text-sm text-neutral-500 outline-none placeholder:text-neutral-300"
            />
          ) : description ? (
            <p className="mt-2 text-sm text-neutral-500">{description}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label="색"
              disabled={!editing}
              onClick={onToggleColor}
              className="size-4 rounded-full"
              style={{ backgroundColor: type.color }}
            />
            {colorOpen && onColor ? <ColorDots value={type.color} onChange={onColor} /> : null}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

function MenuSearch({ nested, onPick, onClose }: { nested: boolean; onPick: (item: InsertItem) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const items = filterMenu(query, nested)
  return (
    <div className="menu p-1">
      <input
        autoFocus
        value={query}
        aria-label="블록 검색"
        placeholder="검색"
        onChange={(event) => {
          setQuery(event.target.value)
          setCursor(0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setCursor((current) => Math.min(items.length - 1, current + 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setCursor((current) => Math.max(0, current - 1))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            const picked = items[cursor]
            if (picked) onPick(picked)
          } else if (event.key === 'Escape') onClose()
        }}
        className="field mb-1 w-full"
      />
      <MenuList items={items} cursor={cursor} onPick={onPick} />
    </div>
  )
}

function MenuList({ items, cursor, onPick }: { items: InsertItem[]; cursor: number; onPick: (item: InsertItem) => void }) {
  if (items.length === 0) return <p className="px-2 py-2 text-xs text-neutral-400">없는 블록입니다.</p>
  return (
    <div className="max-h-72 overflow-y-auto">
      {GROUPS.map((group) => {
        const rows = items.filter((entry) => entry.group === group)
        if (rows.length === 0) return null
        return (
          <div key={group}>
            <p className="px-2 pt-2 pb-1 text-[11px] text-neutral-400">{groupLabel(group)}</p>
            {rows.map((entry) => {
              const Icon = entry.icon
              const index = items.indexOf(entry)
              return (
                <button
                  key={entry.label}
                  type="button"
                  onClick={() => onPick(entry)}
                  className={['flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm', index === cursor ? 'bg-hover' : ''].join(' ')}
                >
                  <Icon className="size-4 text-neutral-400" strokeWidth={1.5} />
                  {entry.label}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
