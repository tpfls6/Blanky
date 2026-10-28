import { useMemo, useState } from 'react'
import { StarRating } from './StarRating.tsx'
import type { PageReadingItem } from '../../features/pages/pageRecords.ts'
import { fieldLabel, type PageTemplateKind } from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import './reading.css'

function Cover({ title, image }: { title: string; image: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="reading-book-cover" data-theme-slot="reading-book-cover">
      {image && !failed ? <img draggable={false} src={image} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{title || '·'}</span>}
    </div>
  )
}

function blank(id = crypto.randomUUID()): PageReadingItem {
  const now = new Date().toISOString()
  return { id, title: '', author: '', rating: null, note: '', image: '', createdAt: now, updatedAt: now }
}

export function ReadingCatalog({
  heading,
  labels,
  items,
  busy,
  error,
  onSave,
  onDelete,
}: {
  heading: string
  labels: Record<string, string>
  items: PageReadingItem[]
  busy: boolean
  error: string
  onSave: (item: PageReadingItem) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const { t } = useI18n()
  const template: PageTemplateKind = 'reading'
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null)
  const [draft, setDraft] = useState<PageReadingItem | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const current = draft ?? items.find((item) => item.id === selectedId) ?? null
  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase()
    return items.filter((item) => !text || [item.title, item.author, item.note].join(' ').toLocaleLowerCase().includes(text))
  }, [items, query])

  const label = (key: string) => fieldLabel(template, key, labels)
  const edit = (patch: Partial<PageReadingItem>) => {
    const base = current ?? blank()
    setDraft({ ...base, ...patch, updatedAt: new Date().toISOString() })
    setStatus('')
  }

  return (
    <div className="reading-page" data-theme-slot="reading-page">
      <header className="reading-heading">
        <div>
          <h1>{heading}</h1>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            const next = blank()
            setDraft(next)
            setSelectedId(next.id)
          }}
        >
          + {t('custom.addRecord')}
        </button>
      </header>
      {error ? <p role="alert" className="reading-error">{error}</p> : null}
      <div className="reading-layout">
        <aside className="reading-sidebar" aria-label={heading}>
          <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('custom.searchRecords')} aria-label={t('custom.searchRecords')} />
          <p className="reading-muted">{visible.length}</p>
          {visible.length === 0 ? <p className="reading-muted">{t('custom.emptyRecords')}</p> : null}
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === current?.id ? 'reading-nav selected' : 'reading-nav'}
              onClick={() => {
                setSelectedId(item.id)
                setDraft(null)
                setStatus('')
              }}
            >
              {item.title || t('custom.unnamed')}
            </button>
          ))}
        </aside>
        <main className="reading-content">
          {current ? (
            <form
              className="reading-form reading-record"
              onSubmit={async (event) => {
                event.preventDefault()
                const next = { ...(draft ?? current), updatedAt: new Date().toISOString() }
                await onSave(next)
                setDraft(null)
                setSelectedId(next.id)
                setStatus(t('builder.saved'))
              }}
            >
              <div className="reading-detail-heading">
                <Cover title={current.title} image={(draft ?? current).image} />
              </div>
              <label>
                {label('title')}
                <input className="field" value={(draft ?? current).title} onChange={(event) => edit({ title: event.target.value })} />
              </label>
              <label>
                {label('author')}
                <input className="field" value={(draft ?? current).author} onChange={(event) => edit({ author: event.target.value })} />
              </label>
              <div className="reading-form-rating">
                <p>{label('rating')}</p>
                <StarRating value={(draft ?? current).rating} disabled={busy} onChange={(rating) => edit({ rating })} />
              </div>
              <label>
                {label('image')}
                <input className="field" value={(draft ?? current).image} onChange={(event) => edit({ image: event.target.value })} />
              </label>
              <label className="reading-wide">
                {label('note')}
                <textarea className="field" value={(draft ?? current).note} onChange={(event) => edit({ note: event.target.value })} />
              </label>
              <div className="reading-wide reading-actions">
                <button className="btn btn-primary" disabled={busy}>{busy ? t('custom.saving') : t('custom.save')}</button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={async () => {
                    await onDelete(current.id)
                    setDraft(null)
                    setSelectedId(null)
                  }}
                >
                  {t('delete')}
                </button>
                {status ? <span role="status">{status}</span> : null}
              </div>
            </form>
          ) : (
            <div className="reading-empty">
              <h3>{t('custom.emptyRecords')}</h3>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
