import { useEffect, useRef, useState } from 'react'

const HIDE_MS = 220
const EDGE = 16

export function usePeekNav() {
  const [open, setOpen] = useState(true)
  const [pinned, setPinned] = useState(true)
  const hideRef = useRef(0)
  const pinnedRef = useRef(false)
  pinnedRef.current = pinned

  useEffect(() => {
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
    const hit = (id: string, event: MouseEvent) => {
      const box = document.getElementById(id)?.getBoundingClientRect()
      return !!box && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    }
    const onMove = (event: MouseEvent) => {
      if (!fine.matches) return
      if (event.buttons !== 0) {
        if (!pinnedRef.current) setOpen(false)
        return
      }
      if (event.clientX <= EDGE || hit('app-sidebar', event) || hit('app-sidebar-toggle', event)) show()
      else hide()
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.clearTimeout(hideRef.current)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPinned(false)
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggle = () => {
    setPinned((value) => {
      const next = !value
      setOpen(next)
      return next
    })
  }

  return { open: open || pinned, pinned, toggle }
}
