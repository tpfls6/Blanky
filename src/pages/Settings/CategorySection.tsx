import { useState, type FormEvent } from 'react'
import { InlineName } from '../../components/common/InlineName.tsx'
import { CategoryPicker } from '../../components/schedule/CategoryPicker.tsx'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { useLibrary } from '../../state/useLibrary.ts'
import type { WorkspaceCategory } from '../../types/work.ts'

export function CategorySection() {
  const { categories, addCategory, updateCategory, reorderCategories, removeCategory } = useLibrary()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const parents = categories.filter((category) => category.parentId === null)

  const fields = (category: WorkspaceCategory, nested: boolean) => (
    <div>
      <div className="group flex items-center gap-2">
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
        {nested ? (
          <button
            type="button"
            aria-pressed={category.kind === 'project'}
            onClick={() => updateCategory(category.id, { kind: category.kind === 'project' ? 'topic' : 'project' })}
            className={category.kind === 'project' ? 'chip chip-on' : 'chip'}
          >
            프로젝트
          </button>
        ) : null}
        <button
          type="button"
          className="text-xs text-neutral-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          onClick={() => {
            if (!window.confirm(`${category.name}을 삭제할까요? 일정과 메모는 남고, 분류만 풀립니다.`)) return
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
      <p className="text-xs text-neutral-400">아이콘은 모양과 색, 이름은 더블클릭으로 바꿉니다. 행을 끌어 순서를 바꿀 수 있습니다.</p>
      <Sortable
        items={parents}
        className="mt-4"
        itemClassName={() => 'border-t border-line py-3'}
        onReorder={(next) => reorderCategories(null, next.map((category) => category.id))}
        render={(parent) => (
          <div>
            {fields(parent, false)}
            <Sortable
              items={categories.filter((category) => category.parentId === parent.id)}
              itemClassName={() => 'mt-3 border-t border-line py-3 pl-4'}
              onReorder={(next) => reorderCategories(parent.id, next.map((category) => category.id))}
              render={(child) => fields(child, true)}
            />
          </div>
        )}
      />
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          addCategory(name, parentId)
          setName('')
        }}
      >
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="새 카테고리" aria-label="새 카테고리" className="field min-w-40 flex-1" />
        <CategoryPicker categories={parents} value={parentId} onChange={setParentId} />
        <button type="submit" className="btn btn-primary">추가</button>
      </form>
      <p className="mt-2 text-xs text-neutral-400">상위 카테고리를 고르면 그 아래에 추가됩니다. 없음이면 새 상위 카테고리입니다.</p>
    </div>
  )
}
