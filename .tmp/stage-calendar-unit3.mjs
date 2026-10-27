import { execSync } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = join(tmpdir(), 'blanky-cal-unit3')
mkdirSync(tmp, { recursive: true })
copyFileSync('package.json', join(tmp, 'package.json'))
copyFileSync('packages/api/src/index.ts', join(tmp, 'index.ts'))
copyFileSync('supabase/config.toml', join(tmp, 'config.toml'))

const pkg = JSON.parse(execSync('git show HEAD:package.json', { encoding: 'utf8' }))
pkg.scripts.test = pkg.scripts.test.replace(
  'packages/api/src/calendarSync/reconcile.test.ts',
  'packages/api/src/calendarSync/reconcile.test.ts packages/api/src/calendarSync/handle.test.ts',
)
const workingPkg = readFileSync('package.json', 'utf8')
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
execSync('git add -- package.json', { stdio: 'inherit' })
writeFileSync('package.json', workingPkg)

const headIndex = execSync('git show HEAD:packages/api/src/index.ts', { encoding: 'utf8' })
const marker = "export type { CalendarRepository } from './calendarRepository.ts'\n"
if (!headIndex.includes(marker)) throw new Error('api index marker missing')
const insert = `export { createCalendarSyncClient } from './calendarSync/client.ts'
export type { CalendarSyncClient } from './calendarSync/client.ts'
export type {
  CalendarError,
  CalendarErrorCode,
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
  LastSync,
  SyncReport,
} from '../../types/src/calendarSync.ts'
`
const workingIndex = readFileSync('packages/api/src/index.ts', 'utf8')
writeFileSync('packages/api/src/index.ts', headIndex.replace(marker, marker + insert))
execSync('git add -- packages/api/src/index.ts', { stdio: 'inherit' })
writeFileSync('packages/api/src/index.ts', workingIndex)

const headConfig = execSync('git show HEAD:supabase/config.toml', { encoding: 'utf8' })
const configMarker = '[functions.search-books]\nverify_jwt = true\n'
if (!headConfig.includes(configMarker)) throw new Error('config marker missing')
const configInsert = `[functions.search-books]
verify_jwt = true

[functions.google-calendar]
verify_jwt = true

[functions.google-calendar-oauth]
verify_jwt = false
`
const workingConfig = readFileSync('supabase/config.toml', 'utf8')
writeFileSync('supabase/config.toml', headConfig.replace(configMarker, configInsert))
execSync('git add -- supabase/config.toml', { stdio: 'inherit' })
writeFileSync('supabase/config.toml', workingConfig)
