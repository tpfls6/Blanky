import { useState } from 'react'
import { Plus } from 'lucide-react'
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
import { CreatePageWizard, MakeTemplatePage } from './CreatePageWizard.tsx'
import { TemplateImport } from './PackageControls.tsx'
import { CustomizationLayout } from './CustomizationLayout.tsx'
import { MyThemesPage } from '../Themes/MyThemesPage.tsx'

function matches(query: string, page: { name: string; description?: string }) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return page.name.toLowerCase().includes(text) || (page.description ?? '').toLowerCase().includes(text)
}

function PageRow({ page, onEdit }: { page: UserPage; onEdit: (page: UserPage) => void }) {
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
      <div className="flex items-start gap-3">
        <span className="shrink-0 pt-1 text-neutral-500"><IconView name={page.icon} className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <Link to={ROUTES.page(page.id)} className="block break-words font-medium hover:underline">{page.name}</Link>
          <p className="mt-1 text-xs text-neutral-400">{page.template ? t(`custom.kind.${page.template}`) : t('custom.userTemplate')}</p>
          {page.description ? <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{page.description}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex gap-1">
        <button type="button" className="btn btn-ghost" onClick={() => {
          // Template pages edit in the full editor with a live preview, like when they were made.
          if (page.template) return onEdit(page)
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

function LayoutPanel() {
  const { t } = useI18n()
  const { pageGaps, setPageGap, resetPageLayout } = useLibrary()
  const [layoutPage, setLayoutPage] = useState<PageId>('schedule')
  const [notice, setNotice] = useState('')
  const gap = pageGaps[layoutPage] ?? 16

  return (
    <div>
      <p className="text-sm text-neutral-400">{t('custom.layoutsHint')}</p>
      <div data-tour="layout-controls" className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label={t('custom.layouts')}>
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
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'layout' ? 'layout' : params.get('tab') === 'themes' ? 'themes' : 'templates'
  const group = params.get('group') === 'custom' ? 'custom' : 'basic'
  const { customPages, updateUserPage } = useLibrary()
  const [query, setQuery] = useState('')
  const [wizard, setWizard] = useState(false)
  const [editPage, setEditPage] = useState<UserPage | null>(null)

  if (editPage?.template) {
    return (
      <CreatePageWizard
        key={editPage.id}
        page={{ ...editPage, template: editPage.template }}
        onCancel={() => setEditPage(null)}
        onCreate={({ name, icon, description, fieldLabels }) => {
          updateUserPage(editPage.id, { name, icon, description, fieldLabels })
          setEditPage(null)
        }}
      />
    )
  }

  if (wizard) {
    return <MakeTemplatePage onCancel={() => setWizard(false)} />
  }

  const setGroup = (next: 'basic' | 'custom') => setParams(next === 'basic' ? {} : { group: next })
  const basicPages = customPages.filter((page) => page.template && matches(query, page))
  const customOnly = customPages.filter((page) => !page.template && matches(query, page))

  return (
    <CustomizationLayout>
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
                <div className="grid gap-3 xl:grid-cols-2">
                  {basicPages.map((page) => <PageRow key={page.id} page={page} onEdit={setEditPage} />)}
                </div>
              ) : <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyPages')}</p>
            ) : (
              <>
                <TemplateImport dropzone={false} hideEmpty={customOnly.length > 0} />
                {customOnly.length ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {customOnly.map((page) => <PageRow key={page.id} page={page} onEdit={setEditPage} />)}
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : tab === 'themes' ? <MyThemesPage /> : (
          <>
            <h1 className="text-2xl font-medium tracking-tight">{t('custom.tabLayout')}</h1>
            <div className="mt-8">
              <LayoutPanel />
            </div>
          </>
        )}
    </CustomizationLayout>
  )
}
