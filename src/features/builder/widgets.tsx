import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { todayISO } from '../../utils/date.ts'
import { occursOn } from '../../utils/work.ts'
import type { WidgetType } from './schema.ts'

function Empty({ to, label }: { to: string; label: string }) {
  return (
    <p className="text-sm text-neutral-400">
      <Link to={to} className="underline-offset-2 hover:underline">
        {label}
      </Link>
    </p>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="space-y-1 text-sm text-neutral-700">{children}</ul>
}

export function WidgetBlock({ type }: { type: WidgetType }) {
  const { t } = useI18n()
  const { items, memos, diaries, books, activities = [] } = useLibrary()
  const { user } = useSession()
  const today = todayISO()

  if (type === 'widget-today') {
    const rows = items.filter((item) => occursOn(item, today)).slice(0, 8)
    if (!rows.length) return <Empty to={ROUTES.schedule} label={t('builder.emptyToday')} />
    return (
      <List>
        {rows.map((item) => (
          <li key={item.id}>
            {item.startTime ? `${item.startTime} ` : ''}
            {item.title}
          </li>
        ))}
      </List>
    )
  }

  if (type === 'widget-tasks') {
    const rows = items.filter((item) => item.kind === 'task' && item.status !== 'done').slice(0, 8)
    if (!rows.length) return <Empty to={ROUTES.schedule} label={t('builder.emptyTasks')} />
    return (
      <List>
        {rows.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </List>
    )
  }

  if (type === 'widget-calendar') {
    const rows = items.filter((item) => item.kind === 'event').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
    if (!rows.length) return <Empty to={ROUTES.schedule} label={t('builder.emptyCalendar')} />
    return (
      <List>
        {rows.map((item) => (
          <li key={item.id}>
            {item.date} {item.title}
          </li>
        ))}
      </List>
    )
  }

  if (type === 'widget-memos') {
    const rows = memos.slice(0, 6)
    if (!rows.length) return <Empty to={ROUTES.memo} label={t('builder.emptyMemos')} />
    return (
      <List>
        {rows.map((item) => (
          <li key={item.id}>{item.title || item.body.slice(0, 40)}</li>
        ))}
      </List>
    )
  }

  if (type === 'widget-diary') {
    const row = diaries[0]
    if (!row) return <Empty to={ROUTES.diary} label={t('builder.emptyDiary')} />
    return (
      <div className="text-sm text-neutral-700">
        <p className="text-xs text-neutral-400">{row.date}</p>
        <p className="mt-1 whitespace-pre-wrap">{row.body.slice(0, 180)}</p>
      </div>
    )
  }

  if (type === 'widget-reading') {
    const rows = books.filter((book) => book.status === 'reading').slice(0, 6)
    if (!rows.length) return <Empty to={ROUTES.reading} label={t('builder.emptyReading')} />
    return (
      <List>
        {rows.map((book) => (
          <li key={book.id}>
            {book.title}
            {book.totalPages ? ` · ${book.currentPage}/${book.totalPages}` : ''}
          </li>
        ))}
      </List>
    )
  }

  if (type === 'widget-activity') {
    const rows = activities.slice(0, 6)
    if (!rows.length) return <Empty to={ROUTES.activity} label={t('builder.emptyActivity')} />
    return (
      <List>
        {rows.map((row) => (
          <li key={row.id}>{row.after?.title || row.before?.title || row.action}</li>
        ))}
      </List>
    )
  }

  let summary = ''
  try {
    const raw = sessionStorage.getItem(`blanky.planner.${user?.id ?? 'anonymous'}`)
    const parsed = raw ? (JSON.parse(raw) as { plan?: { result?: { items?: { title?: string }[] } } }) : null
    summary = parsed?.plan?.result?.items?.map((item) => item.title).filter(Boolean).slice(0, 5).join('\n') ?? ''
  } catch {
    summary = ''
  }
  if (!summary) return <Empty to={ROUTES.home} label={t('builder.emptyPlanner')} />
  return <p className="whitespace-pre-wrap text-sm text-neutral-700">{summary}</p>
}
