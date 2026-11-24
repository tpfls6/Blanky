import { PenLine, Plus, Sparkles } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useI18n } from '../../i18n/useI18n.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { QuickAddSheet } from '../../pages/Schedule/QuickAddSheet.tsx'
import { useOpenQuickAdd } from '../../pages/Schedule/quickAdd.ts'
import './addFab.css'

/**
 * Phone-only + button for list pages (diary, reading, records, memo): it opens a dial with
 * "AI 추가" (the quick-add sheet, shown over this page) and the page's own manual add.
 */
export function AddFab({ manualLabel, onManual, hidden = false, tour }: {
  /** Defaults to "직접 추가". */
  manualLabel?: string
  onManual: () => void
  /** Hides the button (and its dial) while the page shows an editor, selection or search. */
  hidden?: boolean
  /** `data-tour` of the + button, for the page's onboarding step. */
  tour?: string
}) {
  const phone = useMediaQuery(PHONE_QUERY)
  if (!phone) return null
  return <PhoneAddFab manualLabel={manualLabel} onManual={onManual} hidden={hidden} tour={tour} />
}

function PhoneAddFab({ manualLabel, onManual, hidden, tour }: { manualLabel?: string; onManual: () => void; hidden: boolean; tour?: string }) {
  const { t } = useI18n()
  const openQuickAdd = useOpenQuickAdd()
  const [open, setOpen] = useState(false)
  const dialId = useId()
  const dial = open && !hidden
  useEffect(() => {
    if (!dial) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dial])

  return (
    <>
      {hidden ? null : <>
        <div className="add-fab-dim" data-open={dial || undefined} aria-hidden="true" onClick={() => setOpen(false)} />
        <div className="add-fab-dial add-dial" data-open={dial || undefined} inert={!dial} id={dialId}>
          <button type="button" data-add="quick" onClick={() => { setOpen(false); openQuickAdd() }}>
            <span>{t('schedule.mobile.quickAdd')}</span>
            <i className="ai-add-icon"><Sparkles aria-hidden="true" className="size-5.5" strokeWidth={1.8} /></i>
          </button>
          <button type="button" data-add="manual" onClick={() => { setOpen(false); onManual() }}>
            <span>{manualLabel ?? t('schedule.mobile.manualAdd')}</span>
            <i><PenLine aria-hidden="true" className="size-5.5" strokeWidth={1.8} /></i>
          </button>
        </div>
        <button type="button" className="add-fab" data-theme-slot="button-primary" data-tour={tour} aria-expanded={dial} aria-controls={dialId}
          aria-label={t(dial ? 'schedule.mobile.closeAdd' : 'schedule.mobile.add')} onClick={() => setOpen(!dial)}>
          <Plus aria-hidden="true" className="size-6.5" strokeWidth={2.4} />
        </button>
      </>}
      <QuickAddSheet />
    </>
  )
}
