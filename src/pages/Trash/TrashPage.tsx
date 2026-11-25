import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen, CalendarDays, FileText, Info, LayoutTemplate, Library, ListTodo, MoreHorizontal, RotateCcw, StickyNote, Trash2, type LucideIcon } from 'lucide-react'
import { ROUTES } from '../../constants/routes.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { ReadingRestoreError } from '../../services/reading/restore.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { formatISODate, shiftISO, todayISO } from '../../utils/date.ts'
import { trashKindKey, type TrashItem } from '../../utils/trash.ts'
import { CustomizationSheet } from '../Custom/CustomizationSheet.tsx'
import '../More/more.css'
import './trash.css'

// Keyed by trashKindKey's last part, so a deleted task and event get their own tiles.
const KIND_ICON: Record<string, LucideIcon> = { item: CalendarDays, task: ListTodo, memo: StickyNote, diary: BookOpen, book: Library, record: FileText, page: LayoutTemplate }

/** The local calendar day the row was deleted on. */
function deletedDay(row: TrashItem): string {
  const date = new Date(row.deletedAt)
  return Number.isNaN(date.getTime()) ? row.deletedAt.slice(0, 10) : formatISODate(date)
}

export function TrashPage() {
  const confirm = useConfirm()
  const { t } = useI18n()
  const phone = useMediaQuery(PHONE_QUERY)
  const { trash, restoreTrash, purgeTrash, emptyTrash } = useLibrary()
  const [busy, setBusy] = useState<string | null>(null)
  // A failed 복구 leaves its row in the trash; it says why under the row and offers 다시 시도.
  const [failed, setFailed] = useState<Record<string, 'failed' | 'conflict'>>({})
  const [menu, setMenu] = useState<TrashItem | null>(null)
  const [notice, setNotice] = useState('')
  const clear = (id: string) => setFailed((current) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)))

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const restore = async (id: string) => {
    if (busy) return
    const title = trash.find((row) => row.id === id)?.title ?? ''
    setBusy(id)
    clear(id)
    try {
      await restoreTrash(id)
      setNotice(t('trash.restored', { title }))
    } catch (error) {
      console.error(error)
      setFailed((current) => ({ ...current, [id]: error instanceof ReadingRestoreError && error.reason === 'conflict' ? 'conflict' : 'failed' }))
    } finally {
      setBusy(null)
    }
  }

  const purge = async (id: string) => {
    if (!await confirm(t('trash.purgeBody'), { title: t('trash.purgeForever'), confirmLabel: t('trash.purge') })) return
    clear(id)
    purgeTrash(id)
  }

  const empty = async () => {
    if (!await confirm(t('trash.emptyBody'), { title: t('trash.emptyTitle'), confirmLabel: t('trash.emptyAll') })) return
    emptyTrash()
  }

  // Today / this week (from Monday) / earlier, newest first as the trash already is.
  const today = todayISO()
  const monday = shiftISO(today, -((new Date().getDay() + 6) % 7))
  const groups = [
    { key: 'today', rows: trash.filter((row) => deletedDay(row) >= today) },
    { key: 'week', rows: trash.filter((row) => deletedDay(row) < today && deletedDay(row) >= monday) },
    { key: 'earlier', rows: trash.filter((row) => deletedDay(row) < monday) },
  ].filter((group) => group.rows.length)
  const when = (row: TrashItem) => {
    const day = deletedDay(row)
    if (day >= today) return new Date(row.deletedAt).toTimeString().slice(0, 5)
    return day.slice(0, 4) === today.slice(0, 4) ? `${Number(day.slice(5, 7))}/${Number(day.slice(8))}` : day.replaceAll('-', '/')
  }

  const emptyButton = trash.length > 0 ? (
    <button data-theme-slot="button" type="button" className={phone ? 'trash-empty-btn' : 'btn btn-ghost trash-empty-btn'} disabled={Boolean(busy)} onClick={() => void empty()}>
      {t('trash.emptyAll')}
    </button>
  ) : null

  return (
    <div className={phone ? 'trash-page' : 'trash-page mx-auto w-full max-w-xl px-6 py-8 md:px-10'}>
      {phone ? (
        <header className="more-bar">
          <Link to={ROUTES.more} className="more-ib" aria-label={t('custom.goBack')}><ArrowLeft className="size-5.5" strokeWidth={1.8} aria-hidden="true" /></Link>
          <h1>{t('trash.title')}</h1>
          {emptyButton}
        </header>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-medium tracking-tight">{t('trash.title')}</h1>
          {emptyButton}
        </div>
      )}
      <div className="trash-body">
        {trash.length === 0 ? (
          <div data-theme-slot="empty-state" className="trash-empty">
            <span className="trash-empty-tile"><Trash2 className="size-6.5" strokeWidth={1.7} aria-hidden="true" /></span>
            <p className="trash-empty-title">{t('trash.empty')}</p>
            <p className="trash-empty-hint">{t('trash.intro')}</p>
          </div>
        ) : <>
          <p className="trash-info"><Info className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" /><span>{t('trash.intro')}</span></p>
          {groups.map((group) => (
            <section key={group.key} aria-label={t(`trash.group.${group.key}`)}>
              <h2 className="more-label">{t(`trash.group.${group.key}`)}</h2>
              <ul className="more-card trash-list">
                {group.rows.map((row) => {
                  const kind = trashKindKey(row)
                  const Icon = KIND_ICON[kind.split('.').at(-1) ?? ''] ?? FileText
                  return (
                    <li key={row.id}>
                      <div className="more-row trash-row">
                        <span className="more-ri trash-ri"><Icon className="size-4.5" strokeWidth={1.8} aria-hidden="true" /></span>
                        <div className="more-rt">
                          <p className="trash-title">{row.title}</p>
                          <small>{t(kind)} · {when(row)}</small>
                        </div>
                        <button data-theme-slot="button" type="button" className="trash-action trash-pill" disabled={Boolean(busy)} aria-busy={busy === row.id} onClick={() => void restore(row.id)}>
                          {busy === row.id ? t('trash.restoring') : t('trash.restore')}
                        </button>
                        <button data-theme-slot="button" type="button" className="trash-action trash-more" disabled={busy === row.id} aria-haspopup="dialog" aria-label={t('trash.more', { title: row.title })} onClick={() => setMenu(row)}>
                          <MoreHorizontal className="size-5" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </div>
                      {failed[row.id] ? (
                        <div role="alert" className="trash-alert">
                          <span>{t(failed[row.id] === 'conflict' ? 'trash.restoreConflict' : 'trash.restoreFailed')}</span>
                          <button data-theme-slot="button" type="button" className="trash-action shrink-0 font-medium" disabled={Boolean(busy)} onClick={() => void restore(row.id)}>
                            {t('trash.retry')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>}
      </div>
      {menu ? (
        <CustomizationSheet title={menu.title} subtitle={t(trashKindKey(menu))} onClose={() => setMenu(null)}>
          <div className="more-card">
            <button type="button" className="more-row" disabled={Boolean(busy)} onClick={() => { const id = menu.id; setMenu(null); void restore(id) }}>
              <span className="more-ri trash-ri"><RotateCcw className="size-4.5" strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="more-rt">{t('trash.restore')}</span>
            </button>
            <button type="button" className="more-row trash-danger" onClick={() => { const id = menu.id; setMenu(null); void purge(id) }}>
              <span className="more-ri trash-ri-danger"><Trash2 className="size-4.5" strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="more-rt">{t('trash.purgeForever')}</span>
            </button>
          </div>
        </CustomizationSheet>
      ) : null}
      <p className="more-toast" role="status" aria-live="polite" data-on={notice ? '' : undefined}>{notice}</p>
    </div>
  )
}
