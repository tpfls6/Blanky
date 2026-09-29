import { useEffect } from 'react'
import { SECONDARY_NAV_ITEMS } from '../../constants/navigation.ts'
import { NavLinks } from './NavLinks.tsx'

type MobileDrawerProps = {
  open: boolean
  onClose: () => void
}

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-neutral-900/20"
        aria-label="메뉴 닫기"
        onClick={onClose}
      />
      <div
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="추가 메뉴"
        className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white px-4 py-8"
      >
        <p className="px-2 text-sm font-medium tracking-tight text-neutral-900">
          Blanky
        </p>
        <NavLinks
          items={SECONDARY_NAV_ITEMS}
          onNavigate={onClose}
          label="추가 메뉴"
          className="mt-8 flex flex-col gap-0.5"
        />
      </div>
    </div>
  )
}
