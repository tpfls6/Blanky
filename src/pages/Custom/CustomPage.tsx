import { useState } from 'react'
import { GripVertical, LayoutTemplate, PanelsTopLeft, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Sortable } from '../../components/drag/Sortable.tsx'
import { IconView } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { PAGE_GAP_OPTIONS, PAGE_IDS, type PageId } from '../../features/pages/layout.ts'
import { recordsForPage } from '../../features/pages/pageRecords.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import type { UserPage } from '../../features/builder/schema.ts'
import { DailyBoard } from '../Schedule/SchedulePage.tsx'
import { DiaryPage } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingPage } from '../Reading/ReadingPage.tsx'
import { CreatePageWizard } from './CreatePageWizard.tsx'
import { TemplateImport } from './PackageControls.tsx'
import { PageSettings } from './PageSettings.tsx'

const TABS = [
  { id: 'templates', key: 'custom.tabTemplates', icon: LayoutTemplate },
  { id: 'layout', key: 'custom.tabLayout', icon: PanelsTopLeft },
] as const

function matches(query: string, page: { name: string; description?: string }) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return page.name.toLowerCase().includes(text) || (page.description ?? '').toLowerCase().includes(text)
}

function TemplateList({
  pages,
  query,
}: {
  pages: UserPage[]
  query: string
}) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { records, removeUserPage, reorderUserPages } = useLibrary()
  const [openId, setOpenId] = useState<string | null>(null)
  const filtered = pages.filter((page) => matches(query, page))
  const dragging = !query.trim()

  const remove = async (page: UserPage) => {
    const count = recordsForPage(records, page.id).length
    const ok = await confirm(t('custom.deleteBody', { name: page.name, count }), {
      title: t('custom.deleteTitle', { name: page.name }),
    })
    if (ok) removeUserPage(page.id)
  }

  const row = (page: UserPage) => (
    <div className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-1">
        {dragging ? <GripVertical className="size-4 shrink-0 text-neutral-300" strokeWidth={1.5} aria-hidden="true" /> : null}
        <Link to={ROUTES.page(page.id)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-sm">
          <IconView name={page.icon} className="size-4 shrink-0 text-neutral-400" />
          <span className="min-w-0 flex-1 truncate">{page.name}</span>
          {page.template ? <span className="shrink-0 text-xs text-neutral-400">{t(`custom.kind.${page.template}`)}</span> : null}
        </Link>
        <button type="button" className="chip" onClick={() => setOpenId((current) => (current === page.id ? null : page.id))}>
          {t('custom.pageSettings')}
        </button>
        <button type="button" className="icon-btn" aria-label={t('delete')} onClick={() => void remove(page)}>
          <Trash2 className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>
      {openId === page.id ? (
        <div className="pb-3 pl-5">
          <PageSettings page={page} />
        </div>
      ) : null}
    </div>
  )

  if (filtered.length === 0) {
    return <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyPages')}</p>
  }
  if (!dragging) {
    return <div className="mt-3">{filtered.map((page) => <div key={page.id}>{row(page)}</div>)}</div>
  }
  return (
    <Sortable
      items={pages}
      className="mt-3"
      onReorder={reorderUserPages}
      render={row}
    />
  )
}

function LayoutPanel() {
  const { t } = useI18n()
  const { pageGaps, setPageGap, resetPageLayout } = useLibrary()
  const [layoutPage, setLayoutPage] = useState<PageId>('schedule')
  const [notice, setNotice] = useState('')
  const gap = pageGaps[layoutPage] ?? 16

  return (
    <div>
      <p className="text-sm text-neutral-400">{t('custom.layoutsHint')}</p>
      <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label={t('custom.layouts')}>
        {PAGE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={layoutPage === id}
            className={layoutPage === id ? 'chip chip-on' : 'chip'}
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
      <div className="mt-4 overflow-hidden rounded-md border border-line">
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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'layout' ? 'layout' : 'templates'
  const { customPages, addUserPage } = useLibrary()
  const [query, setQuery] = useState('')
  const [wizard, setWizard] = useState(false)

  if (wizard) {
    return (
      <CreatePageWizard
        onCancel={() => setWizard(false)}
        onCreate={(input) => {
          const id = addUserPage(input)
          navigate(ROUTES.page(id))
        }}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl items-start gap-8 px-4 py-6 md:px-6 lg:gap-14">
      <nav aria-label={t('custom.title')} className="sticky top-8 hidden w-48 shrink-0 lg:block">
        <p className="px-3 pb-3 text-sm font-medium tracking-tight">{t('custom.title')}</p>
        <div className="flex flex-col gap-0.5">
          {TABS.map((item) => {
            const Icon = item.icon
            const on = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                className="settings-link"
                aria-current={on ? 'page' : undefined}
                onClick={() => setParams(item.id === 'templates' ? {} : { tab: item.id })}
              >
                <Icon strokeWidth={1.5} aria-hidden="true" />
                {t(item.key)}
              </button>
            )
          })}
        </div>
      </nav>
      <div className="min-w-0 flex-1">
        <label className="mb-6 block lg:hidden">
          <span className="sr-only">{t('custom.title')}</span>
          <select
            className="field select w-full"
            value={tab}
            onChange={(event) => setParams(event.target.value === 'templates' ? {} : { tab: event.target.value })}
          >
            {TABS.map((item) => (
              <option key={item.id} value={item.id}>{t(item.key)}</option>
            ))}
          </select>
        </label>
        {tab === 'templates' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-medium tracking-tight">{t('custom.tabTemplates')}</h1>
              <button type="button" className="btn btn-primary ml-auto" data-tour="new-page" onClick={() => setWizard(true)}>
                <Plus className="size-3.5" strokeWidth={1.5} />
                {t('custom.newPage')}
              </button>
            </div>
            <p className="mt-2 text-sm text-neutral-400">{t('custom.templatesHint')}</p>
            <label className="mt-4 block">
              <span className="sr-only">{t('custom.search')}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('custom.search')} className="field w-full" />
            </label>
            <TemplateImport />
            <section className="mt-8">
              <h2 className="text-sm font-medium">{t('custom.myPages')}</h2>
              <TemplateList pages={customPages} query={query} />
            </section>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-medium tracking-tight">{t('custom.tabLayout')}</h1>
            <div className="mt-8">
              <LayoutPanel />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
