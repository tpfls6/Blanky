import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronRight, Flag, Heart, LayoutTemplate, Library, Link2, Upload } from 'lucide-react'
import { TemplatePreview } from '../Custom/TemplatePreview.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import { officialListings } from '../../features/marketplace/official.ts'
import { TemplatePreviewProvider } from '../../features/marketplace/preview.tsx'
import { TEMPLATE_CATEGORIES, type TemplateListing, type TemplateSnapshot } from '../../features/marketplace/schema.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
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
import { CreatorRow, SortMenu, StoreBar, StoreChip, StoreChips, StoreDetailBar, StoreMenuSheet, StoreStats, StoreToast, type StoreMenuItem } from './StoreChrome.tsx'
import { useFlash } from './useFlash.ts'
import { CustomizationSheet } from '../Custom/CustomizationSheet.tsx'
import { StoreTabs } from './StoreTabs.tsx'
import { TemplateThumbnail } from './TemplateThumbnail.tsx'

function categoryLabel(t: (key: string) => string, id: string) {
  return t('templates.cat.' + id)
}

/** Kind badge: the page kind when the template is one, else its category. */
function kindOf(t: (key: string) => string, listing: TemplateListing) {
  return listing.snapshot.pageType ? t(`custom.kind.${listing.snapshot.pageType}`) : categoryLabel(t, listing.category)
}

function TemplateCard({ listing, favored, onFavorite }: { listing: TemplateListing; favored: boolean; onFavorite?: () => void }) {
  const { t, locale } = useI18n()
  const installs = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(listing.installCount)
  return (
    <article className="store-card store-tcard">
      <Link to={ROUTES.templateDetail(listing.id)} className="block">
        <span className="store-tthumb">
          <TemplateThumbnail listing={listing} />
          <span className="store-badge">{kindOf(t, listing)}</span>
        </span>
        <h2 className="store-card-name">{listing.name}</h2>
        <p className="store-card-by">{listing.creatorName} · {t('store.installs', { count: installs })}</p>
      </Link>
      {/* Outside the link so the heart toggles without opening the detail. */}
      {onFavorite ? (
        <button type="button" className="store-fav" aria-pressed={favored} aria-label={t('store.favoriteOf', { name: listing.name })} onClick={onFavorite}>
          <span className="store-fav-dot"><Heart className="size-4" strokeWidth={2} fill={favored ? 'currentColor' : 'none'} aria-hidden="true" /></span>
        </button>
      ) : null}
    </article>
  )
}

type PreviewSource = Pick<TemplateSnapshot, 'pageType' | 'fieldLabels' | 'blocks' | 'collections' | 'samples'>

function ListingPreview({ snapshot, heading }: { snapshot: PreviewSource; heading: string }) {
  if (snapshot.pageType) return <TemplatePreview kind={snapshot.pageType} heading={heading} labels={snapshot.fieldLabels} />
  return (
    <TemplatePreviewProvider snapshot={snapshot}>
      <div className="rounded-xl border border-line p-4">
        <PageBuilder blocks={snapshot.blocks} editing={false} onChange={() => undefined} />
      </div>
    </TemplatePreviewProvider>
  )
}

// Templates the user registered, browsed in place: list and details on the left, live preview on the right.
function MyTemplates({ listings }: { listings: TemplateListing[] }) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState('')
  const selected = listings.find((item) => item.id === selectedId) ?? listings[0]
  if (!selected) return <p className="store-state">{t('templates.emptyRegistered')}</p>
  return (
    <div className="store-split" data-testid="my-templates">
      <div>
        <div className="store-list" role="list">
          {listings.map((item) => (
            <button key={item.id} type="button" role="listitem" className="store-list-item" aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span>
              <span className="shrink-0 text-xs text-neutral-500">{t('templates.status.' + item.status)}</span>
            </button>
          ))}
        </div>
        <h2 className="text-lg font-medium">{selected.name}</h2>
        <p className="store-meta mt-1"><span>{t('templates.status.' + selected.status)}</span><span>v{selected.currentVersion}</span><span>{categoryLabel(t, selected.category)}</span><span>{selected.installCount}</span></p>
        {selected.description ? <p className="mt-4 whitespace-pre-wrap text-sm">{selected.description}</p> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn btn-primary" to={ROUTES.templateDetail(selected.id)}>{t('templates.viewDetail')}</Link>
          <Link className="btn btn-line" to={ROUTES.templateLibrary}>{t('templates.library')}</Link>
        </div>
      </div>
      <div className="store-split-preview"><ListingPreview snapshot={selected.snapshot} heading={selected.name} /></div>
    </div>
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

type TemplateSort = 'featured' | 'popular' | 'new'

export function TemplateStore() {
  const { t } = useI18n()
  const phone = useMediaQuery(PHONE_QUERY)
  const { user, state, error, loading, refresh } = useStore()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [items, setItems] = useState<TemplateListing[]>(state.listings)
  const tab = params.get('sort') ?? 'featured'
  const category = params.get('category') ?? ''
  const view = params.get('view') ?? 'browse'
  const setView = (id: string) => setParams((current) => { const next = new URLSearchParams(current); if (id === 'browse') next.delete('view'); else next.set('view', id); return next })
  const text = query.trim()

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

  const favorite = (id: string) => { if (!user) return; void toggleFavorite(user.id, id, !state.favorites.includes(id)).then(refresh) }
  // 전체 and the categories pick a category; 즐겨찾기 and 설치함 switch the view (as the old tabs did).
  const pickCategory = (id: string) => setParams((current) => { const next = new URLSearchParams(current); next.delete('view'); if (!id || category === id) next.delete('category'); else next.set('category', id); return next })
  const pickView = (id: 'favorites' | 'installed') => setParams((current) => { const next = new URLSearchParams(current); if (view === id) next.delete('view'); else next.set('view', id); return next })
  const menu: StoreMenuItem[] = [
    { label: t('store.publishTemplate'), icon: Upload, to: ROUTES.templatePublish, accent: true },
    { label: t('store.myTemplates'), icon: LayoutTemplate, onClick: () => setView('mine') },
    { label: t('templates.library'), icon: Library, to: ROUTES.templateLibrary },
  ]

  return (
    <section data-theme-protected className="theme-page store-page">
      <StoreBar phone={phone} query={view === 'mine' ? '' : query} onQuery={(value) => { setQuery(value); if (view === 'mine') setView('browse') }} searchLabel={t('templates.search')} menu={menu} onBack={view === 'mine' ? () => setView('browse') : undefined}
        actions={<>
          <button type="button" className="btn btn-line" aria-pressed={view === 'mine'} onClick={() => setView(view === 'mine' ? 'browse' : 'mine')}>{t('templates.myTemplates')}</button>
          <Link className="btn btn-primary" to={ROUTES.templatePublish}>{t('templates.publish')}</Link>
        </>} />
      <div className="store-body">
        <StoreTabs current="templates" />
        {view === 'mine' ? null : (
          <StoreChips label={t('store.filters')}>
            <StoreChip on={view === 'browse' && !category} onClick={() => pickCategory('')}>{t('store.all')}</StoreChip>
            {TEMPLATE_CATEGORIES.map((id) => <StoreChip key={id} on={view === 'browse' && category === id} onClick={() => pickCategory(id)}>{categoryLabel(t, id)}</StoreChip>)}
            <StoreChip on={view === 'favorites'} onClick={() => pickView('favorites')}><Heart className="size-3.5" strokeWidth={2} aria-hidden="true" />{t('templates.favorites')}</StoreChip>
            <StoreChip on={view === 'installed'} onClick={() => pickView('installed')}>{t('store.installed')}</StoreChip>
          </StoreChips>
        )}
        {error ? (
          <p role="alert" className="store-state">{t('templates.loadError')} {error}</p>
        ) : loading ? (
          <div className="theme-grid" aria-busy="true" role="status" aria-label={t('templates.loading')}>
            {[0, 1, 2].map((item) => <div key={item} className="template-thumb animate-pulse bg-neutral-100" />)}
          </div>
        ) : view === 'mine' ? (
          <MyTemplates listings={shown} />
        ) : (
          <>
            <SortMenu<TemplateSort> count={text ? t('store.results', { count: shown.length }) : t('store.countTemplates', { count: shown.length })} value={tab === 'popular' || tab === 'new' ? tab : 'featured'}
              onChange={(value) => setParams((current) => { const next = new URLSearchParams(current); next.set('sort', value); return next })}
              options={(['featured', 'popular', 'new'] as const).map((value) => ({ value, label: t('store.sort.' + value) }))} />
            {!shown.length ? (
              <p className="store-state">{t('templates.empty')}</p>
            ) : text ? (
              <ul className="more-card store-results">
                {shown.map((item) => (
                  <li key={item.id}>
                    <Link to={ROUTES.templateDetail(item.id)} className="more-row">
                      <span className="store-art-sm store-tthumb-sm"><TemplateThumbnail listing={item} /></span>
                      <span className="more-rt"><span className="store-card-name">{item.name}</span><small>{item.creatorName} · {kindOf(t, item)}</small></span>
                      <ChevronRight className="more-chev size-4.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="theme-grid">
                {shown.map((item) => <TemplateCard key={item.id} listing={item} favored={state.favorites.includes(item.id)} onFavorite={user ? () => favorite(item.id) : undefined} />)}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

const REPORT_REASONS = ['spam', 'inappropriate', 'copyright', 'broken', 'other'] as const

/** Report sheet: a reason (required) and optional details, sent as one reason string as before. */
function ReportSheet({ name, onSubmit, onClose }: { name: string; onSubmit: (reason: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  return (
    <CustomizationSheet title={t('store.reportTitle')} subtitle={name} onClose={onClose}>
      <div className="more-card" role="radiogroup" aria-label={t('store.reportTitle')}>
        {REPORT_REASONS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={reason === id} className="more-row store-option" onClick={() => setReason(id)}>
            <span className="more-rt">{t('store.reason.' + id)}</span>
            {reason === id ? <Check className="size-4.5 shrink-0" strokeWidth={2} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <textarea className="field store-report-detail" value={detail} maxLength={500} onChange={(event) => setDetail(event.target.value)} aria-label={t('store.reportDetail')} placeholder={t('store.reportDetail')} />
      <button type="button" className="btn store-report-submit" disabled={!reason} onClick={() => { onClose(); onSubmit(t('store.reason.' + reason) + (detail.trim() ? ': ' + detail.trim() : '')) }}>{t('store.reportSubmit')}</button>
    </CustomizationSheet>
  )
}

export function TemplateDetailPage() {
  const { t, locale } = useI18n()
  const { templateId } = useParams()
  const navigate = useNavigate()
  const { user } = useSession()
  const { adoptInstalledPage } = useLibrary()
  const { state, refresh } = useStore()
  const phone = useMediaQuery(PHONE_QUERY)
  const [listing, setListing] = useState<TemplateListing | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState(0)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState(true)
  const [sheet, setSheet] = useState<'menu' | 'report' | null>(null)
  const [openPage, setOpenPage] = useState('')
  const toast = useFlash(message, messages, openPage ? 6000 : 3500)

  useEffect(() => {
    if (!user || !templateId) return
    void getTemplate(user.id, templateId).then(setListing)
  }, [user, templateId])

  if (!listing) return <section className="theme-page"><p role="status" className="store-state">{t('templates.loading')}</p></section>

  const say = (text: string, page = '') => { setMessage(text); setOpenPage(page); setMessages((n) => n + 1) }
  const installed = state.installed.find((item) => item.listingId === listing.id)
  const favored = state.favorites.includes(listing.id)
  const guide = listing.snapshot.guide.trim()
  const fields = listing.snapshot.pageType ? [t(`custom.kind.${listing.snapshot.pageType}`)] : listing.snapshot.collections.flatMap((item) => item.blocks.map((block) => block.props.label).filter(Boolean)) as string[]
  const byCreator = state.listings.filter((item) => item.status === 'published' && item.creatorId === listing.creatorId).length
  const share = () => void navigator.clipboard.writeText(window.location.origin + sharePath(listing.id)).then(() => say(t('templates.copied')))
  const install = () => {
    if (!user) return
    setBusy(true)
    void installTemplate(user.id, listing)
      .then((installedPage) => {
        adoptInstalledPage(installedPage, !isSupabaseConfigured)
        setHint(false)
        // Opening an installed one goes straight to its page; a first install stays here and offers 열기.
        if (installed) navigate(ROUTES.page(installedPage.page.id))
        else { say(t('store.installedToast'), installedPage.page.id); void refresh() }
      })
      .catch((err: Error) => say(err.message))
      .finally(() => setBusy(false))
  }
  const favorite = <button type="button" className="btn btn-line store-fav-btn" aria-pressed={favored} aria-label={favored ? t('templates.unfavorite') : t('templates.favorite')} onClick={() => { if (!user) return; void toggleFavorite(user.id, listing.id, !favored).then(refresh) }}>
    <Heart className="size-5" strokeWidth={2} fill={favored ? 'currentColor' : 'none'} aria-hidden="true" />{phone ? null : favored ? t('templates.unfavorite') : t('templates.favorite')}
  </button>
  const primary = <button type="button" className="btn btn-primary" disabled={busy} onClick={install}>{installed ? t('templates.openInstalled') : t('templates.install')}</button>

  return (
    <section data-theme-protected className="theme-page store-page store-detail">
      {phone ? <StoreDetailBar onShare={share} onMore={() => setSheet('menu')} backTo={ROUTES.storeTemplates} /> : <Link className="text-sm" to={ROUTES.storeTemplates}>{t('templates.back')}</Link>}
      {state.admin ? (
        <div className="store-review" role="group" aria-label={t('store.adminReview')}>
          <p><span className="store-badge-inline">{t('templates.status.' + listing.status)}</span><b>{t('store.adminReview')}</b></p>
          <div>
            <button type="button" className="btn btn-line" onClick={() => void reviewTemplate(listing.id, 'rejected', 'policy').then(refresh)}>{t('templates.reject')}</button>
            <button type="button" className="btn btn-primary" onClick={() => void reviewTemplate(listing.id, 'published').then(refresh)}>{t('templates.approve')}</button>
          </div>
        </div>
      ) : null}
      {phone ? <div className="store-hero store-hero-template"><TemplateThumbnail listing={listing} /></div> : null}
      <div className="store-split">
        <div className="store-info">
          <p className="store-badges">{listing.snapshot.pageType ? <span className="store-badge-inline">{t(`custom.kind.${listing.snapshot.pageType}`)}</span> : null}<span className="store-badge-inline store-badge-gray">{categoryLabel(t, listing.category)}</span></p>
          <h1>{listing.name}</h1>
          {!phone ? <div className="store-detail-actions">{favorite}{primary}
            <button type="button" className="btn btn-ghost" onClick={share}><Link2 className="size-4" strokeWidth={1.8} aria-hidden="true" />{t('templates.share')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setSheet('report')}><Flag className="size-4" strokeWidth={1.8} aria-hidden="true" />{t('templates.report')}</button>
          </div> : null}
          <CreatorRow to={ROUTES.creator(listing.creatorId ?? 'blanky')} name={listing.creatorName} hint={listing.creatorId ? (byCreator ? t('store.creatorTemplates', { count: byCreator }) : t('store.creatorPage')) : t('store.official')} />
          <StoreStats items={[
            { value: new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(listing.installCount), label: t('store.installsLabel') },
            { value: 'v' + listing.currentVersion, label: t('store.version') },
          ]} />
          {listing.description ? <><h2 className="more-label">{t('store.about')}</h2><p className="store-desc">{listing.description}</p></> : null}
          {fields.length ? <><h2 className="more-label">{t('store.included')}</h2><ul className="store-tags">{fields.map((item, index) => <li key={item + index}>{item}</li>)}</ul></> : null}
          {guide && guide !== listing.description.trim() ? (
            <details className="more-card store-guide">
              <summary className="more-row"><span className="more-rt">{t('templates.guide')}</span><ChevronRight className="more-chev more-chev-toggle size-4.5" aria-hidden="true" /></summary>
              <p>{guide}</p>
            </details>
          ) : null}
          {hint ? <p className="more-hint">{t('templates.installHint')}</p> : null}
        </div>
        <div className="store-split-preview">
          {listing.thumbnailUrl ? <img className="mb-4 w-full rounded-xl" src={listing.thumbnailUrl} alt="" /> : null}
          <ListingPreview snapshot={listing.snapshot} heading={listing.name} />
        </div>
      </div>
      {phone ? <div className="store-actionbar">{favorite}{primary}</div> : null}
      <StoreToast message={toast} action={toast && openPage ? <Link to={ROUTES.page(openPage)}>{t('store.open')}</Link> : undefined} />
      {sheet === 'menu' ? <StoreMenuSheet title={listing.name} subtitle={listing.creatorName} onClose={() => setSheet(null)} groups={[
        [{ label: t('store.copyLink'), icon: Link2, onClick: share }],
        [{ label: t('templates.report'), icon: Flag, danger: true, onClick: () => setSheet('report') }],
      ]} /> : null}
      {sheet === 'report' ? <ReportSheet name={listing.name} onClose={() => setSheet(null)} onSubmit={(reason) => void reportTemplate(listing.id, reason).then(() => say(t('templates.reported')))} /> : null}
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
              <p className="text-xs text-neutral-500">{t('templates.status.' + item.status)} · v{item.currentVersion} · {item.installCount}</p>
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
  const [params] = useSearchParams()
  const { user } = useSession()
  const { customPages, pageTemplates, records } = useLibrary()
  const pages = [...customPages, ...pageTemplates]
  const [sourceId, setSourceId] = useState(() => {
    const preset = params.get('id')
    return preset && pages.some((item) => item.id === preset) ? preset : pages[0]?.id ?? ''
  })
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
  const samples = sampleable.filter((item) => sampleIds.includes(item.id)).map((item) => ({ collectionId: item.typeId, title: item.title, values: item.values }))

  return (
    <section data-theme-protected className="theme-page">
      <div className="store-split">
        <div>
          <h1>{t('templates.publish')}</h1>
          <p className="my-3 text-sm text-neutral-500">{t('templates.publishHint')}</p>
          {!pages.length ? <p className="store-state">{t('templates.emptySource')}</p> : null}
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
                samples,
                sampleIds,
              }).then((id) => navigate(ROUTES.templateDetail(String(id)))).catch((err: Error) => setMessage(err.message)).finally(() => setBusy(false))
            }}
          >
            {t('templates.submit')}
          </button>
          <p role="status" className="mt-3">{message}</p>
        </div>
        {source ? (
          <div className="store-split-preview">
            <ListingPreview heading={name || source.name} snapshot={{ pageType: source.template ?? undefined, fieldLabels: source.fieldLabels, blocks: source.blocks, collections: source.collections ?? [], samples }} />
          </div>
        ) : null}
      </div>
    </section>
  )
}
