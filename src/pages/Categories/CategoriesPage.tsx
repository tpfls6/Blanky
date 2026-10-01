import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { useState } from 'react'
import { useWorkspace } from '../../state/useWorkspace.ts'

export function CategoriesPage() {
  const { categories, addCategory, renameCategory, removeCategory, moveCategory, reorderCategory } =
    useWorkspace()
  const [parentName, setParentName] = useState('')
  const [childName, setChildName] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const parents = categories.filter((category) => category.parentId === null)

  const commitRename = (id: string) => {
    renameCategory(id, draft)
    setRenaming(null)
  }

  return (
    <section className="w-full max-w-2xl px-5 py-10 sm:px-10 sm:py-14">
      <h1 className="text-2xl font-medium tracking-tight text-neutral-900 sm:text-3xl">Category</h1>
      <div className="mt-8">
        {parents.map((parent) => {
          const children = categories.filter((category) => category.parentId === parent.id)
          return (
            <section key={parent.id} className="mt-6">
              <CategoryRow
                id={parent.id}
                over={overId === parent.id}
                name={parent.name}
                editing={renaming === parent.id}
                draft={draft}
                confirming={confirming === parent.id}
                onEdit={() => {
                  setRenaming(parent.id)
                  setDraft(parent.name)
                  setConfirming(null)
                }}
                onDraft={setDraft}
                onCommit={() => commitRename(parent.id)}
                onCancel={() => setRenaming(null)}
                onAskDelete={() => setConfirming(parent.id)}
                onCancelDelete={() => setConfirming(null)}
                onDelete={() => {
                  removeCategory(parent.id)
                  setConfirming(null)
                }}
                onUp={() => moveCategory(parent.id, -1)}
                onDown={() => moveCategory(parent.id, 1)}
                onReorder={reorderCategory}
                onOver={setOverId}
              />
              <div className="mt-1 pl-4">
                {children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    id={child.id}
                    over={overId === child.id}
                    name={child.name}
                    editing={renaming === child.id}
                    draft={draft}
                    confirming={confirming === child.id}
                    onEdit={() => {
                      setRenaming(child.id)
                      setDraft(child.name)
                      setConfirming(null)
                    }}
                    onDraft={setDraft}
                    onCommit={() => commitRename(child.id)}
                    onCancel={() => setRenaming(null)}
                    onAskDelete={() => setConfirming(child.id)}
                    onCancelDelete={() => setConfirming(null)}
                    onDelete={() => {
                      removeCategory(child.id)
                      setConfirming(null)
                    }}
                    onUp={() => moveCategory(child.id, -1)}
                    onDown={() => moveCategory(child.id, 1)}
                    onReorder={reorderCategory}
                    onOver={setOverId}
                  />
                ))}
                <form
                  className="mt-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const name = childName[parent.id] ?? ''
                    addCategory(name, parent.id)
                    setChildName((current) => ({ ...current, [parent.id]: '' }))
                  }}
                >
                  <input
                    value={childName[parent.id] ?? ''}
                    aria-label={`${parent.name} 하위 카테고리`}
                    placeholder="하위 카테고리"
                    onChange={(event) =>
                      setChildName((current) => ({ ...current, [parent.id]: event.target.value }))
                    }
                    className="w-full bg-transparent py-1 text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
                  />
                </form>
              </div>
            </section>
          )
        })}
      </div>
      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault()
          addCategory(parentName, null)
          setParentName('')
        }}
      >
        <input
          value={parentName}
          aria-label="상위 카테고리"
          placeholder="상위 카테고리"
          onChange={(event) => setParentName(event.target.value)}
          className="w-full bg-transparent py-1 text-sm text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
        />
      </form>
    </section>
  )
}

type CategoryRowProps = {
  id: string
  over: boolean
  name: string
  editing: boolean
  draft: string
  confirming: boolean
  onEdit: () => void
  onDraft: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onUp: () => void
  onDown: () => void
  onReorder: (id: string, targetId: string) => void
  onOver: (id: string | null) => void
}

function CategoryRow({
  id,
  over,
  name,
  editing,
  draft,
  confirming,
  onEdit,
  onDraft,
  onCommit,
  onCancel,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onUp,
  onDown,
  onReorder,
  onOver,
}: CategoryRowProps) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'move'
        onOver(id)
      }}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const from = event.dataTransfer.getData('text/plain')
        if (from) onReorder(from, id)
        onOver(null)
      }}
      className={['flex items-center gap-2 py-1', over ? 'bg-neutral-50' : ''].join(' ')}
    >
      <span
        role="button"
        draggable={!editing}
        aria-label={`${name} 끌어서 순서 변경`}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', id)
          event.dataTransfer.effectAllowed = 'move'
          event.stopPropagation()
        }}
        onDragEnd={() => onOver(null)}
        className="cursor-grab text-neutral-300 active:cursor-grabbing"
      >
        <GripVertical className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      {editing ? (
        <input
          value={draft}
          aria-label="이름"
          autoFocus
          onChange={(event) => onDraft(event.target.value)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onCommit()
            }
            if (event.key === 'Escape') onCancel()
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 focus:outline-none"
        />
      ) : (
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left text-sm text-neutral-900">
          {name}
        </button>
      )}
      <button type="button" aria-label={`${name} 위로`} onClick={onUp} className="p-1 text-neutral-400 hover:text-neutral-800">
        <ChevronUp className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" aria-label={`${name} 아래로`} onClick={onDown} className="p-1 text-neutral-400 hover:text-neutral-800">
        <ChevronDown className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
      {confirming ? (
        <>
          <button type="button" onClick={onDelete} className="text-xs text-neutral-900">
            삭제
          </button>
          <button type="button" onClick={onCancelDelete} className="text-xs text-neutral-400">
            취소
          </button>
        </>
      ) : (
        <button type="button" onClick={onAskDelete} className="text-xs text-neutral-400 hover:text-neutral-800">
          삭제
        </button>
      )}
    </div>
  )
}
