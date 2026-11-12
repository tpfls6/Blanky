import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { repeatsOn } from '../../../packages/types/src/recurrence.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { isReadOnlyCalendar } from '../../services/calendar/access.ts'
import type { Activity } from '../../services/schedule/workStore.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { commitDraft } from '../../features/schedule/occurrence.ts'
import { firstOccurrence, isRecurring, nextOccurrence, seriesKey, shiftISO, type SeriesScope } from '../../features/schedule/seriesEdit.ts'
import type { WorkItem } from '../../types/work.ts'
import { todayISO } from '../../utils/date.ts'

const SCOPES = [{ value: 'this', key: 'removeScopeThis' }, { value: 'future', key: 'removeScopeFuture' }, { value: 'all', key: 'removeScopeAll' }] as const

/** Today when the series repeats today, else its next day, else its first. */
function defaultDay(item: WorkItem): string {
  const today = todayISO()
  return (repeatsOn(item, today) ? today : nextOccurrence(item, shiftISO(today, -1)) ?? firstOccurrence(item)) ?? item.date
}

/**
 * Deletes from the activity history: either the schedule or task itself (through the same
 * commit path as the schedule screen, so recurring rows honor the chosen scope) or only this history row.
 */
export function RemoveRecordDialog({ activity, onClose, onDone }: { activity: Activity; onClose: () => void; onDone: (title: string) => void }) {
  const { t } = useI18n()
  const library = useLibrary()
  const snapshot = activity.after ?? activity.before
  const item = library.items.find(row => row.id === activity.entityId) ?? null
  const readOnly = Boolean(item && isReadOnlyCalendar(item.calendarId))
  const recurring = Boolean(item && isRecurring(item))
  const kind = t((item ?? snapshot)?.kind === 'task' ? 'type.task' : 'type.event')
  const title = item?.title || snapshot?.title || t('activity.previous')
  const [mode, setMode] = useState<'data' | 'record'>(item && !readOnly ? 'data' : 'record')
  const [scope, setScope] = useState<SeriesScope>('this')
  const [day, setDay] = useState(() => item && recurring ? defaultDay(item) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  const scoped = mode === 'data' && recurring
  const members = item ? library.items.filter(row => seriesKey(row) === seriesKey(item)) : []
  const dayInvalid = scoped && scope !== 'all' && !members.some(row => isRecurring(row) && repeatsOn(row, day))
  const cancel = () => { if (!busy) onClose() }

  const submit = async () => {
    if (busy || dayInvalid) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'record') await library.removeActivity(activity.id)
      else if (item && recurring) await commitDraft(library.items, library.commitWork, item, null, { occurrence: scope === 'all' ? (firstOccurrence(item) ?? item.date) : day, scope })
      else if (item) await library.commitWork(item, null)
      onDone(title)
    } catch (cause) {
      setError(t('activity.removeFailed', { message: cause instanceof Error ? cause.message : String(cause) }))
      setBusy(false)
    }
  }

  const option = (value: 'data' | 'record', label: string, hint: string) => <label className={'field flex cursor-pointer items-start gap-2 text-left ' + (mode === value ? 'choice-on' : '')}>
    <input type="radio" name="remove-mode" className="mt-1" checked={mode === value} disabled={busy} onChange={() => setMode(value)} />
    <span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-xs text-neutral-500">{hint}</span></span>
  </label>

  return <dialog data-theme-slot="modal" ref={ref} className="app-confirm-dialog" aria-labelledby={titleId} data-remove-record onCancel={event => { event.preventDefault(); cancel() }} onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancel() } }}>
    <div className="flex items-start justify-between gap-4">
      <span className="flex size-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><AlertTriangle aria-hidden="true" className="size-5" strokeWidth={1.75} /></span>
      <button data-theme-slot="button" type="button" className="icon-btn" aria-label={t('close')} disabled={busy} onClick={cancel}><X aria-hidden="true" className="size-4" /></button>
    </div>
    <h2 id={titleId} className="mt-4 text-base font-medium">{t('activity.removeTitle')}</h2>
    <p className="mt-1 truncate text-sm text-neutral-500">{title}</p>
    <fieldset className="mt-4 grid gap-2" disabled={busy}>
      <legend className="sr-only">{t('activity.removeTitle')}</legend>
      {item && !readOnly && option('data', t('activity.removeData', { kind }), t('activity.removeDataHint'))}
      {option('record', t('activity.removeRecord'), t('activity.removeRecordHint', { kind }))}
      {!item && <p className="text-xs text-neutral-400">{t('activity.removeGone', { kind })}</p>}
      {readOnly && <p className="text-xs text-neutral-400">{t('activity.removeReadOnly')}</p>}
    </fieldset>
    {scoped && <div className="mt-4 text-xs text-neutral-500" data-series-scope>
      <p className="mb-1.5">{t('activity.removeScope')}</p>
      <div role="radiogroup" aria-label={t('activity.removeScope')} className="grid grid-cols-3 gap-2">
        {SCOPES.map(option => <button key={option.value} data-theme-slot="button" type="button" role="radio" aria-checked={scope === option.value} disabled={busy}
          className={scope === option.value ? 'field choice-on text-center' : 'field text-center text-neutral-400'} onClick={() => setScope(option.value)}>{t('activity.' + option.key)}</button>)}
      </div>
      {scope !== 'all' && <label className="mt-3 block">{t('activity.removeDay')}<input type="date" className="field mt-1 w-full" value={day} disabled={busy} aria-invalid={dayInvalid} onChange={event => setDay(event.target.value)} /></label>}
      <p className={'mt-2 ' + (dayInvalid ? 'text-red-500' : '')}>{dayInvalid ? t('activity.removeNotOccurrence') : scope === 'all' ? t('activity.removeAll') : t(scope === 'future' ? 'activity.removeFuture' : 'activity.removeThis', { date: day })}</p>
    </div>}
    {error && <p role="alert" className="mt-4 rounded-md bg-red-500/10 p-3 text-sm text-red-600">{error}</p>}
    <div className="mt-6 flex justify-end gap-2">
      <button data-theme-slot="button" type="button" autoFocus className="btn btn-ghost" disabled={busy} onClick={cancel}>{t('cancel')}</button>
      <button data-theme-slot="button" type="button" className="btn app-confirm-action" disabled={busy || dayInvalid} onClick={() => void submit()}>{busy ? t('activity.removeBusy') : t('activity.removeConfirm')}</button>
    </div>
  </dialog>
}
