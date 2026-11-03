import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

/** Right column on wide screens, slide-over on narrow ones. ESC yields to any open modal first. */
export function ChatPanel({ open, focusOnOpen, busy, onClose, children }: { open: boolean; focusOnOpen: boolean; busy: boolean; onClose: (restoreFocus: boolean) => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const close = () => onClose(Boolean(panel.current?.contains(document.activeElement)) || document.activeElement === document.body)
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => { if (open && focusOnOpen) heading.current?.focus() }, [open, focusOnOpen])
  useEffect(() => { if (open && list.current) list.current.scrollTop = list.current.scrollHeight }, [open, children])
  return <>
    {open && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" aria-hidden="true" onClick={close} />}
    <aside ref={panel} id="home-chat-panel" aria-labelledby="home-chat-title" hidden={!open}
      className={(open ? 'flex' : 'hidden') + ' fixed inset-y-0 right-0 z-40 w-[min(100vw,24rem)] flex-col border-l border-line bg-surface lg:static lg:z-auto lg:w-96 lg:shrink-0'}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 ref={heading} id="home-chat-title" tabIndex={-1} className="text-sm font-medium outline-none">대화 기록</h2>
        <button data-theme-slot="button" type="button" className="icon-btn" aria-label="대화 기록 닫기" onClick={close}><X aria-hidden="true" className="size-4" /></button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={busy}>{children}</div>
    </aside>
  </>
}
