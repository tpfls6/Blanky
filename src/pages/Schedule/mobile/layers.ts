import { useEffect, useRef, type RefObject } from 'react'
import { KEYBOARD_CHANGE_EVENT } from '../../../hooks/useMobileViewport.ts'

/** History-state key of an open overlay layer (sheet, page, picker) on the phone calendar. */
const LAYER = 'blankyLayer'
type LayerState = Record<string, unknown> | null
const layerOf = () => (history.state as LayerState)?.[LAYER]
/** A UI close pops its entry asynchronously; a layer opened meanwhile pushes only after that pop lands. */
let popping = 0
let waiting: (() => void)[] = []
const afterPops = (run: () => void) => { if (popping) waiting.push(run); else run() }
const popLanded = () => {
  popping = Math.max(0, popping - 1)
  if (popping) return
  const runs = waiting
  waiting = []
  runs.forEach((run) => run())
}

/** A layer entry left behind (reload, or Back after leaving the page) closes nothing: drop its marker. */
export function clearStaleLayer() {
  const state = history.state as LayerState
  if (!state || !(LAYER in state)) return
  const rest = { ...state }
  delete rest[LAYER]
  history.replaceState(rest, '')
}

/**
 * While `open`, the layer owns one history entry (same URL), so the system Back closes only this layer,
 * like the schedule editor's page. Closing from the UI pops that entry again, so none pile up.
 */
export function useBackLayer(open: boolean, close: () => void) {
  const latest = useRef(close)
  useEffect(() => { latest.current = close })
  useEffect(() => {
    if (!open) return
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    let popped = false, pushed = false, gone = false
    afterPops(() => { if (gone) return; pushed = true; history.pushState({ ...(history.state as object | null), [LAYER]: token }, '') })
    const onPop = () => {
      if (popped || !pushed || layerOf() === token) return
      popped = true
      latest.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      gone = true
      window.removeEventListener('popstate', onPop)
      if (!popped && pushed && layerOf() === token) {
        popping++
        const done = () => { window.removeEventListener('popstate', done); popLanded() }
        window.addEventListener('popstate', done)
        history.back()
      }
    }
  }, [open])
}

/** Lifts the status toast above an open bottom sheet (`--toast-lift` = the sheet's visible height). */
export function useToastLift(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!active || !element) return
    const root = document.documentElement
    const update = () => root.style.setProperty('--toast-lift', `${Math.max(0, window.innerHeight - element.getBoundingClientRect().top)}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    // The sheet slides in and resizes with CSS animations and transitions; settle once they end.
    element.addEventListener('transitionend', update)
    element.addEventListener('animationend', update)
    // The keyboard lifts the sheet (`--kb-inset`) without resizing it.
    window.addEventListener(KEYBOARD_CHANGE_EVENT, update)
    return () => {
      observer.disconnect()
      element.removeEventListener('transitionend', update)
      element.removeEventListener('animationend', update)
      window.removeEventListener(KEYBOARD_CHANGE_EVENT, update)
      root.style.removeProperty('--toast-lift')
    }
  }, [ref, active])
}
