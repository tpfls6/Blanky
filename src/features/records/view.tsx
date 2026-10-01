import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { IconView } from '../../constants/icons.ts'
import type { Block, BlockProps, FieldValue, RenderMode, SelectOption } from './schema.ts'

export type BlockContext = {
  block: Block
  mode: RenderMode
  value: FieldValue | undefined
  setValue: (value: FieldValue) => void
  onProps: (patch: Partial<BlockProps>) => void
  open: boolean
  onToggle: () => void
}

function grow(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

function useGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) grow(ref.current)
  }, [value])
  return ref
}

function plain(value: FieldValue | undefined): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function InlineText({
  value,
  placeholder,
  className,
  editing,
  onChange,
  rows,
}: {
  value: string
  placeholder: string
  className: string
  editing: boolean
  onChange: (value: string) => void
  rows?: boolean
}) {
  const ref = useGrow(value)
  if (!editing) {
    if (!value.trim()) return null
    return <p className={className || 'text-sm text-neutral-700'}>{value}</p>
  }
  if (!rows) {
    return (
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full bg-transparent outline-none placeholder:text-neutral-300 ${className}`}
      />
    )
  }
  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.target.value)
        grow(event.target)
      }}
      className={`w-full resize-none bg-transparent outline-none placeholder:text-neutral-300 ${className}`}
    />
  )
}

function labelOf(props: BlockProps, fallback: string): string {
  return props.label?.trim() || fallback
}

function optionBy(options: SelectOption[], value: string): SelectOption | undefined {
  return options.find((option) => option.id === value) ?? options.find((option) => option.label === value)
}

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <span className="text-xs text-neutral-500">
      {text}
      {required ? ' *' : ''}
    </span>
  )
}

function shell(half: boolean | undefined, node: ReactNode) {
  return <div className={half ? 'max-w-xs' : ''}>{node}</div>
}

export function BlockBody({ ctx }: { ctx: BlockContext }) {
  const { block, mode } = ctx
  const editing = mode === 'edit-template'
  const props = block.props
  const half = props.width === 'half'

  if (block.type === 'title') {
    if (mode === 'read-only') return <p className="text-2xl font-medium tracking-tight">{plain(ctx.value) || '제목 없음'}</p>
    return (
      <label className="block">
        <FieldLabel text={labelOf(props, '제목')} required={props.required} />
        <input
          value={plain(ctx.value)}
          placeholder={props.placeholder || '제목을 입력하세요'}
          readOnly={editing}
          onChange={(event) => ctx.setValue(event.target.value)}
          className="mt-1 w-full bg-transparent text-2xl font-medium tracking-tight outline-none placeholder:text-neutral-300"
        />
      </label>
    )
  }

  if (block.type === 'text') {
    return (
      <InlineText
        value={props.text ?? ''}
        placeholder="내용을 입력하세요"
        className="text-sm leading-relaxed text-neutral-600"
        editing={editing}
        rows
        onChange={(text) => ctx.onProps({ text })}
      />
    )
  }

  if (block.type === 'heading') {
    const level = props.level ?? 2
    const className = level === 1 ? 'text-2xl font-medium' : level === 2 ? 'text-xl font-medium' : 'text-base font-medium'
    return (
      <InlineText
        value={props.text ?? ''}
        placeholder={level === 1 ? '제목 1' : level === 2 ? '제목 2' : '제목 3'}
        className={className}
        editing={editing}
        onChange={(text) => ctx.onProps({ text })}
      />
    )
  }

  if (block.type === 'divider') return <hr className="border-line" />

  if (block.type === 'quote') {
    return (
      <blockquote className="border-l-2 border-line pl-3">
        <InlineText
          value={props.text ?? ''}
          placeholder="인용"
          className="text-sm text-neutral-500 italic"
          editing={editing}
          rows
          onChange={(text) => ctx.onProps({ text })}
        />
      </blockquote>
    )
  }

  if (block.type === 'callout') {
    if (!editing && !(props.text ?? '').trim()) return null
    const color = props.color || 'var(--accent-color)'
    return (
      <div
        className="flex gap-2 rounded-md px-3 py-2"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <IconView name={props.icon} className="mt-0.5 size-4 shrink-0" />
        <InlineText
          value={props.text ?? ''}
          placeholder="콜아웃"
          className="text-sm"
          editing={editing}
          rows
          onChange={(text) => ctx.onProps({ text })}
        />
      </div>
    )
  }

  if (block.type === 'spacer') {
    const size = props.size === 'sm' ? 'h-3' : props.size === 'lg' ? 'h-12' : 'h-6'
    return <div className={size} aria-hidden="true" />
  }

  if (block.type === 'toggle') {
    return (
      <button type="button" onClick={ctx.onToggle} className="flex items-center gap-1 text-sm font-medium">
        <ChevronRight className={ctx.open ? 'size-4 rotate-90 text-neutral-400 transition-transform duration-200' : 'size-4 text-neutral-400 transition-transform duration-200'} strokeWidth={1.5} />
        {editing ? (
          <input
            value={props.title ?? ''}
            placeholder="토글"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => ctx.onProps({ title: event.target.value })}
            className="bg-transparent outline-none placeholder:text-neutral-300"
          />
        ) : (
          <span>{props.title || '토글'}</span>
        )}
      </button>
    )
  }

  if (block.type === 'checklist') {
    const items = props.items ?? []
    return (
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.checked}
              disabled={!editing}
              onChange={(event) =>
                ctx.onProps({
                  items: items.map((entry) => (entry.id === item.id ? { ...entry, checked: event.target.checked } : entry)),
                })
              }
            />
            {editing ? (
              <input
                value={item.label}
                aria-label="체크리스트 항목"
                onChange={(event) =>
                  ctx.onProps({
                    items: items.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry)),
                  })
                }
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            ) : (
              <span>{item.label}</span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (block.type === 'checkbox') {
    const text = labelOf(props, '체크박스')
    if (mode === 'read-only') return <p className="text-sm">{ctx.value === true ? '☑' : '☐'} {text}</p>
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={ctx.value === true}
          disabled={editing}
          onChange={(event) => ctx.setValue(event.target.checked)}
        />
        {text}
        {props.required ? <span className="text-xs text-neutral-400">*</span> : null}
      </label>
    )
  }

  if (block.type === 'select' || block.type === 'multiSelect') {
    const optionsList = (props.options ?? []).filter((option) => option.label.trim())
    const text = labelOf(props, block.type === 'select' ? '선택' : '다중 선택')
    if (editing) {
      return shell(
        half,
        <div>
          <FieldLabel text={text} required={props.required} />
          <div className="mt-1 flex flex-wrap gap-1">
            {optionsList.length === 0 ? <span className="text-xs text-neutral-300">옵션 없음</span> : null}
            {optionsList.map((option) => (
              <span key={option.id} className="chip">
                <span className="mr-1 inline-block size-1.5 rounded-full" style={{ backgroundColor: option.color }} />
                {option.label}
              </span>
            ))}
          </div>
        </div>,
      )
    }
    if (mode === 'read-only') {
      const picked = block.type === 'multiSelect'
        ? optionsList.filter((option) => Array.isArray(ctx.value) && (ctx.value.includes(option.id) || ctx.value.includes(option.label)))
        : [optionBy(optionsList, plain(ctx.value))].filter((option): option is SelectOption => !!option)
      return (
        <div>
          <FieldLabel text={text} />
          <div className="mt-1 flex flex-wrap gap-1 text-sm">
            {picked.length === 0 ? <span className="text-neutral-300">—</span> : null}
            {picked.map((option) => (
              <span key={option.id} className="chip chip-on">
                {option.label}
              </span>
            ))}
          </div>
        </div>
      )
    }
    if (block.type === 'select') {
      const current = plain(ctx.value)
      return shell(
        half,
        <div>
          <FieldLabel text={text} required={props.required} />
          <div className="mt-1 flex flex-wrap gap-1">
            {optionsList.map((option) => {
              const on = current === option.id || current === option.label
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => ctx.setValue(on ? '' : option.id)}
                  className={on ? 'chip chip-on' : 'chip'}
                >
                  <span className="mr-1 inline-block size-1.5 rounded-full" style={{ backgroundColor: option.color }} />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>,
      )
    }
    const picked = Array.isArray(ctx.value) ? ctx.value : []
    return shell(
      half,
      <fieldset>
        <legend className="text-xs text-neutral-500">
          {text}
          {props.required ? ' *' : ''}
        </legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {optionsList.map((option) => {
            const on = picked.includes(option.id) || picked.includes(option.label)
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? picked.filter((item) => item !== option.id && item !== option.label) : [...picked, option.id]
                  ctx.setValue(next)
                }}
                className={on ? 'chip chip-on' : 'chip'}
              >
                <span className="mr-1 inline-block size-1.5 rounded-full" style={{ backgroundColor: option.color }} />
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>,
    )
  }

  if (block.type === 'longText') {
    const text = labelOf(props, '긴 텍스트')
    if (editing) {
      return shell(half, <Mock label={text} required={props.required} hint={props.placeholder || '긴 텍스트'} tall />)
    }
    if (mode === 'read-only') {
      return (
        <div>
          <FieldLabel text={text} />
          <p className="mt-1 text-sm whitespace-pre-wrap">{plain(ctx.value) || '—'}</p>
        </div>
      )
    }
    return shell(
      half,
      <label className="block">
        <FieldLabel text={text} required={props.required} />
        <textarea
          value={plain(ctx.value)}
          placeholder={props.placeholder}
          onChange={(event) => ctx.setValue(event.target.value)}
          className="field mt-1 min-h-20 w-full"
        />
      </label>,
    )
  }

  if (block.type === 'number' || block.type === 'date' || block.type === 'time' || block.type === 'dateTime' || block.type === 'textField') {
    const text = labelOf(props, '필드')
    const inputType = block.type === 'number'
      ? 'number'
      : block.type === 'date'
        ? props.includeTime ? 'datetime-local' : 'date'
        : block.type === 'time'
          ? 'time'
          : block.type === 'dateTime'
            ? 'datetime-local'
            : 'text'
    if (editing) {
      const hint = props.placeholder || (props.unit ? props.unit : inputType === 'text' ? '텍스트' : '')
      return shell(half, <Mock label={text} required={props.required} hint={hint || '입력'} />)
    }
    if (mode === 'read-only') {
      const shown = plain(ctx.value)
      return (
        <div>
          <FieldLabel text={text} />
          <p className="mt-1 text-sm">{shown ? `${shown}${props.unit ? ` ${props.unit}` : ''}` : '—'}</p>
        </div>
      )
    }
    return shell(
      half,
      <label className="block">
        <FieldLabel text={text} required={props.required} />
        <span className="mt-1 flex items-center gap-2">
          <input
            type={inputType}
            value={block.type === 'number' ? (typeof ctx.value === 'number' ? ctx.value : '') : plain(ctx.value)}
            placeholder={props.placeholder}
            min={props.min ?? undefined}
            max={props.max ?? undefined}
            onChange={(event) => {
              if (block.type === 'number') {
                ctx.setValue(event.target.value === '' ? '' : Number(event.target.value))
                return
              }
              ctx.setValue(event.target.value)
            }}
            className="field w-full"
          />
          {props.unit ? <span className="text-xs text-neutral-400">{props.unit}</span> : null}
        </span>
      </label>,
    )
  }

  return null
}

function Mock({ label, required, hint, tall }: { label: string; required?: boolean; hint: string; tall?: boolean }) {
  return (
    <div>
      <FieldLabel text={label} required={required} />
      <div className={tall ? 'field mt-1 min-h-16 text-sm text-neutral-300' : 'field mt-1 text-sm text-neutral-300'}>{hint}</div>
    </div>
  )
}
