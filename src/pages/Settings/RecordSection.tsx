import { useRef, useState } from 'react'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { InlineName } from '../../components/common/InlineName.tsx'
import { iconByName } from '../../constants/icons.ts'
import { SWATCHES, DEFAULT_SWATCH } from '../../constants/swatches.ts'
import { RecordBuilder } from '../../features/records/Builder.tsx'
import { createBlock } from '../../features/records/registry.ts'
import { countBlocks, exportTemplate, parseTemplateFile } from '../../features/records/schema.ts'
import { STARTERS } from '../../features/records/templates.ts'
import { useLibrary } from '../../state/useLibrary.ts'

function swatchName(hex: string): string {
  return SWATCHES.find((swatch) => swatch.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex
}

export function RecordSection() {
  const { recordTypes, addRecordType, updateRecordType, duplicateRecordType, removeRecordType } = useLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const open = recordTypes.find((item) => item.id === openId) ?? null

  const create = (
    blocks = [createBlock('title', { label: '제목' })],
    name = '새 기록',
    icon = 'StickyNote',
    color: string = DEFAULT_SWATCH,
    description = '',
  ) => {
    const id = addRecordType({ name, icon, color, description, blocks })
    if (id) setOpenId(id)
  }

  if (open) {
    return (
      <RecordBuilder
        key={open.id}
        type={open}
        onBack={() => setOpenId(null)}
        onChange={(patch) => updateRecordType(open.id, patch)}
      />
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => create()}>
          + 새 기록 유형
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const blob = new Blob(
              [JSON.stringify(recordTypes.map(exportTemplate), null, 2)],
              { type: 'application/json' },
            )
            const link = document.createElement('a')
            link.href = URL.createObjectURL(blob)
            link.download = 'custom-record-templates.json'
            link.click()
            URL.revokeObjectURL(link.href)
          }}
        >
          내보내기
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          가져오기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="템플릿 가져오기"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            try {
              const parsed = JSON.parse(await file.text()) as unknown
              const files = Array.isArray(parsed) ? parsed : [parsed]
              const errors: string[] = []
              for (const item of files) {
                const result = parseTemplateFile(item)
                if (!result.ok) {
                  errors.push(result.error)
                  continue
                }
                addRecordType({
                  name: result.file.name,
                  icon: result.file.icon,
                  color: result.file.color,
                  description: result.file.description,
                  blocks: result.file.blocks,
                })
              }
              setError(errors[0] ?? '')
            } catch {
              setError('JSON 파일을 읽지 못했습니다.')
            }
          }}
        />
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <ul className="mt-4">
        {recordTypes.map((item) => {
          const Icon = iconByName(item.icon)
          return (
            <li key={item.id} className="flex items-center gap-3 border-t border-line py-3">
              <button type="button" aria-label={`${item.name} 열기`} onClick={() => setOpenId(item.id)} className="shrink-0">
                <Icon className="size-4" strokeWidth={1.5} style={{ color: item.color }} />
              </button>
              <div className="min-w-0 flex-1">
                <InlineName
                  value={item.name}
                  label={`${item.name} 이름`}
                  emptyMessage="이름을 입력해주세요."
                  onCommit={(name) => updateRecordType(item.id, { name })}
                />
                <button type="button" onClick={() => setOpenId(item.id)} className="mt-0.5 block max-w-full truncate text-left text-xs text-neutral-400">
                  {item.icon} · {swatchName(item.color)} · {countBlocks(item.blocks)}개 블록
                </button>
              </div>
              <button type="button" aria-label={`${item.name} 수정`} onClick={() => setOpenId(item.id)} className="text-neutral-400">
                <Pencil className="size-4" strokeWidth={1.5} />
              </button>
              <button type="button" aria-label={`${item.name} 복제`} onClick={() => duplicateRecordType(item.id)} className="text-neutral-400">
                <Copy className="size-4" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label={`${item.name} 삭제`}
                onClick={() => {
                  if (!window.confirm(`${item.name} 유형과 그 기록을 삭제할까요?`)) return
                  removeRecordType(item.id)
                }}
                className="text-neutral-400"
              >
                <Trash2 className="size-4" strokeWidth={1.5} />
              </button>
            </li>
          )
        })}
      </ul>
      {recordTypes.length === 0 ? <p className="mt-4 text-sm text-neutral-400">아직 만든 기록 유형이 없습니다.</p> : null}
      <p className="mt-8 text-xs text-neutral-400">예시</p>
      <ul>
        {STARTERS.map((starter) => {
          const Icon = iconByName(starter.icon)
          return (
            <li key={starter.name} className="flex items-center gap-3 border-t border-line py-3">
              <Icon className="size-4 shrink-0" strokeWidth={1.5} style={{ color: starter.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{starter.name}</span>
                <span className="mt-0.5 block text-xs text-neutral-400">
                  {starter.icon} · {swatchName(starter.color)} · {starter.description}
                </span>
              </span>
              <button
                type="button"
                className="text-xs text-neutral-400"
                onClick={() => create(starter.build(), starter.name, starter.icon, starter.color, starter.description)}
              >
                사용
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
