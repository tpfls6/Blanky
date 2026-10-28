import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { IconView } from '../../constants/icons.ts'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import { forkSnapshot } from '../../features/marketplace/install.ts'
import { TemplatePreviewProvider } from '../../features/marketplace/preview.tsx'
import { cloneBlock } from '../../features/records/schema.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { DEFAULT_FIELD_LABELS } from '../../features/pages/templates.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { deleteTemplatePackage, listTemplatePackages, putTemplatePackage } from '../../services/templates/localPackages.ts'
import { compareSemver, isTemplatePackageFile, snapshotHasContent, type InstalledTemplatePackage, type TemplatePackage } from '../../template/package/schema.ts'
import { downloadTemplate, exportTemplatePackage, importTemplatePackages } from '../../template/package/TemplateLoader.ts'
import { systemPageType } from '../../template/package/TemplateValidator.ts'
import { TemplatePreview } from './TemplatePreview.tsx'

function previewSrc(pkg: TemplatePackage): string | null {
  const path = pkg.manifest.preview ?? Object.values(pkg.manifest.assets)[0]
  const file = path ? pkg.files[path] : undefined
  return file ? 'data:' + file.mime + ';base64,' + file.data : null
}

export function TemplateImport() {
  const { t } = useI18n()
  const { user } = useSession()
  const confirm = useConfirm()
  const [pending, setPending] = useState<TemplatePackage[]>([])
  const [installed, setInstalled] = useState<InstalledTemplatePackage[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)

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

  return (
    <div className="theme-custom-pane mt-8 max-w-none">
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
        <input aria-label={t('custom.importTitle')} type="file" accept=".blankytpl,.json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void open(file) }} />
      </label>
      <p role={message && !pending.length ? 'alert' : 'status'} className="mt-2 text-sm text-neutral-500">{message}</p>
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
      <InstalledList items={installed} onRemove={(item) => void remove(item)} />
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
      <p className="mt-1 text-sm text-neutral-500">
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
        <p role="status" className="text-sm text-neutral-500">{t('custom.importEmptyBody')}</p>
      )}
    </div>
  )
}

function InstalledList({ items, onRemove }: { items: InstalledTemplatePackage[]; onRemove: (item: InstalledTemplatePackage) => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { addUserPage, addRecordType, adoptInstalledPage } = useLibrary()

  const createPage = (item: InstalledTemplatePackage) => {
    const kind = systemPageType(item.manifest.pageType)
    if (kind) {
      navigate(ROUTES.page(addUserPage({
        template: kind,
        name: item.manifest.name,
        icon: item.manifest.icon,
        fieldLabels: item.manifest.fieldLabels ?? { ...DEFAULT_FIELD_LABELS[kind] },
      })))
      return
    }
    if (!item.snapshot) return
    const built = forkSnapshot(item.snapshot)
    adoptInstalledPage({ ...built, records: [] })
    navigate(ROUTES.page(built.page.id))
  }

  const createRecord = (item: InstalledTemplatePackage) => {
    const collection = item.snapshot?.collections[0]
    if (!collection) return
    const id = addRecordType({
      name: collection.name,
      icon: collection.icon,
      color: collection.color,
      description: collection.description,
      blocks: collection.blocks.map(cloneBlock),
    })
    if (id) navigate(ROUTES.record(id))
  }

  if (!items.length) return <p className="mt-6 text-sm text-neutral-400">{t('custom.emptyTemplates')}</p>

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">{t('custom.myTemplates')}</h2>
      <ul className="mt-3 overflow-hidden rounded-md border border-line bg-surface">
        {items.map((item) => (
          <li key={item.installedId} className="border-b border-line px-3 py-3 last:border-b-0">
            <div className="flex items-center gap-3">
              <IconView name={item.manifest.icon} className="size-4 shrink-0 text-neutral-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.manifest.name}</p>
                <p className="truncate text-xs text-neutral-400">
                  {t('custom.pageType.' + item.manifest.pageType)} · v{item.manifest.version}
                  {item.manifest.author ? ' · ' + item.manifest.author : ''}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <button type="button" className="chip" onClick={() => createPage(item)}>{t('custom.createPage')}</button>
              {item.snapshot?.collections.length ? (
                <button type="button" className="chip" onClick={() => createRecord(item)}>{t('custom.createRecord')}</button>
              ) : null}
              <button
                type="button"
                className="chip"
                onClick={() => void exportTemplatePackage(item).then((blob) => downloadTemplate(blob, item.manifest.name))}
              >
                {t('custom.exportFile')}
              </button>
              <button type="button" className="chip" onClick={() => onRemove(item)}>{t('delete')}</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
