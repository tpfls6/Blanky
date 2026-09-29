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

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
