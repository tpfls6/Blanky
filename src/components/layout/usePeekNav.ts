import { useEffect, useRef, useState } from 'react'

const HIDE_MS = 220
const EDGE = 16

export function usePeekNav(enabled: boolean) {
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false)
  const hideRef = useRef(0)
  const pinnedRef = useRef(false)
  pinnedRef.current = pinned

  useEffect(() => {
    setOpen(false)
    setPinned(false)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const show = () => {
      window.clearTimeout(hideRef.current)
      setOpen(true)
    }
    const hide = () => {
      if (pinnedRef.current) return
      window.clearTimeout(hideRef.current)
      hideRef.current = window.setTimeout(() => setOpen(false), HIDE_MS)
    }
    const onMove = (event: MouseEvent) => {
      if (!fine.matches) return
      if (event.buttons !== 0) {
        if (!pinnedRef.current) setOpen(false)
        return
      }
      const side = document.getElementById('app-sidebar')?.getBoundingClientRect()
      const overSide = !!side && event.clientX >= side.left && event.clientX <= side.right && event.clientY >= side.top && event.clientY <= side.bottom
      if (event.clientX <= EDGE || overSide) show()
      else hide()
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.clearTimeout(hideRef.current)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pinned) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, pinned])

  const toggle = () => {
    setPinned((value) => {
      const next = !value
      setOpen(next)
      return next
    })
  }

  return { open: !enabled || open || pinned, pinned, toggle }
}
