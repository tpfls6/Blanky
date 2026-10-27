import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n.ts'

const STEPS = [
  { title: 'custom.guideWelcomeTitle', body: 'custom.guideWelcomeBody', target: null },
  { title: 'custom.guideCreateTitle', body: 'custom.guideCreateBody', target: 'new-page' },
  { title: 'custom.guideAddTitle', body: 'custom.guideAddBody', target: 'add-block' },
  { title: 'custom.guideMoveTitle', body: 'custom.guideMoveBody', target: 'drag-handle' },
  { title: 'custom.guideStyleTitle', body: 'custom.guideStyleBody', target: 'block-settings' },
  { title: 'custom.guideSaveTitle', body: 'custom.guideSaveBody', target: 'save-template' },
  { title: 'custom.guideDoneTitle', body: 'custom.guideDoneBody', target: null },
] as const

type Spot = { top: number; left: number; width: number; height: number }

function measure(target: string | null): Spot | null {
  if (!target) return null
  const node = document.querySelector(`[data-tour="${target}"]`)
  if (!(node instanceof HTMLElement)) return null
  const rect = node.getBoundingClientRect()
  if (rect.width < 2 && rect.height < 2) return null
  return { top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }
}

export function TemplateGuide({
  onClose,
  onCreate,
  onTemplate,
}: {
  onClose: () => void
  onCreate: () => void
  onTemplate: () => void
}) {
  const { t } = useI18n()
  const titleId = useId()
  const cardRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [spot, setSpot] = useState<Spot | null>(null)
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  useEffect(() => {
    const sync = () => setSpot(measure(current.target))
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [current.target, step])

  useEffect(() => {
    const prev = document.activeElement
    cardRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'ArrowRight') setStep((value) => Math.min(STEPS.length - 1, value + 1))
      if (event.key === 'ArrowLeft') setStep((value) => Math.max(0, value - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [onClose, step])

  const popStyle = spot
    ? {
        top: Math.min(window.innerHeight - 280, Math.max(16, spot.top + spot.height + 12)),
        left: Math.min(window.innerWidth - 336, Math.max(16, spot.left)),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="guide-layer" role="presentation">
      {spot ? <div className="guide-spot" style={spot} /> : <div className="guide-dim" />}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="guide-card"
        style={popStyle}
      >
        <p className="text-[11px] tracking-wide text-neutral-400">{t('custom.progress', { current: step + 1, total: STEPS.length })}</p>
        <h2 id={titleId} className="mt-2 text-base font-medium">
          {t(current.title)}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">{t(current.body)}</p>
        {current.target === 'add-block' ? <p className="mt-2 text-sm text-neutral-500">{t('custom.slash')}</p> : null}
        {current.target && !spot ? <p className="mt-2 text-xs text-neutral-400">{t('custom.fallback')}</p> : null}
        {current.target === 'drag-handle' ? (
          <div className="guide-demo mt-4" aria-hidden="true">
            <span className="guide-demo-row guide-demo-a">Block A</span>
            <span className="guide-demo-row guide-demo-b">Block B</span>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep((value) => value - 1)}>
              {t('custom.back')}
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost ml-auto" onClick={onClose}>
            {t('custom.skip')}
          </button>
          {step === 0 ? (
            <button type="button" className="btn btn-primary" onClick={() => setStep(1)}>
              {t('custom.start')}
            </button>
          ) : last ? (
            <>
              <button type="button" className="btn btn-line" onClick={onTemplate}>
                {t('custom.startTemplate')}
              </button>
              <button type="button" className="btn btn-primary" onClick={onCreate}>
                {t('custom.makePage')}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setStep((value) => value + 1)}>
              {t('custom.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
