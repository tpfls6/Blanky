import { useEffect, useRef, useState } from 'react'
import { ChevronRight, LayoutTemplate, Store, Upload } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { IconView } from '../../constants/icons.ts'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import { forkSnapshot } from '../../features/marketplace/install.ts'
import { TemplatePreviewProvider } from '../../features/marketplace/preview.tsx'
import { useI18n } from '../../i18n/useI18n.ts'
import { DEFAULT_FIELD_LABELS, initialFieldLabels } from '../../features/pages/templates.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { deleteTemplatePackage, listTemplatePackages, putTemplatePackage } from '../../services/templates/localPackages.ts'
import { compareSemver, isTemplatePackageFile, snapshotHasContent, type InstalledTemplatePackage, type TemplatePackage } from '../../template/package/schema.ts'
import { importTemplatePackages } from '../../template/package/TemplateLoader.ts'
import { systemPageType } from '../../template/package/TemplateValidator.ts'
import { TemplatePreview } from './TemplatePreview.tsx'
import { CustomizationSheet } from './CustomizationSheet.tsx'

function previewSrc(pkg: TemplatePackage): string | null {
  const path = pkg.manifest.preview ?? Object.values(pkg.manifest.assets)[0]
  const file = path ? pkg.files[path] : undefined
  return file ? 'data:' + file.mime + ';base64,' + file.data : null
}

export function TemplateImport({ list = true, dropzone = true, hideEmpty = false, sheet, query = '', emptyCard = false, onImport }: {
  list?: boolean
  dropzone?: boolean
  hideEmpty?: boolean
  sheet?: { open: boolean; onClose: () => void }
  query?: string
  /** Phones and tablets: the empty list becomes a card with 템플릿 가져오기 / 스토어 둘러보기. */
  emptyCard?: boolean
  /** Opens the import sheet; without it the card's button opens the file picker. */
  onImport?: () => void
}) {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const [pending, setPending] = useState<TemplatePackage[]>([])
  const [installed, setInstalled] = useState<InstalledTemplatePackage[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => {
    if (!user) return
    void listTemplatePackages(user.id).then(setInstalled).catch((error: Error) => setMessage(error.message))
  }

  useEffect(load, [user])

  const open = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setPending([])
    setMessage(t('custom.importChecking'))
    try {
      if (!isTemplatePackageFile(file.name)) throw new Error(t('custom.importNeedFile'))
      setPending(await importTemplatePackages(file))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('custom.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  const save = async (pkg: TemplatePackage, mode: 'add' | 'replace' | 'copy') => {
    if (!user) return
    setBusy(true)
    try {
      const same = installed.filter((item) => item.manifest.id === pkg.manifest.id)
      const existing = same[0]
      if (mode === 'add' && existing) return
      const installedId = mode === 'replace' && existing ? existing.installedId : crypto.randomUUID()
      const next: InstalledTemplatePackage = {
        ...pkg,
        manifest: {
          ...pkg.manifest,
          id: mode === 'copy' ? pkg.manifest.id + '-copy' : pkg.manifest.id,
          name: mode === 'copy' ? pkg.manifest.name + ' 복사본' : pkg.manifest.name,
        },
        installedId,
        installedAt: existing && mode === 'replace' ? existing.installedAt : new Date().toISOString(),
      }
      if (mode === 'copy') next.manifest.id = slugCopy(pkg.manifest.id, installed)
      await putTemplatePackage(user.id, next)
      setPending((current) => current.filter((item) => item !== pkg))
      load()
      setMessage(t('custom.importSaved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('custom.importFailed'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item: InstalledTemplatePackage) => {
    if (!user) return
    if (!(await confirm(t('custom.deletePackageBody', { name: item.manifest.name }), { title: t('custom.deletePackageTitle', { name: item.manifest.name }) }))) return
    await deleteTemplatePackage(user.id, item.installedId)
    load()
  }

  const importer = <>
      {dropzone || sheet ? (
        <label
          className="theme-dropzone"
          data-active={over}
          onDragEnter={(event) => { event.preventDefault(); setOver(true) }}
          onDragOver={(event) => { event.preventDefault(); setOver(true) }}
          onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false) }}
          onDrop={(event) => { event.preventDefault(); setOver(false); void open(event.dataTransfer.files[0]) }}
        >
          <strong>{t('custom.importTitle')}</strong>
          <p>{t('custom.importHint')}</p>
          <input ref={fileRef} aria-label={t('custom.importTitle')} type="file" accept=".blankytpl,.json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void open(file) }} />
        </label>
      ) : (
        <label className="btn btn-line theme-import-label">
          {t('custom.importTitle')}
          <input ref={fileRef} aria-label={t('custom.importTitle')} type="file" accept=".blankytpl,.json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void open(file) }} />
        </label>
      )}
      {message ? <p role={pending.length ? 'status' : 'alert'} className="mt-2 text-sm text-neutral-500 max-lg:text-[var(--muted)]">{message}</p> : null}
      {pending.map((pkg, index) => (
        <ImportReview
          key={pkg.manifest.id + index}
          pkg={pkg}
          installed={installed.find((item) => item.manifest.id === pkg.manifest.id) ?? null}
          busy={busy}
          onAdd={() => void save(pkg, 'add')}
          onReplace={() => void save(pkg, 'replace')}
          onCopy={() => void save(pkg, 'copy')}
          onCancel={() => setPending((current) => current.filter((item) => item !== pkg))}
        />
      ))}
  </>
  const search = query.trim().toLowerCase()
  const visibleInstalled = search ? installed.filter(({ manifest }) =>
    manifest.name.toLowerCase().includes(search) || manifest.description?.toLowerCase().includes(search)
  ) : installed

  return (
    <div className={dropzone && !sheet ? 'theme-custom-pane mt-8 max-w-none' : 'mt-2'}>
      {sheet
        ? sheet.open && <CustomizationSheet title={t('custom.importTitle')} onClose={() => {
          if (busy) return
          setPending([])
          setMessage('')
          sheet.onClose()
        }}>{importer}</CustomizationSheet>
        : importer}
      {list ? <InstalledList
        items={visibleInstalled}
        compact={Boolean(sheet)}
        hideEmpty={hideEmpty}
        onRemove={(item) => void remove(item)}
        onImport={emptyCard ? onImport ?? (() => fileRef.current?.click()) : undefined}
      /> : null}
    </div>
  )
}

function slugCopy(id: string, installed: InstalledTemplatePackage[]): string {
  let next = id + '-copy'
  let n = 2
  while (installed.some((item) => item.manifest.id === next)) {
    next = id + '-copy-' + n
    n += 1
  }
  return next
}

function ImportReview({
  pkg,
  installed,
  busy,
  onAdd,
  onReplace,
  onCopy,
  onCancel,
}: {
  pkg: TemplatePackage
  installed: InstalledTemplatePackage | null
  busy: boolean
  onAdd: () => void
  onReplace: () => void
  onCopy: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const newer = installed ? compareSemver(pkg.manifest.version, installed.manifest.version) : 1
  return (
    <section className="theme-import-review" aria-label={t('custom.importReview')}>
      <h2 className="text-lg font-medium">{pkg.manifest.name}</h2>
      <p className="mt-1 text-sm text-neutral-500 max-lg:text-[var(--muted)]">
        {t('custom.importMeta', { author: pkg.manifest.author || t('custom.unknownAuthor'), version: pkg.manifest.version })}
        {' · '}
        {t('custom.pageType.' + pkg.manifest.pageType)}
      </p>
      {pkg.manifest.description ? <p className="mt-2 text-sm">{pkg.manifest.description}</p> : null}
      {installed ? (
        <p role="status" className="mt-3 text-sm">
          {t('custom.importConflict', { installed: installed.manifest.version, incoming: pkg.manifest.version })}
          {newer > 0 ? ' ' + t('custom.importNewer') : newer < 0 ? ' ' + t('custom.importOlder') : ' ' + t('custom.importSame')}
        </p>
      ) : null}
      <PackagePreview pkg={pkg} />
      <div className="my-3 flex flex-wrap gap-2">
        {installed ? (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onReplace}>{t('custom.replaceTemplate')}</button>
            <button type="button" className="btn btn-line" disabled={busy} onClick={onCopy}>{t('custom.saveCopy')}</button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onAdd}>{t('custom.addTemplate')}</button>
        )}
        <button type="button" className="btn btn-line" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </section>
  )
}

function PackagePreview({ pkg }: { pkg: TemplatePackage }) {
  const { t } = useI18n()
  const kind = systemPageType(pkg.manifest.pageType)
  const image = previewSrc(pkg)
  return (
    <div className="mt-4">
      {image ? <img src={image} alt="" className="mb-3 max-h-40 rounded-md object-contain" /> : null}
      {kind ? (
        <TemplatePreview kind={kind} heading={pkg.manifest.name} labels={pkg.manifest.fieldLabels ?? DEFAULT_FIELD_LABELS[kind]} />
      ) : snapshotHasContent(pkg.snapshot) && pkg.snapshot ? (
        <TemplatePreviewProvider snapshot={pkg.snapshot}>
          <div className="rounded-md border border-line p-3">
            <PageBuilder blocks={pkg.snapshot.blocks} editing={false} onChange={() => undefined} />
          </div>
        </TemplatePreviewProvider>
      ) : (
        <p role="status" className="text-sm text-neutral-500 max-lg:text-[var(--muted)]">{t('custom.importEmptyBody')}</p>
      )}
    </div>
  )
}

function InstalledList({ items, compact, hideEmpty, onRemove, onImport }: { items: InstalledTemplatePackage[]; compact: boolean; hideEmpty?: boolean; onRemove: (item: InstalledTemplatePackage) => void; onImport?: () => void }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { addUserPage, adoptInstalledPage } = useLibrary()

  const materialize = (item: InstalledTemplatePackage) => {
    const kind = systemPageType(item.manifest.pageType)
    if (kind) {
      return addUserPage({
        template: kind,
        name: item.manifest.name,
        icon: item.manifest.icon,
        fieldLabels: item.manifest.fieldLabels ?? initialFieldLabels(kind, locale),
      })
    }
    if (!item.snapshot) return
    const built = forkSnapshot(item.snapshot)
    adoptInstalledPage({ ...built, records: [] })
    return built.page.id
  }

  if (!items.length && hideEmpty) return null
  if (!items.length && onImport) return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5 text-center">
      <span className="mx-auto grid size-8 place-items-center rounded-[10px] bg-accent-light text-accent"><LayoutTemplate aria-hidden="true" className="size-4.5" strokeWidth={1.8} /></span>
      <h2 className="mt-3 text-[15px] font-semibold">{t('custom.emptyTemplatesTitle')}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{t('custom.emptyTemplatesBody')}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn btn-primary inline-flex min-h-11 items-center gap-1.5" onClick={onImport}>
          <Upload aria-hidden="true" className="size-4" strokeWidth={1.8} />{t('custom.importTemplate')}
        </button>
        <Link className="btn btn-line inline-flex min-h-11 items-center gap-1.5" to={ROUTES.storeTemplates}>
          <Store aria-hidden="true" className="size-4" strokeWidth={1.8} />{t('custom.browseStore')}
        </Link>
      </div>
    </div>
  )
  if (!items.length) return <p className="mt-6 text-sm text-neutral-400">{t('custom.emptyTemplates')}</p>

  return (
    <section className="mt-4 md:mt-8">
      <h2 className="mb-2 font-medium max-lg:text-[15px] max-lg:font-semibold">{t('custom.installedTemplates')}</h2>
      <div className={compact ? 'divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface' : 'divide-y divide-line'}>
        {items.map((item) => {
          const Row = compact ? 'span' : 'div'
          const Name = compact ? 'span' : 'h2'
          const identity = (
            <Row className={compact ? 'flex min-w-0 flex-1 items-center gap-2' : 'flex min-w-0 items-start gap-2'}>
              <span className={compact ? 'grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent-light text-accent' : 'mt-0.5 shrink-0 text-neutral-400 max-lg:text-[var(--muted)]'}>
                <IconView name={item.manifest.icon} className="size-4" />
              </span>
              <Row className="min-w-0">
                <Name className="block truncate font-medium">{item.manifest.name}</Name>
                <span className="block truncate text-xs text-neutral-400 max-lg:text-[var(--muted)]">
                  {t('custom.pageType.' + item.manifest.pageType)} · v{item.manifest.version}
                  {item.manifest.author ? ' · ' + item.manifest.author : ''}
                </span>
              </Row>
            </Row>
          )
          const actions = (
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className="btn btn-line"
                onClick={() => {
                  const pageId = materialize(item)
                  if (pageId) navigate(ROUTES.page(pageId))
                }}
              >
                {t('custom.createPage')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const pageId = materialize(item)
                  if (pageId) navigate(ROUTES.templatePublish + '?id=' + pageId)
                }}
              >
                {t('templates.publish')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onRemove(item)}>{t('delete')}</button>
            </div>
          )
          return compact ? (
            <article key={item.installedId}>
              <details className="group">
                <summary className="customization-template-summary flex min-h-14 cursor-pointer list-none items-center gap-2 px-3 py-2">
                  {identity}
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--muted)] group-open:rotate-90" strokeWidth={1.7} />
                </summary>
                <div className="border-t border-line px-3 py-3">
                  {actions}
                  <PackagePreview pkg={item} />
                </div>
              </details>
            </article>
          ) : (
            <article key={item.installedId} className="py-8">
              <div className="flex flex-wrap items-start justify-between gap-2">{identity}{actions}</div>
              <PackagePreview pkg={item} />
            </article>
          )
        })}
      </div>
    </section>
  )
}
