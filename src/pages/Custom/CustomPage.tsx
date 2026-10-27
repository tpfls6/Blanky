import { useMemo, useState } from 'react'
import { HelpCircle, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { IconView } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { BLOCK_LABEL, PAGE_IDS, isUserLayout, type PageId } from '../../features/pages/layout.ts'
import { builtinTemplates } from '../../features/workspace/templates.ts'
import { TemplateGuide } from '../../features/workspace/TemplateGuide.tsx'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { DailyBoard } from '../Schedule/SchedulePage.tsx'
import { DiaryPage } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingPage } from '../Reading/ReadingPage.tsx'
import { RecordSection } from '../Settings/RecordSection.tsx'
import type { UserPage } from '../../features/builder/schema.ts'

function matches(query: string, page: { name: string; description?: string }) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return page.name.toLowerCase().includes(text) || (page.description ?? '').toLowerCase().includes(text)
}

function PageRow({ page, to }: { page: UserPage; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 border-b border-line py-3 text-sm last:border-b-0">
      <IconView name={page.icon} className="size-4 shrink-0 text-neutral-400" />
      <span className="min-w-0 flex-1 truncate">{page.name}</span>
    </Link>
  )
}

export function CustomPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { customPages, pageTemplates, addUserPage, addPageFromTemplate, pageLayouts, resetPageLayout, settings, updateSettings } = useLibrary()
  const [query, setQuery] = useState('')
  const [layoutPage, setLayoutPage] = useState<PageId>('schedule')
  const [notice, setNotice] = useState('')
  const [replay, setReplay] = useState(false)
  const guide = replay || !settings.customTemplatesGuideSeen
  const starters = useMemo(() => builtinTemplates(), [])
  const pages = customPages.filter((page) => matches(query, page))
  const templates = pageTemplates.filter((page) => matches(query, page))
  const recent = [...customPages].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6)
  const custom = isUserLayout(pageLayouts[layoutPage])
  const pageLabel = (id: PageId) => t(`nav.${id}`)

  const closeGuide = () => {
    setReplay(false)
    if (!settings.customTemplatesGuideSeen) updateSettings({ customTemplatesGuideSeen: true })
  }

  const createPage = () => {
    const id = addUserPage({ name: t('builder.newPage') })
    closeGuide()
    navigate(ROUTES.page(id))
  }

  const fromStarter = (id: string) => {
    const starter = builtinTemplates().find((item) => item.id === id)
    if (!starter) return
    const pageId = addPageFromTemplate({
      name: starter.name,
      icon: starter.icon,
      blocks: starter.blocks,
      collections: starter.collections,
    })
    closeGuide()
    navigate(ROUTES.page(pageId))
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-medium">{t('custom.title')}</h1>
        <button type="button" className="btn btn-primary ml-auto" data-tour="new-page" onClick={createPage}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          {t('custom.newPage')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setReplay(true)}>
          <HelpCircle className="size-3.5" strokeWidth={1.5} />
          {t('custom.guide')}
        </button>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">{t('custom.search')}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('custom.search')} className="field w-full" />
      </label>

      <section className="mt-8">
        <h2 className="text-sm font-medium">{t('custom.recent')}</h2>
        {recent.length === 0 ? <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyPages')}</p> : recent.map((page) => <PageRow key={page.id} page={page} to={ROUTES.page(page.id)} />)}
      </section>
      <section className="mt-8">
        <h2 className="text-sm font-medium">{t('custom.myPages')}</h2>
        {pages.length === 0 ? <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyPages')}</p> : pages.map((page) => <PageRow key={page.id} page={page} to={ROUTES.page(page.id)} />)}
      </section>
      <section className="mt-8">
        <h2 className="text-sm font-medium">{t('custom.myTemplates')}</h2>
        {templates.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyTemplates')}</p>
        ) : (
          templates.map((page) => (
            <button
              key={page.id}
              type="button"
              className="flex w-full items-center gap-3 border-b border-line py-3 text-left text-sm last:border-b-0"
              onClick={() => navigate(ROUTES.page(addPageFromTemplate(page)))}
            >
              <IconView name={page.icon} className="size-4 shrink-0 text-neutral-400" />
              <span className="min-w-0 flex-1 truncate">{page.name}</span>
            </button>
          ))
        )}
      </section>
      <section className="mt-8" data-tour="starters">
        <h2 className="text-sm font-medium">{t('custom.starters')}</h2>
        {starters.filter((item) => matches(query, item)).map((item) => (
          <button
            key={item.id}
            type="button"
            className="flex w-full items-center gap-3 border-b border-line py-3 text-left text-sm last:border-b-0"
            onClick={() => fromStarter(item.id)}
          >
            <IconView name={item.icon} className="size-4 shrink-0 text-neutral-400" />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span className="max-w-[14rem] truncate text-xs text-neutral-400">{item.description}</span>
          </button>
        ))}
      </section>

      <details className="mt-10">
        <summary className="cursor-pointer text-sm font-medium">{t('custom.layouts')}</summary>
        <p className="mt-1 text-xs text-neutral-400">{t('custom.layoutsHint')}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {PAGE_IDS.map((id) => (
            <button key={id} type="button" className={layoutPage === id ? 'chip chip-on' : 'chip'} onClick={() => { setLayoutPage(id); setNotice('') }}>
              {pageLabel(id)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-xs text-neutral-400">
            {custom ? t('custom.userTemplate') : `${layoutPage}.default`} · {BLOCK_LABEL.timeline}, {BLOCK_LABEL['task-list']}, {BLOCK_LABEL.calendar}
          </p>
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
        {layoutPage === 'schedule' ? <DailyBoard editing /> : null}
        {layoutPage === 'diary' ? <DiaryPage editing /> : null}
        {layoutPage === 'reading' ? <ReadingPage editing /> : null}
        {layoutPage === 'memo' ? <MemoPage editing /> : null}
      </details>

      <section className="mt-10">
        <h2 className="text-sm font-medium">{t('custom.recordsTitle')}</h2>
        <p className="mt-1 text-sm text-neutral-500">{t('custom.recordsHint')}</p>
        <div className="mt-4">
          <RecordSection />
        </div>
      </section>

      {guide ? (
        <TemplateGuide
          onClose={closeGuide}
          onCreate={createPage}
          onTemplate={() => {
            closeGuide()
            document.querySelector('[data-tour="starters"]')?.scrollIntoView({ block: 'center' })
          }}
        />
      ) : null}
    </div>
  )
}
