import { useState } from 'react'
import { LayoutTemplate, PanelsTopLeft, Plus } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { PAGE_GAP_OPTIONS, PAGE_IDS, type PageId } from '../../features/pages/layout.ts'
import { recordsForPage } from '../../features/pages/pageRecords.ts'
import { type PageTemplateKind } from '../../features/pages/templates.ts'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
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
import { TemplatePreview } from './TemplatePreview.tsx'

const TABS = [
  { id: 'templates', key: 'custom.tabTemplates', icon: LayoutTemplate },
  { id: 'layout', key: 'custom.tabLayout', icon: PanelsTopLeft },
] as const

function matches(query: string, page: { name: string; description?: string }) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return page.name.toLowerCase().includes(text) || (page.description ?? '').toLowerCase().includes(text)
}

function PageRow({ page }: { page: UserPage }) {
  const { t } = useI18n()
  const confirm = useConfirm()
  const { records, removeUserPage } = useLibrary()

  const remove = async () => {
    const count = recordsForPage(records, page.id).length
    const ok = await confirm(t('custom.deleteBody', { name: page.name, count }), {
      title: t('custom.deleteTitle', { name: page.name }),
    })
    if (ok) removeUserPage(page.id)
  }

  return (
    <article className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{page.name}</h2>
          <p className="text-xs text-neutral-400">{page.template ? t(`custom.kind.${page.template}`) : t('custom.userTemplate')}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Link className="btn btn-line" to={ROUTES.page(page.id)}>{t('custom.createPage')}</Link>
          <Link className="btn btn-ghost" to={ROUTES.templatePublish + '?id=' + page.id}>{t('templates.publish')}</Link>
          <button type="button" className="btn btn-ghost" onClick={() => void remove()}>{t('delete')}</button>
        </div>
      </div>
      <div className="mt-4 min-h-80 overflow-hidden">
        {page.template ? (
          <TemplatePreview kind={page.template} heading={page.name} labels={page.fieldLabels} />
        ) : (
          <PageBuilder blocks={page.blocks} editing={false} onChange={() => undefined} />
        )}
      </div>
    </article>
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
      <div className="mt-4 overflow-hidden rounded-md border border-line bg-surface">
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
  const group = params.get('group') === 'custom' ? 'custom' : 'basic'
  const { customPages, addUserPage } = useLibrary()
  const [query, setQuery] = useState('')
  const [wizard, setWizard] = useState<PageTemplateKind | true | false>(false)

  if (wizard) {
    return (
      <CreatePageWizard
        initial={wizard === true ? undefined : wizard}
        onCancel={() => setWizard(false)}
        onCreate={(input) => {
          const id = addUserPage(input)
          navigate(ROUTES.page(id))
        }}
      />
    )
  }

  const setGroup = (next: 'basic' | 'custom') => setParams(next === 'basic' ? {} : { group: next })
  const basicPages = customPages.filter((page) => page.template && matches(query, page))
  const customOnly = customPages.filter((page) => !page.template && matches(query, page))

  return (
    <div className="mx-auto flex w-full max-w-6xl items-start gap-8 px-4 py-6 md:px-6 lg:gap-14">
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
                onClick={() => setParams(item.id === 'templates' ? (group === 'custom' ? { group } : {}) : { tab: item.id })}
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
            onChange={(event) => setParams(event.target.value === 'templates' ? (group === 'custom' ? { group } : {}) : { tab: event.target.value })}
          >
            {TABS.map((item) => (
              <option key={item.id} value={item.id}>{t(item.key)}</option>
            ))}
          </select>
        </label>
        {tab === 'templates' ? (
          <section>
            <header className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-medium tracking-tight">{t('custom.tabTemplates')}</h1>
              <div className="ml-auto flex gap-2">
                <Link className="btn btn-line" to={ROUTES.storeTemplates}>{t('templates.store')}</Link>
                <button type="button" className="btn btn-primary" data-tour="new-page" onClick={() => setWizard(true)}>
                  <Plus className="size-3.5" strokeWidth={1.5} />
                  {t('custom.makeTemplate')}
                </button>
              </div>
            </header>
            <label className="mt-4 block">
              <span className="sr-only">{t('custom.search')}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('custom.search')} className="field w-full" />
            </label>
            <div className="theme-editor-tabs" role="tablist" aria-label={t('custom.tabTemplates')}>
              <button type="button" role="tab" aria-selected={group === 'basic'} className={group === 'basic' ? 'tab tab-on' : 'tab'} onClick={() => setGroup('basic')}>
                {t('custom.groupBasic')}
              </button>
              <button type="button" role="tab" aria-selected={group === 'custom'} className={group === 'custom' ? 'tab tab-on' : 'tab'} onClick={() => setGroup('custom')}>
                {t('custom.groupCustom')}
              </button>
            </div>
            {group === 'basic' ? (
              basicPages.length ? (
                <div className="divide-y divide-line">
                  {basicPages.map((page) => <PageRow key={page.id} page={page} />)}
                </div>
              ) : <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyPages')}</p>
            ) : (
              <>
                <TemplateImport dropzone={false} hideEmpty={customOnly.length > 0} />
                {customOnly.length ? (
                  <div className="mt-8 divide-y divide-line">
                    {customOnly.map((page) => <PageRow key={page.id} page={page} />)}
                  </div>
                ) : null}
              </>
            )}
          </section>
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
