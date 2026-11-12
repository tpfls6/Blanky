import { useConfirm } from '../../state/useConfirm.ts'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, Plus, X } from 'lucide-react'
import { InlineName } from '../../components/common/InlineName.tsx'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import type { WorkspaceCategory } from '../../types/work.ts'

const DEFAULT_COLOR = '#3A62B0'

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('ko') === b.trim().toLocaleLowerCase('ko')

function AddCategoryDialog({ categories, onCancel, onAdd }: {
  categories: WorkspaceCategory[]
  onCancel: () => void
  onAdd: (name: string, parentId: string | null, style: Pick<WorkspaceCategory, 'color' | 'icon'>) => void
}) {
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [icon, setIcon] = useState<string | null>(null)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const errorId = useId()
  const parents = categories.filter((category) => category.parentId === null)
  const shownIcon = icon ?? (parentId ? 'Tag' : 'Folder')

  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setError('카테고리 이름을 입력해주세요.')
    if (categories.some((category) => category.parentId === parentId && sameName(category.name, trimmed))) {
      return setError(parentId ? '이 상위 카테고리 안에 같은 이름이 이미 있습니다.' : '같은 이름의 상위 카테고리가 이미 있습니다.')
    }
    onAdd(trimmed, parentId, { color, icon: shownIcon })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-theme-slot="modal"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-xl"
        onKeyDown={(event) => {
          // Pickers render in portals; only an Escape from inside this panel closes the dialog.
          if (event.key === 'Escape' && panelRef.current?.contains(event.target as Node)) onCancel()
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-medium">카테고리 추가</h2>
          <button data-theme-slot="button" type="button" className="icon-btn" aria-label="닫기" onClick={onCancel}><X aria-hidden="true" className="size-4" /></button>
        </div>
        <form className="mt-4 space-y-4" onSubmit={submit} noValidate>
          <label className="block text-xs text-neutral-500">
            이름
            <input data-theme-slot="input"
              autoFocus
              value={name}
              onChange={(event) => { setName(event.target.value); setError('') }}
              placeholder="새 카테고리"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="field mt-1.5 w-full"
            />
          </label>
          {error ? <p id={errorId} role="alert" className="-mt-2 text-xs text-red-500">{error}</p> : null}
          <div className="text-xs text-neutral-500">
            <span>상위 카테고리 <span className="text-neutral-400">(선택)</span></span>
            <div className="mt-1.5">
              <CategoryPicker categories={parents} value={parentId} onChange={(id) => { setParentId(id); setError('') }} />
            </div>
            <p className="mt-1 text-neutral-400">없음이면 새 상위 카테고리가 됩니다.</p>
          </div>
          <div className="text-xs text-neutral-500">
            <span>아이콘과 색</span>
            <div className="mt-1.5">
              <IconPicker value={shownIcon} color={color} onChange={setIcon} onColor={setColor} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button data-theme-slot="button" type="button" className="btn btn-ghost" onClick={onCancel}>취소</button>
            <button data-theme-slot="button" type="submit" className="btn btn-primary">추가</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export function CategorySection() {
  const confirm = useConfirm()

  const { categories, addCategory, updateCategory, reorderCategories, removeCategory } = useLibrary()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const parents = categories.filter((category) => category.parentId === null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const fields = (category: WorkspaceCategory) => (
    <div className="category-row-fields py-3">
      <div className="group relative flex h-7 items-center gap-2">
        <GripVertical aria-hidden="true" strokeWidth={1.5} className="absolute top-1.5 -left-5 size-4 cursor-grab text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100" />
        <IconPicker
          plain
          value={category.icon ?? 'Folder'}
          color={category.color}
          onChange={(icon) => updateCategory(category.id, { icon })}
          onColor={(color) => updateCategory(category.id, { color })}
        />
        <InlineName
          value={category.name}
          label={`${category.name} 이름`}
          emptyMessage="카테고리 이름을 입력해주세요."
          onCommit={(name) => updateCategory(category.id, { name })}
        />
        <button
          type="button"
          className="text-xs text-neutral-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
          onClick={async () => {
            if (!await confirm(`${category.name}을 삭제할까요? 일정과 메모는 남고, 분류만 풀립니다.`)) return
            removeCategory(category.id)
          }}
        >
          삭제
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button data-theme-slot="button" type="button" className="btn btn-primary inline-flex items-center gap-1.5" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
          카테고리 추가
        </button>
        <p role="status" aria-live="polite" className="text-xs text-accent-text">{notice}</p>
      </div>
      <p className="mt-3 text-xs text-neutral-400">아이콘은 모양과 색, 이름은 더블클릭으로 바꿉니다. 행을 끌어 순서를 바꿀 수 있습니다.</p>
      <Sortable
        items={parents}
        className="mt-4"
        itemClassName={() => 'border-t border-line'}
        onReorder={(next) => reorderCategories(null, next.map((category) => category.id))}
        render={(parent) => (
          <div>
            {fields(parent)}
            <Sortable
              items={categories.filter((category) => category.parentId === parent.id)}
              itemClassName={() => 'border-t border-line pl-4'}
              onReorder={(next) => reorderCategories(parent.id, next.map((category) => category.id))}
              render={(child) => fields(child)}
            />
          </div>
        )}
      />
      {adding ? (
        <AddCategoryDialog
          categories={categories}
          onCancel={() => setAdding(false)}
          onAdd={(name, parentId, style) => {
            addCategory(name, parentId, style)
            setAdding(false)
            const parent = parentId ? categories.find((category) => category.id === parentId) : null
            setNotice(parent ? `${parent.name} 아래에 '${name}'을 추가했습니다.` : `'${name}' 카테고리를 추가했습니다.`)
          }}
        />
      ) : null}
    </div>
  )
}
