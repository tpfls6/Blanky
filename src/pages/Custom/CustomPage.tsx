import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { IconView } from '../../constants/icons.ts'
import { ROUTES } from '../../constants/routes.ts'
import { BLOCK_LABEL, PAGE_IDS, isUserLayout, type PageId } from '../../features/pages/layout.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { DailyBoard } from '../Schedule/SchedulePage.tsx'
import { DiaryPage } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingPage } from '../Reading/ReadingPage.tsx'
import type { UserPage } from '../../features/builder/schema.ts'
import { CreatePageWizard } from './CreatePageWizard.tsx'

function matches(query: string, page: { name: string; description?: string }) {
  const text = query.trim().toLowerCase()
  if (!text) return true
  return page.name.toLowerCase().includes(text) || (page.description ?? '').toLowerCase().includes(text)
}

function PageRow({
  page,
  to,
  onUp,
  onDown,
  canUp,
  canDown,
  upLabel,
  downLabel,
}: {
  page: UserPage
  to: string
  onUp?: () => void
  onDown?: () => void
  canUp?: boolean
  canDown?: boolean
  upLabel?: string
  downLabel?: string
}) {
  return (
    <div className="flex items-center gap-1 border-b border-line last:border-b-0">
      <Link to={to} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-sm">
        <IconView name={page.icon} className="size-4 shrink-0 text-neutral-400" />
        <span className="min-w-0 flex-1 truncate">{page.name}</span>
      </Link>
      {onUp && onDown ? (
        <>
          <button type="button" aria-label={upLabel} className="icon-btn" disabled={!canUp} onClick={onUp}>↑</button>
          <button type="button" aria-label={downLabel} className="icon-btn" disabled={!canDown} onClick={onDown}>↓</button>
        </>
      ) : null}
    </div>
  )
}

export function CustomPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { customPages, addUserPage, moveUserPage, pageLayouts, resetPageLayout } = useLibrary()
  const [query, setQuery] = useState('')
  const [layoutPage, setLayoutPage] = useState<PageId>('schedule')
  const [notice, setNotice] = useState('')
  const [wizard, setWizard] = useState(false)
  const pages = customPages.filter((page) => matches(query, page))
  const custom = isUserLayout(pageLayouts[layoutPage])
  const pageLabel = (id: PageId) => t(`nav.${id}`)

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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-medium">{t('custom.title')}</h1>
        <button type="button" className="btn btn-primary ml-auto" data-tour="new-page" onClick={() => setWizard(true)}>
          <Plus className="size-3.5" strokeWidth={1.5} />
          {t('custom.newPage')}
        </button>
      </div>
      <label className="mt-4 block">
        <span className="sr-only">{t('custom.search')}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('custom.search')} className="field w-full" />
      </label>

      <section className="mt-8">
        <h2 className="text-sm font-medium">{t('custom.myPages')}</h2>
        {pages.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">{t('custom.emptyPages')}</p>
        ) : (
          pages.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              to={ROUTES.page(page.id)}
              upLabel={t('builder.moveUp')}
              downLabel={t('builder.moveDown')}
              canUp={customPages[0]?.id !== page.id}
              canDown={customPages[customPages.length - 1]?.id !== page.id}
              onUp={() => moveUserPage(page.id, -1)}
              onDown={() => moveUserPage(page.id, 1)}
            />
          ))
        )}
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
    </div>
  )
}
