import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = join(tmpdir(), 'blanky-cal-unit2')
copyFileSync(join(tmp, 'index.ts'), 'packages/types/src/index.ts')
copyFileSync(join(tmp, 'package.json'), 'package.json')
execSync('git restore --staged -- package.json packages/types/src/index.ts', { stdio: 'inherit' })

const pkg = JSON.parse(execSync('git show HEAD:package.json', { encoding: 'utf8' }))
pkg.scripts.test = pkg.scripts.test.replace(
  'packages/api/src/googleAuth.test.ts ',
  'packages/api/src/googleAuth.test.ts packages/api/src/calendarSync/reconcile.test.ts ',
)
const workingPkg = readFileSync('package.json', 'utf8')
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
execSync('git add -- package.json', { stdio: 'inherit' })
writeFileSync('package.json', workingPkg)

const headIndex = execSync('git show HEAD:packages/types/src/index.ts', { encoding: 'utf8' })
const marker = "export type { Calendar, CalendarType, CalendarRole, PersonalCalendarInput } from './calendar.ts'\n"
if (!headIndex.includes(marker)) throw new Error('index marker missing')
const insert = `export type {
  CalendarError,
  CalendarErrorCode,
  CalendarId,
  ConflictNote,
  ConnectionId,
  ConnectionView,
  DateStr,
  DisconnectDisposition,
  Etag,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
  GoogleEventId,
  GoogleSub,
  IsoDateTime,
  IsoWeekday,
  LastSync,
  OAuthState,
  PeerWhen,
  Recurrence,
  ScheduleId,
  SyncCursor,
  SyncReport,
  SyncToken,
  TimeStr,
  UserId,
} from './calendarSync.ts'
export {
  asCalendarId,
  asConnectionId,
  asDateStr,
  asEtag,
  asGoogleCalendarId,
  asGoogleEventId,
  asGoogleSub,
  asIsoDateTime,
  asIsoWeekday,
  asOAuthState,
  asScheduleId,
  asSyncToken,
  asTimeStr,
  asUserId,
} from './calendarSync.ts'

`
const workingIndex = readFileSync('packages/types/src/index.ts', 'utf8')
writeFileSync('packages/types/src/index.ts', headIndex.replace(marker, marker + insert))
execSync('git add -- packages/types/src/index.ts', { stdio: 'inherit' })
writeFileSync('packages/types/src/index.ts', workingIndex)
