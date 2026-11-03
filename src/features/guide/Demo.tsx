import { ArrowUp, CalendarDays, CheckSquare, NotebookPen, StickyNote } from 'lucide-react'
import type { DemoKind, DemoResult, GuideStep, InputExample } from './content.ts'
import './guide.css'

const CHIPS = ['자동 분류', '일정', '할 일', '일기', '메모', '독서 기록'] as const
const KIND_ICON = { '일정': CalendarDays, '할 일': CheckSquare, '일기': NotebookPen, '메모': StickyNote, '독서 기록': NotebookPen } as const

/** Static picture of the home composer. Not interactive: it shows what the user would type. */
export function ComposerDemo({ input, chip = '자동 분류' }: { input: string; chip?: InputExample['chip'] }) {
  return (
    <div className="composer guide-composer">
      <p className="guide-typed"><span className="sr-only">입력: </span>{input}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2" aria-hidden="true">
        <div className="flex flex-wrap gap-1">{CHIPS.map(label => <span key={label} className={label === chip ? 'chip chip-on' : 'chip'}>{label}</span>)}</div>
        <span className="icon-btn-primary"><ArrowUp className="size-4" /></span>
      </div>
    </div>
  )
}

export function ResultDemo({ results }: { results: DemoResult[] }) {
  return (
    <ul className="space-y-2" aria-label="분석 결과">
      {results.map(result => {
        const Icon = KIND_ICON[result.kind]
        return (
          <li key={result.kind + result.title} className="guide-result">
            <span className="guide-kind"><Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />{result.kind}</span>
            <span className="min-w-0">
              <strong className="block truncate text-sm font-medium">{result.title}</strong>
              {result.meta ? <span className="block text-xs text-neutral-500">{result.meta}</span> : null}
              {result.check ? <span className="mt-1 block text-xs text-amber-700">확인 필요 · {result.check}</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function KindBadge({ kind }: { kind: DemoKind }) {
  const Icon = KIND_ICON[kind]
  return <span className="guide-kind"><Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />{kind}</span>
}

export function StepList({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="guide-steps">
      {steps.map((step, index) => (
        <li key={step.title}>
          <span className="guide-step-no" aria-hidden="true">{index + 1}</span>
          <div><p className="text-sm font-medium">{step.title}</p><p className="mt-1 text-sm leading-relaxed text-neutral-500">{step.body}</p></div>
        </li>
      ))}
    </ol>
  )
}
