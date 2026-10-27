import type { ReactNode } from 'react'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { SWATCHES } from '../../constants/swatches.ts'
import type { Block, BlockProps, CheckItem, SelectOption } from './schema.ts'

export function ColorDots({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="색">
      {SWATCHES.map((swatch) => {
        const selected = value.toLowerCase() === swatch.hex.toLowerCase()
        return (
          <button
            key={swatch.hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={swatch.name}
            onClick={() => onChange(swatch.hex)}
            className="size-4 rounded-full"
            style={{
              backgroundColor: swatch.hex,
              boxShadow: selected ? '0 0 0 2px var(--bg), 0 0 0 3px var(--fg)' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-neutral-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function text(props: BlockProps, key: 'label' | 'placeholder' | 'unit' | 'text' | 'title', onChange: (patch: Partial<BlockProps>) => void, label: string) {
  return (
    <Row label={label}>
      <input value={props[key] ?? ''} onChange={(event) => onChange({ [key]: event.target.value })} className="field w-full" />
    </Row>
  )
}

export function BlockProperties({
  block,
  onChange,
  onRemove,
  onDuplicate,
}: {
  block: Block
  onChange: (patch: Partial<BlockProps>) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const props = block.props
  const locked = block.type === 'title'
  return (
    <div className="space-y-3">
      {block.type === 'heading' ? (
        <div>
          <p className="text-xs text-neutral-500">단계</p>
          <div className="mt-1 flex gap-1">
            {([1, 2, 3] as const).map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={(props.level ?? 2) === level}
                onClick={() => onChange({ level })}
                className={(props.level ?? 2) === level ? 'chip chip-on' : 'chip'}
              >
                H{level}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {block.type === 'heading' || block.type === 'text' || block.type === 'quote' || block.type === 'callout'
        ? text(props, 'text', onChange, '텍스트')
        : null}
      {block.type === 'toggle' ? text(props, 'title', onChange, '제목') : null}
      {block.type === 'toggle' ? (
        <Check label="기본적으로 열기" checked={props.defaultOpen === true} onChange={(defaultOpen) => onChange({ defaultOpen })} />
      ) : null}
      {block.type === 'callout' ? (
        <div className="flex items-center gap-2">
          <IconPicker value={props.icon || 'Lightbulb'} onChange={(icon) => onChange({ icon })} />
          <ColorDots value={props.color || SWATCHES[0].hex} onChange={(color) => onChange({ color })} />
        </div>
      ) : null}
      {block.type === 'spacer' ? (
        <div>
          <p className="text-xs text-neutral-500">크기</p>
          <div className="mt-1 flex gap-1">
            {([
              ['sm', '작게'],
              ['md', '보통'],
              ['lg', '크게'],
            ] as const).map(([size, label]) => (
              <button
                key={size}
                type="button"
                aria-pressed={(props.size ?? 'md') === size}
                onClick={() => onChange({ size })}
                className={(props.size ?? 'md') === size ? 'chip chip-on' : 'chip'}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {block.type === 'checklist' ? <ItemsEditor items={props.items ?? []} onChange={(items) => onChange({ items })} /> : null}
      {isInput(block.type) ? text(props, 'label', onChange, '라벨') : null}
      {block.type === 'textField' || block.type === 'longText' || block.type === 'number' || block.type === 'title' || block.type === 'url' || block.type === 'image'
        ? text(props, 'placeholder', onChange, '플레이스홀더')
        : null}
      {isInput(block.type) ? (
        <Check label="필수" checked={props.required === true} onChange={(required) => onChange({ required: locked ? true : required })} />
      ) : null}
      {block.type === 'number' ? (
        <>
          {text(props, 'unit', onChange, '단위')}
          <div className="flex gap-2">
            <Row label="최소">
              <input
                type="number"
                value={props.min ?? ''}
                onChange={(event) => onChange({ min: event.target.value === '' ? null : Number(event.target.value) })}
                className="field w-full"
              />
            </Row>
            <Row label="최대">
              <input
                type="number"
                value={props.max ?? ''}
                onChange={(event) => onChange({ max: event.target.value === '' ? null : Number(event.target.value) })}
                className="field w-full"
              />
            </Row>
          </div>
        </>
      ) : null}
      {block.type === 'date' ? (
        <Check label="시간 포함" checked={props.includeTime === true} onChange={(includeTime) => onChange({ includeTime })} />
      ) : null}
      {block.type === 'textField' || block.type === 'longText' || block.type === 'number' ? (
        <Row label="기본값">
          <input
            value={props.defaultValue === undefined || props.defaultValue === null ? '' : String(props.defaultValue)}
            onChange={(event) => {
              const raw = event.target.value
              if (block.type === 'number') {
                const next = raw === '' ? undefined : Number(raw)
                onChange({ defaultValue: next !== undefined && Number.isFinite(next) ? next : undefined })
              } else onChange({ defaultValue: raw })
            }}
            className="field w-full"
          />
        </Row>
      ) : null}
      {block.type === 'textField' || block.type === 'longText' || block.type === 'number' ? (
        <div>
          <p className="text-xs text-neutral-500">너비</p>
          <div className="mt-1 flex gap-1">
            <button type="button" aria-pressed={props.width !== 'half'} onClick={() => onChange({ width: 'full' })} className={props.width !== 'half' ? 'chip chip-on' : 'chip'}>
              전체
            </button>
            <button type="button" aria-pressed={props.width === 'half'} onClick={() => onChange({ width: 'half' })} className={props.width === 'half' ? 'chip chip-on' : 'chip'}>
              절반
            </button>
          </div>
        </div>
      ) : null}
      {block.type === 'select' || block.type === 'multiSelect' ? (
        <OptionsEditor options={props.options ?? []} onChange={(options) => onChange({ options })} />
      ) : null}
      <div className="flex gap-2 border-t border-line pt-3">
        {locked ? null : (
          <button type="button" className="text-xs text-neutral-400" onClick={onDuplicate}>
            복제
          </button>
        )}
        {locked ? <span className="text-xs text-neutral-300">제목은 삭제할 수 없습니다.</span> : (
          <button type="button" className="text-xs text-neutral-400" onClick={onRemove}>
            삭제
          </button>
        )}
      </div>
    </div>
  )
}

function isInput(type: Block['type']): boolean {
  return type === 'title' || type === 'textField' || type === 'longText' || type === 'number' || type === 'date' || type === 'time' || type === 'dateTime' || type === 'checkbox' || type === 'select' || type === 'multiSelect' || type === 'url' || type === 'image' || type === 'rating' || type === 'progress' || type === 'tags'
}

function OptionsEditor({ options, onChange }: { options: SelectOption[]; onChange: (options: SelectOption[]) => void }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">옵션</p>
      <ul className="mt-1 space-y-2">
        {options.map((option, index) => (
          <li key={option.id} className="space-y-1">
            <div className="flex items-center gap-1">
              <input
                value={option.label}
                aria-label="옵션 이름"
                onChange={(event) => onChange(options.map((item) => (item.id === option.id ? { ...item, label: event.target.value } : item)))}
                className="field min-w-0 flex-1"
              />
              <button type="button" className="text-xs text-neutral-400" onClick={() => onChange(options.filter((item) => item.id !== option.id))}>
                삭제
              </button>
            </div>
            <ColorDots value={option.color} onChange={(color) => onChange(options.map((item) => (item.id === option.id ? { ...item, color } : item)))} />
            <span className="sr-only">{index}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-2 text-xs text-neutral-400"
        onClick={() =>
          onChange([
            ...options,
            { id: crypto.randomUUID(), label: '옵션', color: SWATCHES[options.length % SWATCHES.length]?.hex ?? '#3A62B0' },
          ])
        }
      >
        + 옵션
      </button>
    </div>
  )
}

function ItemsEditor({ items, onChange }: { items: CheckItem[]; onChange: (items: CheckItem[]) => void }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">항목</p>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-1">
            <input
              value={item.label}
              aria-label="항목"
              onChange={(event) => onChange(items.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry)))}
              className="field min-w-0 flex-1"
            />
            <button type="button" className="text-xs text-neutral-400" onClick={() => onChange(items.filter((entry) => entry.id !== item.id))}>
              삭제
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-2 text-xs text-neutral-400"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), label: '항목', checked: false }])}
      >
        + 항목
      </button>
    </div>
  )
}
