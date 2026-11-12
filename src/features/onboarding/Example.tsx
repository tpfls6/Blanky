import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n.ts'

/**
 * A picture of what a filled page looks like. Shown only while the page has no real data,
 * never stored, and pressing it starts the real action instead of opening the sample.
 */
export function ExampleCard({ title, meta, body, action, icon, onStart, className }: {
  title: string
  meta?: string
  body?: string
  action: string
  icon?: ReactNode
  onStart: () => void
  className?: string
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      data-example
      className={'example-card' + (className ? ` ${className}` : '')}
      aria-label={t('exampleLabel', { title, action })}
      onClick={onStart}
    >
      <span className="example-card-top">
        <span className="example-badge">{t('example')}</span>
        {meta ? <span className="example-meta">{meta}</span> : null}
      </span>
      <span className="example-title">{icon}{title}</span>
      {body ? <span className="example-body">{body}</span> : null}
      <span className="example-action">{action} →</span>
    </button>
  )
}
