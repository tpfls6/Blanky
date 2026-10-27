import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const extra = `
# Google Calendar: Edge Function secret only. Never use a VITE_ prefix.
# Configure in Supabase Secrets or supabase/functions/.env for local functions.
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REDIRECT_URI=
`
const head = execSync('git show HEAD:.env.example', { encoding: 'utf8' })
const working = readFileSync('.env.example', 'utf8')
writeFileSync('.env.example', head.trimEnd() + '\n' + extra)
execSync('git add -- .env.example GOOGLE_CALENDAR_SETUP.md', { stdio: 'inherit' })
writeFileSync('.env.example', working)
