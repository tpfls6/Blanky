import { useState } from 'react'
import { ChevronRight, Plus, Search, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { PAGE_GAP_OPTIONS, PAGE_IDS, type PageId } from '../../features/pages/layout.ts'
import { recordsForPage } from '../../features/pages/pageRecords.ts'
import { IconView } from '../../constants/icons.ts'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { UserPage } from '../../features/builder/schema.ts'
import { DailyBoard } from '../Schedule/SchedulePage.tsx'
import { DiaryPage } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingPage } from '../Reading/ReadingPage.tsx'
import { MakeTemplatePage } from './MakeTemplatePage.tsx'
import { TemplateImport } from './PackageControls.tsx'
import { CustomizationLayout } from './CustomizationLayout.tsx'
import { MyThemesPage } from '../Themes/MyThemesPage.tsx'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { CustomizationAdd } from './CustomizationSheet.tsx'
import { MobileHeader } from '../../components/layout/MobileTopBar.tsx'

const PHONE_LAYOUT_PAGES = ['schedule', 'memo', 'reading', 'diary'] as const satisfies readonly PageId[]

function matches(query: string, page: { name: string; description?: string }) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return page.name.toLowerCase().includes(text) || (page.description ?? '').toLowerCase().includes(text)
}

function PageRow({ page }: { page: UserPage }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { records, removeUserPage, updateUserPage } = useLibrary()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(page.name)
  const [icon, setIcon] = useState(page.icon)
  const [description, setDescription] = useState(page.description ?? '')

  const remove = async () => {
    const count = recordsForPage(records, page.id).length
    const ok = await confirm(t('custom.deleteBody', { name: page.name, count }), {
      title: t('custom.deleteTitle', { name: page.name }),
    })
    if (ok) removeUserPage(page.id)
  }

  return (
    <article className="min-w-0 rounded-md border border-line p-4">
      <Link to={ROUTES.page(page.id)} className="group flex min-h-11 items-center gap-3 rounded-md">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-light text-accent"><IconView name={page.icon} className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <span className="block break-words font-medium group-hover:underline">{page.name}</span>
          <p className="mt-1 text-xs text-neutral-400">{page.template ? t(`custom.kind.${page.template}`) : t('custom.userTemplate')}</p>
          {page.description ? <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{page.description}</p> : null}
        </div>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-neutral-400 md:hidden" strokeWidth={1.7} />
      </Link>
      <div className="mt-3 flex gap-1">
        <button type="button" className="btn btn-ghost" onClick={() => {
          setName(page.name); setIcon(page.icon); setDescription(page.description ?? ''); setEditing(!editing)
        }}>{t('edit')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => void remove()}>{t('delete')}</button>
      </div>
      {editing ? <form className="mt-3 grid gap-3 border-t border-line pt-3" onSubmit={event => {
        event.preventDefault()
        if (!name.trim()) return
        updateUserPage(page.id, { name: name.trim(), icon, description: description.trim() })
        setEditing(false)
      }}>
        <div className="flex items-center gap-2">
          <IconPicker value={icon} onChange={setIcon} />
          <input aria-label={t('custom.pageName')} required value={name} onChange={event => setName(event.target.value)} className="field min-w-0 flex-1" />
        </div>
        <label className="block text-xs">
          <span className="text-neutral-400">{t('custom.pageDescription')}</span>
          <textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} className="field mt-1 w-full" />
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>{t('cancel')}</button>
          <button className="btn btn-line" type="submit">{t('save')}</button>
        </div>
      </form> : null}
    </article>
  )
}

function LayoutPanel({ phone }: { phone: boolean }) {
  const { t } = useI18n()
  const { pageGaps, setPageGap, resetPageLayout } = useLibrary()
  const [layoutPage, setLayoutPage] = useState<PageId>('schedule')
  const [notice, setNotice] = useState('')
  const gap = pageGaps[layoutPage] ?? 16

  return (
    <div>
      <p className="text-sm text-neutral-400">{t('custom.layoutsHint')}</p>
      <div data-tour="layout-controls" className="mt-4 grid grid-cols-4 gap-1.5 md:flex md:flex-wrap" role="group" aria-label={t('custom.layoutPage')}>
        {(phone ? PHONE_LAYOUT_PAGES : PAGE_IDS).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={layoutPage === id}
            className={`chip min-h-11 justify-center px-1 md:px-3${layoutPage === id ? ' chip-on' : ''}`}
            onClick={() => {
              setLayoutPage(id)
              setNotice('')
            }}
          >
            {t(`nav.${id}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t('custom.gap')}
          <select
            className="field select w-24"
            value={gap}
            onChange={(event) => {
              setPageGap(layoutPage, Number(event.target.value))
              setNotice(t('custom.saved'))
            }}
          >
            {PAGE_GAP_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}px</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost ml-auto"
          onClick={() => {
            resetPageLayout(layoutPage)
            setNotice(t('custom.resetNotice'))
          }}
        >
          {t('custom.resetLayout')}
        </button>
      </div>
      {notice ? <p className="mt-2 text-sm text-neutral-500" role="status">{notice}</p> : null}
      <div className="customization-layout-preview mt-4 overflow-hidden rounded-md border border-line bg-surface">
        {layoutPage === 'schedule' ? <DailyBoard editing /> : null}
        {layoutPage === 'diary' ? <DiaryPage editing /> : null}
        {layoutPage === 'reading' ? <ReadingPage editing /> : null}
        {layoutPage === 'memo' ? <MemoPage editing /> : null}
      </div>
    </div>
  )
}

export function CustomPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'layout' ? 'layout' : params.get('tab') === 'themes' ? 'themes' : 'templates'
  const { customPages } = useLibrary()
  const [query, setQuery] = useState('')
  const [making, setMaking] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const phone = useMediaQuery(PHONE_QUERY)

  if (making) return <><MobileHeader /><MakeTemplatePage onCancel={() => setMaking(false)} /></>

  const pages = customPages.filter((page) => matches(query, page))

  return (
    <CustomizationLayout mobileAction={tab === 'templates' ? (
      <button type="button" className="mcal-ib" aria-label={t(searchOpen ? 'close' : 'custom.search')} aria-expanded={searchOpen} onClick={() => {
        if (searchOpen) setQuery('')
        setSearchOpen(!searchOpen)
      }}>
        {searchOpen ? <X className="size-5" strokeWidth={1.7} aria-hidden="true" /> : <Search className="size-5" strokeWidth={1.7} aria-hidden="true" />}
      </button>
    ) : undefined}>
        {tab === 'templates' ? (
          <section>
            <header className="md:flex md:flex-wrap md:items-center md:gap-2">
              <h1 className="sr-only text-2xl font-medium tracking-tight md:not-sr-only">{t('custom.tabTemplates')}</h1>
              {!phone ? <div className="ml-auto flex gap-2">
                <Link className="btn btn-line" to={ROUTES.storeTemplates}>{t('templates.store')}</Link>
                <button type="button" className="btn btn-primary" data-tour="new-page" onClick={() => setMaking(true)}>
                  <Plus className="size-3.5" strokeWidth={1.5} />
                  {t('custom.makeTemplate')}
                </button>
              </div> : null}
            </header>
            {!phone || searchOpen ? <label className="mb-3 block md:mb-0 md:mt-4">
              <span className="sr-only">{t('custom.search')}</span>
              <input type="search" autoFocus={phone} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('custom.search')} className="field w-full" />
            </label> : null}
            {phone ? <CustomizationAdd label={t('custom.importTemplate')} onClick={() => setImportOpen(true)} tour="new-page" /> : null}
            <TemplateImport dropzone={false} hideEmpty={pages.length > 0} query={query} sheet={phone ? { open: importOpen, onClose: () => setImportOpen(false) } : undefined} />
            {pages.length ? (
              <section className="mt-4">
                <h2 className="mb-2 font-medium">{t('custom.myPages')}</h2>
                <div className="grid gap-3 xl:grid-cols-2">{pages.map((page) => <PageRow key={page.id} page={page} />)}</div>
              </section>
            ) : null}
          </section>
        ) : tab === 'themes' ? <MyThemesPage compact={phone} /> : (
          <>
            <h1 className="sr-only text-2xl font-medium tracking-tight md:not-sr-only">{t('custom.tabLayout')}</h1>
            <div className="md:mt-8">
              <LayoutPanel phone={phone} />
            </div>
          </>
        )}
    </CustomizationLayout>
  )
}
