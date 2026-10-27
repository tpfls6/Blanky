import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = join(tmpdir(), 'blanky-cal-unit4')
mkdirSync(tmp, { recursive: true })

function stagePatched(path, patch) {
  copyFileSync(path, join(tmp, path.replaceAll('/', '__')))
  const head = execSync(`git show HEAD:${path}`, { encoding: 'utf8' })
  const next = patch(head)
  if (next === head) throw new Error(`no change for ${path}`)
  const working = readFileSync(path, 'utf8')
  writeFileSync(path, next)
  execSync(`git add -- ${path}`, { stdio: 'inherit' })
  writeFileSync(path, working)
}

stagePatched('packages/types/src/schedule.ts', (text) => text.replaceAll(
  "changeSource?: 'manual' | 'ai_chat'",
  "changeSource?: 'manual' | 'ai_chat' | 'calendar_sync'",
))

stagePatched('src/types/work.ts', (text) => text.replace(
  '  repeat: RepeatRule\n}',
  `  repeat: RepeatRule
  changeSource?: 'manual' | 'ai_chat' | 'calendar_sync'
  calendarType?: 'personal' | 'shared' | 'external'
}`,
))

stagePatched('packages/api/src/scheduleRepository.ts', (text) => text.replace(
  '    ai: readAi(value),\n  }',
  `    ai: readAi(value),
    changeSource: value.change_source === 'ai_chat' || value.change_source === 'calendar_sync' ? value.change_source : 'manual',
  }`,
))

stagePatched('src/pages/Settings/SettingsPage.tsx', (text) => {
  if (text.includes('GoogleCalendarSection')) return text
  const withImport = text.replace(
    "import { CategorySection } from './CategorySection.tsx'\n",
    "import { CategorySection } from './CategorySection.tsx'\nimport { GoogleCalendarSection } from './GoogleCalendarSection.tsx'\n",
  )
  return withImport.replace(
    `            <SwitchRow label="할 일 마감 알림" checked={settings.notifyTasks} onChange={() => patch({ notifyTasks: !settings.notifyTasks })} />
          </div>
        </div>
      </Section>`,
    `            <SwitchRow label="할 일 마감 알림" checked={settings.notifyTasks} onChange={() => patch({ notifyTasks: !settings.notifyTasks })} />
          </div>
        </div>
        <GoogleCalendarSection />
      </Section>`,
  )
})

stagePatched('src/pages/Schedule/SchedulePage.tsx', (text) => {
  let next = text
  if (!next.includes('GoogleOriginBadge')) {
    next = next.replace(
      "import { ScheduleTimeline } from '../../components/schedule/ScheduleTimeline.tsx'\n",
      "import { GoogleOriginBadge } from '../../components/schedule/GoogleOriginBadge.tsx'\nimport { ScheduleTimeline } from '../../components/schedule/ScheduleTimeline.tsx'\n",
    )
    if (next === text) {
      next = text.replace(
        /^(import )/m,
        "import { GoogleOriginBadge } from '../../components/schedule/GoogleOriginBadge.tsx'\n$1",
      )
    }
  }
  if (next.includes('{item.title}\n          <GoogleOriginBadge')) return next
  next = next.replace(
    /\{item\.title\}/g,
    '{item.title}<GoogleOriginBadge item={item} />',
  )
  return next
})

const pkg = JSON.parse(execSync('git show HEAD:package.json', { encoding: 'utf8' }))
pkg.scripts.test = pkg.scripts.test.replace(
  'packages/api/src/calendarSync/handle.test.ts',
  'packages/api/src/calendarSync/handle.test.ts src/services/calendarSync/origin.test.ts',
)
const workingPkg = readFileSync('package.json', 'utf8')
writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
execSync('git add -- package.json', { stdio: 'inherit' })
writeFileSync('package.json', workingPkg)
