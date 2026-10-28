import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { formatDisplayDate } from '../../i18n/format.ts'
import { localeTag } from '../../i18n/locale.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { WorkCard } from '../../components/schedule/WorkCard.tsx'
import { categoryPath } from '../../utils/work.ts'

const PAGE_SIZE = 10

export function ActivityPage() {
  const { t, locale } = useI18n()
  const ACTION = { created: t('activity.created'), updated: t('activity.updated'), completed: t('activity.completed'), deleted: t('activity.deleted') }
  const { activities = [], categories } = useLibrary()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'summary' | 'detail'>('summary')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const words = query.trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean)
    return activities.filter(row => {
        const snapshots = [row.before, row.after].flatMap(item => item ? [item.title, item.description, item.date, item.startTime, item.endTime, item.dueDate, item.kind === 'task' ? t('type.task') : t('type.event'), categoryPath(item.categoryId, categories)] : [])
      const text = [...snapshots, row.entityId, row.createdAt, formatDisplayDate(locale, row.createdAt.slice(0, 10)), ACTION[row.action], row.source === 'ai_chat' ? t('source.ai') : t('source.manual')].join(' ').toLocaleLowerCase(localeTag(locale))
      return words.every(word => text.includes(word))
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [ACTION, activities, categories, locale, query, t])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const days = [...new Set(visible.map(row => formatDisplayDate(locale, row.createdAt.slice(0, 10))))]
  const changePage = (next: number) => { setPage(next); setOpenId(null) }

  return <div className="mx-auto w-full max-w-3xl px-6 py-10">
    <h1 className="text-xl font-medium">{t('activity.title')}</h1>
    <p className="mt-2 text-sm text-neutral-400">{t('activity.subtitle')}</p>
    <div className="activity-search mt-6">
      <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none size-4 shrink-0 text-neutral-400" />
      <input type="search" aria-label={t('activity.search')} placeholder={t('activity.placeholder')} value={query} onChange={event => { setQuery(event.target.value); changePage(1) }} className="activity-search-input" />
      {query && <button type="button" aria-label={t('clearSearch')} onClick={() => { setQuery(''); changePage(1) }} className="activity-search-clear"><X aria-hidden="true" className="size-4" /></button>}
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <div role="tablist" aria-label={t('activity.viewMode')} className="flex gap-2">
        {([{ id: 'summary', label: t('activity.summary') }, { id: 'detail', label: t('activity.detail') }] as const).map(tab => <button key={tab.id} id={'activity-tab-' + tab.id} type="button" role="tab" aria-selected={view === tab.id} aria-controls="activity-panel" className={view === tab.id ? 'chip chip-on' : 'chip'} onClick={() => { setView(tab.id); setOpenId(null) }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = tab.id === 'summary' ? 'detail' : 'summary'; setView(next); setOpenId(null); document.getElementById('activity-tab-' + next)?.focus() } }} tabIndex={view === tab.id ? 0 : -1}>{tab.label}</button>)}
      </div>
      <p role="status" className="text-xs text-neutral-400">{t(query.trim() ? 'activity.resultCount' : 'activity.totalCount', { count: filtered.length })}</p>
    </div>
    <div id="activity-panel" role="tabpanel" aria-labelledby={'activity-tab-' + view}>
      {!filtered.length && <p className="py-12 text-center text-sm text-neutral-400">{query.trim() ? t('activity.emptySearch') : t('activity.empty')}</p>}
      {days.map(day => <section key={day} className="mt-6">
        <h2 className="mb-3 text-xs font-medium text-neutral-400">{day}</h2>
        <ul className="space-y-2">{visible.filter(row => formatDisplayDate(locale, row.createdAt.slice(0, 10)) === day).map(row => {
          const snapshot = row.after ?? row.before
          const open = view === 'detail' || openId === row.id
          const metadata = new Date(row.createdAt).toLocaleTimeString(localeTag(locale), { hour: '2-digit', minute: '2-digit' }) + ' · ' + (row.source === 'ai_chat' ? t('source.ai') : t('source.manual')) + ' · ' + ACTION[row.action]
          return <li key={row.id} className={view === 'summary' ? 'rounded-xl border border-line bg-hover' : 'pb-3'}>
            {view === 'summary' ? <button type="button" aria-expanded={open} aria-controls={'activity-record-' + row.id} className="flex w-full items-center gap-3 rounded-xl p-4 text-left" onClick={() => setOpenId(open ? null : row.id)}>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{snapshot?.title || t('activity.previous')}</p><p className="mt-1 truncate text-xs text-neutral-400">{metadata}{snapshot ? ' · ' + snapshot.date + (snapshot.startTime ? ' ' + snapshot.startTime : '') : ''}</p>{snapshot?.description && <p className="mt-2 line-clamp-1 text-sm text-neutral-500">{snapshot.description}</p>}</div>
              <ChevronDown aria-hidden="true" className={'size-4 shrink-0 text-neutral-400 transition-transform ' + (open ? 'rotate-180' : '')} />
            </button> : <p className="mb-2 text-xs text-neutral-400">{metadata}</p>}
            <div id={'activity-record-' + row.id} hidden={!open} className={view === 'summary' && open ? 'border-t border-line p-3' : ''}>{open && (snapshot ? <WorkCard snapshot={snapshot} before={row.after ? row.before : null} deleted={row.action === 'deleted'} /> : <p className="text-sm text-neutral-400">{t('activity.noSnapshot', { id: row.entityId })}</p>)}</div>
          </li>
        })}</ul>
      </section>)}
    </div>
    {totalPages > 1 && <nav aria-label="기록 페이지" className="mt-8 flex flex-wrap items-center justify-center gap-1 border-t border-line pt-5">
      <button type="button" className="icon-btn disabled:opacity-30" disabled={currentPage === 1} aria-label="이전 페이지" onClick={() => changePage(currentPage - 1)}><ChevronLeft className="size-4" /></button>
      {[...new Set([1, ...Array.from({ length: 5 }, (_, i) => currentPage - 2 + i).filter(n => n > 1 && n < totalPages), totalPages])].map((number, index, numbers) => <span key={number} className="flex items-center gap-1">{index > 0 && number - numbers[index - 1] > 1 && <span className="px-1 text-neutral-400">…</span>}<button type="button" aria-label={number + '페이지'} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'chip chip-on' : 'chip'} onClick={() => changePage(number)}>{number}</button></span>)}
      <button type="button" className="icon-btn disabled:opacity-30" disabled={currentPage === totalPages} aria-label="다음 페이지" onClick={() => changePage(currentPage + 1)}><ChevronRight className="size-4" /></button>
      <span className="ml-2 text-xs text-neutral-400">{currentPage} / {totalPages}</span>
    </nav>}
  </div>
}
