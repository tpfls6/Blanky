import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { isSupabaseConfigured } from './services/supabase/client.ts'
import './styles/index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root was not found.')
}

document.documentElement.dataset.supabase = isSupabaseConfigured
  ? 'configured'
  : 'unconfigured'

if (!document.documentElement.dataset.scrollHint) {
  document.documentElement.dataset.scrollHint = '1'
  const scrollHint = document.createElement('div')
  scrollHint.className = 'scroll-hint'
  scrollHint.setAttribute('aria-hidden', 'true')
  document.body.append(scrollHint)
  let hideScrollHint = 0
  document.addEventListener('scroll', (event) => {
    const node = event.target
    const el = node === document ? document.scrollingElement : node
    if (!(el instanceof HTMLElement)) return
    const span = el.scrollHeight - el.clientHeight
    if (span < 1) return
    const box = el === document.scrollingElement
      ? { top: 0, height: window.innerHeight, right: window.innerWidth }
      : el.getBoundingClientRect()
    const height = Math.min(box.height, Math.max(28, (el.clientHeight / el.scrollHeight) * box.height))
    const y = box.top + (el.scrollTop / span) * (box.height - height)
    scrollHint.style.height = `${height}px`
    scrollHint.style.transform = `translate(${box.right - 8}px, ${y}px)`
    scrollHint.style.opacity = '1'
    clearTimeout(hideScrollHint)
    hideScrollHint = window.setTimeout(() => {
      scrollHint.style.opacity = '0'
    }, 700)
  }, { capture: true, passive: true })
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
