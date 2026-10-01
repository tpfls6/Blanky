import { useEffect, type ReactNode } from 'react'

type SidePanelProps = {
  onClose: () => void
  children: ReactNode
}

export function SidePanel({ onClose, children }: SidePanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" className="absolute inset-0" aria-label="닫기" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-white px-5 py-6 sm:w-80 sm:border-l sm:border-neutral-100">
        {children}
      </aside>
    </div>
  )
}
