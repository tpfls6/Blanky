import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import { officialListings } from '../../features/marketplace/official.ts'
import { TemplatePreviewProvider } from '../../features/marketplace/preview.tsx'
import { TEMPLATE_CATEGORIES, type TemplateListing } from '../../features/marketplace/schema.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import {
  getTemplate,
  installTemplate,
  loadTemplates,
  publishTemplate,
  reportTemplate,
  reviewTemplate,
  searchTemplates,
  sharePath,
  toggleFavorite,
  updateListing,
  type TemplateLibrary,
} from '../../services/templates/index.ts'

function categoryLabel(t: (key: string) => string, id: string) {
  return t('templates.cat.' + id)
}

function TemplateCard({ listing }: { listing: TemplateListing }) {
  return (
    <article>
      <Link to={ROUTES.templateDetail(listing.id)} className="block">
        <div className="theme-swatch" style={{ background: '#f6f6f5' }}>
          {listing.thumbnailUrl ? <img src={listing.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : (
            <>
              <div style={{ background: '#e8eef8' }} />
              <div>
                <span style={{ background: '#3a62b0' }} />
                <span style={{ background: '#f1f4fb' }} />
                <span style={{ background: '#ffffff' }} />
              </div>
            </>
          )}
        </div>
        <h2 className="mt-3 font-medium">{listing.name}</h2>
        <p className="text-xs text-neutral-500">{listing.creatorName} · {listing.category}</p>
        <p className="mt-1 text-sm">{listing.description}</p>
        <p className="mt-1 text-xs text-neutral-400">{listing.installCount} · {listing.tags.slice(0, 3).join(' · ')}</p>
      </Link>
    </article>
  )
}

function useStore() {
  const { user } = useSession()
  const [state, setState] = useState<TemplateLibrary>({ listings: officialListings(), installed: [], favorites: [], admin: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!user) return
    void loadTemplates(user.id).then(setState).catch((err: Error) => setError(err.message)).finally(() => setLoading(false))
  }, [user])
  return { user, state, setState, error, loading, refresh: () => user && loadTemplates(user.id).then(setState) }
}

export function TemplateStore() {
  const { t } = useI18n()
  const { user, state, error, loading } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [items, setItems] = useState<TemplateListing[]>(state.listings)
  const tab = params.get('sort') ?? 'featured'
  const category = params.get('category') ?? ''
  const view = params.get('view') ?? 'browse'

  useEffect(() => {
    if (!user) return
    void searchTemplates(user.id, { query, category, sort: tab === 'popular' ? 'popular' : tab === 'new' ? 'new' : 'featured' }).then(setItems).catch(() => setItems(state.listings))
  }, [user, query, category, tab, state.listings])

  const shown = useMemo(() => {
    if (view === 'mine') return state.listings.filter((item) => item.creatorId === user?.id)
    if (view === 'installed') return state.listings.filter((item) => state.installed.some((row) => row.listingId === item.id))
    if (view === 'favorites') return items.filter((item) => state.favorites.includes(item.id))
    return items.filter((item) => item.status === 'published')
  }, [view, items, state, user])

  return (
    <section data-theme-protected className="theme-page">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <h1>{t('templates.store')}</h1>
          <p className="text-sm text-neutral-500">{t('templates.tagline')}</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-line" to="/store/templates/library">{t('templates.library')}</Link>
          <Link className="btn btn-primary" to={ROUTES.templatePublish}>{t('templates.publish')}</Link>
        </div>
      </header>
      <div className="mt-6 flex gap-3">
        <Link className="chip" to="/store">{t('templates.themes')}</Link>
        <span className="chip chip-on">{t('templates.templates')}</span>
      </div>
      <input className="field my-5 w-full max-w-lg" aria-label={t('templates.search')} placeholder={t('templates.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TEMPLATE_CATEGORIES.map((id) => (
          <button key={id} type="button" className={category === id ? 'chip chip-on' : 'chip'} onClick={() => setParams((current) => { const next = new URLSearchParams(current); if (category === id) next.delete('category'); else next.set('category', id); return next })}>
            {categoryLabel(t, id)}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-4">
        {[['featured', t('templates.featured')], ['popular', t('templates.popular')], ['new', t('templates.new')], ['favorites', t('templates.favorites')], ['mine', t('templates.mine')], ['installed', t('templates.installed')]].map(([id, label]) => (
          <button key={id} type="button" className={(id === 'favorites' || id === 'mine' || id === 'installed' ? view : tab) === id ? 'tab tab-on' : 'tab'} onClick={() => setParams((current) => { const next = new URLSearchParams(current); if (id === 'favorites' || id === 'mine' || id === 'installed') next.set('view', id); else { next.delete('view'); next.set('sort', id) } return next })}>{label}</button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? (
        <div className="theme-grid" aria-busy="true">
          {[0, 1, 2].map((item) => <div key={item} className="theme-swatch animate-pulse bg-neutral-100" />)}
        </div>
      ) : (
        <div className="theme-grid">
          {shown.map((item) => <TemplateCard key={item.id} listing={item} />)}
          {!shown.length ? <p>{t('templates.empty')}</p> : null}
        </div>
      )}
    </section>
  )
}

export function TemplateDetailPage() {
  const { t } = useI18n()
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { adoptInstalledPage } = useLibrary()
  const { state, refresh } = useStore()
  const [listing, setListing] = useState<TemplateListing | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState(true)

  useEffect(() => {
    if (!user || !templateId) return
    void getTemplate(user.id, templateId).then(setListing)
  }, [user, templateId])

  if (!listing) return <section className="theme-page">{t('templates.loading')}</section>

  const installed = state.installed.find((item) => item.listingId === listing.id)
  const favored = state.favorites.includes(listing.id)

  return (
    <section data-theme-protected className="theme-page">
      <Link className="text-sm" to={ROUTES.storeTemplates}>{t('templates.back')}</Link>
      <div className="theme-editor mt-6">
        <div>
          {listing.thumbnailUrl ? <img className="mb-4 w-full rounded-xl" src={listing.thumbnailUrl} alt="" /> : null}
          <TemplatePreviewProvider snapshot={listing.snapshot}>
            <div className="rounded-xl border border-line p-4">
              <PageBuilder blocks={listing.snapshot.blocks} editing={false} onChange={() => undefined} />
            </div>
          </TemplatePreviewProvider>
        </div>
        <div>
          <h1>{listing.name}</h1>
          <Link to={ROUTES.creator(listing.creatorId ?? 'blanky')}>{listing.creatorName}</Link>
          <p className="my-5 whitespace-pre-wrap">{listing.description}</p>
          <p className="text-sm">{t('templates.guide')}</p>
          <p className="my-2 whitespace-pre-wrap text-sm text-neutral-600">{listing.snapshot.guide || listing.description}</p>
          <p className="text-sm">{t('templates.fields')}: {listing.snapshot.collections.flatMap((item) => item.blocks.map((block) => block.props.label).filter(Boolean)).join(' · ')}</p>
          <p className="mt-3 text-sm">{listing.installCount} · {listing.category} · v{listing.currentVersion}</p>
          {hint ? <p className="my-3 text-sm text-neutral-500">{t('templates.installHint')}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                if (!user) return
                setBusy(true)
                void installTemplate(user.id, listing)
                  .then((installedPage) => {
                    adoptInstalledPage(installedPage, !isSupabaseConfigured)
                    setHint(false)
                    navigate(ROUTES.page(installedPage.page.id))
                  })
                  .catch((err: Error) => setMessage(err.message))
                  .finally(() => setBusy(false))
              }}
            >
              {installed ? t('templates.openInstalled') : t('templates.install')}
            </button>
            <button type="button" className="btn btn-line" onClick={() => { if (!user) return; void toggleFavorite(user.id, listing.id, !favored).then(refresh) }}>{favored ? t('templates.unfavorite') : t('templates.favorite')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => void navigator.clipboard.writeText(window.location.origin + sharePath(listing.id)).then(() => setMessage(t('templates.copied')))}>{t('templates.share')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { const reason = window.prompt(t('templates.reportAsk')); if (reason) void reportTemplate(listing.id, reason).then(() => setMessage(t('templates.reported'))) }}>{t('templates.report')}</button>
            {state.admin ? (
              <>
                <button type="button" className="btn btn-line" onClick={() => void reviewTemplate(listing.id, 'published').then(refresh)}>{t('templates.approve')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => void reviewTemplate(listing.id, 'rejected', 'policy').then(refresh)}>{t('templates.reject')}</button>
              </>
            ) : null}
          </div>
          <p role="status" className="mt-3">{message}</p>
        </div>
      </div>
    </section>
  )
}

export function TemplateLibraryPage() {
  const { t } = useI18n()
  const { user, state, refresh } = useStore()
  const mine = state.listings.filter((item) => item.creatorId === user?.id)
  return (
    <section className="theme-page">
      <h1>{t('templates.library')}</h1>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-3 font-medium">{t('templates.mine')}</h2>
          {mine.length ? mine.map((item) => (
            <div key={item.id} className="mb-4 rounded-md border border-line p-3">
              <Link to={ROUTES.templateDetail(item.id)}>{item.name}</Link>
              <p className="text-xs text-neutral-500">{item.status} · v{item.currentVersion} · {item.installCount}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => { if (!user) return; void updateListing(user.id, item.id, { status: 'unlisted' }).then(refresh) }}>{t('templates.unpublish')}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { if (!user) return; void updateListing(user.id, item.id, { status: 'archived' }).then(refresh) }}>{t('templates.archive')}</button>
              </div>
            </div>
          )) : <p className="text-sm text-neutral-500">{t('templates.emptyMine')}</p>}
        </div>
        <div>
          <h2 className="mb-3 font-medium">{t('templates.installed')}</h2>
          {state.installed.length ? state.installed.map((item) => (
            <p key={item.requestId} className="mb-2"><Link to={ROUTES.page(item.pageId)}>{item.pageId.slice(0, 8)}</Link></p>
          )) : <p className="text-sm text-neutral-500">{t('templates.emptyInstalled')}</p>}
        </div>
      </div>
    </section>
  )
}

export function PublishTemplatePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user } = useSession()
  const { customPages, pageTemplates, records } = useLibrary()
  const pages = [...customPages, ...pageTemplates]
  const [sourceId, setSourceId] = useState(pages[0]?.id ?? '')
  const source = pages.find((item) => item.id === sourceId)
  const [name, setName] = useState(source?.name ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [category, setCategory] = useState('free')
  const [tags, setTags] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [guide, setGuide] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const collectionIds = new Set((source?.collections ?? []).map((item) => item.id))
  const sampleable = records.filter((item) => collectionIds.has(item.typeId))
  const [sampleIds, setSampleIds] = useState<string[]>([])

  return (
    <section className="theme-page max-w-xl">
      <h1>{t('templates.publish')}</h1>
      <p className="my-3 text-sm text-neutral-500">{t('templates.publishHint')}</p>
      <label className="mt-4 block text-sm">{t('templates.source')}
        <select className="field mt-1 w-full" value={sourceId} onChange={(event) => { const page = pages.find((item) => item.id === event.target.value); setSourceId(event.target.value); setName(page?.name ?? ''); setDescription(page?.description ?? '') }}>
          {pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-sm">{t('templates.name')}<input className="field mt-1 w-full" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="mt-3 block text-sm">{t('templates.description')}<textarea className="field mt-1 w-full" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="mt-3 block text-sm">{t('templates.category')}
        <select className="field mt-1 w-full" value={category} onChange={(event) => setCategory(event.target.value)}>
          {TEMPLATE_CATEGORIES.map((id) => <option key={id} value={id}>{categoryLabel(t, id)}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-sm">{t('templates.tags')}<input className="field mt-1 w-full" value={tags} onChange={(event) => setTags(event.target.value)} /></label>
      <label className="mt-3 block text-sm">{t('templates.cover')}<input className="field mt-1 w-full" type="url" value={thumbnailUrl} onChange={(event) => setThumbnailUrl(event.target.value)} placeholder="https://" /></label>
      <label className="mt-3 block text-sm">{t('templates.guide')}<textarea className="field mt-1 w-full" value={guide} onChange={(event) => setGuide(event.target.value)} /></label>
      {sampleable.length ? (
        <fieldset className="mt-4">
          <legend className="text-sm">{t('templates.samples')}</legend>
          {sampleable.slice(0, 20).map((item) => (
            <label key={item.id} className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sampleIds.includes(item.id)} onChange={(event) => setSampleIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
              {item.title}
            </label>
          ))}
        </fieldset>
      ) : null}
      <button
        type="button"
        className="btn btn-primary mt-6"
        disabled={busy || !source || !user}
        onClick={() => {
          if (!source || !user) return
          setBusy(true)
          void publishTemplate(user.id, {
            source: { ...source, collections: source.collections ?? [] },
            name,
            description,
            category,
            tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
            thumbnailUrl,
            gallery: [],
            language: 'ko',
            guide,
            samples: sampleable.filter((item) => sampleIds.includes(item.id)).map((item) => ({ collectionId: item.typeId, title: item.title, values: item.values })),
            sampleIds,
          }).then((id) => navigate(ROUTES.templateDetail(String(id)))).catch((err: Error) => setMessage(err.message)).finally(() => setBusy(false))
        }}
      >
        {t('templates.submit')}
      </button>
      <p role="status" className="mt-3">{message}</p>
    </section>
  )
}
