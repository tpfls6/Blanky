import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

execSync('git restore --staged -- src/pages/Schedule/SchedulePage.tsx', { stdio: 'inherit' })
let text = execSync('git show HEAD:src/pages/Schedule/SchedulePage.tsx', { encoding: 'utf8' })
if (!text.includes('GoogleOriginBadge')) {
  text = text.replace(
    'import { useEffect',
    "import { GoogleOriginBadge } from '../../components/schedule/GoogleOriginBadge.tsx'\nimport { useEffect",
  )
}
text = text.replace(
  "<span data-theme-slot=\"schedule-title\" className={done ? 'block text-sm text-neutral-400 line-through' : 'block text-sm text-neutral-900'}>\n          {item.title}\n        </span>",
  "<span data-theme-slot=\"schedule-title\" className={done ? 'block text-sm text-neutral-400 line-through' : 'block text-sm text-neutral-900'}>\n          {item.title}<GoogleOriginBadge item={item} />\n        </span>",
)
text = text.replace(
  "<span className={done ? 'block truncate text-sm text-neutral-400 line-through' : 'block truncate text-sm text-neutral-900'}>\n            {item.title}\n          </span>",
  "<span className={done ? 'block truncate text-sm text-neutral-400 line-through' : 'block truncate text-sm text-neutral-900'}>\n            {item.title}<GoogleOriginBadge item={item} />\n          </span>",
)
if (text.includes('label={`${item.title}<GoogleOriginBadge')) throw new Error('label leak')
const working = readFileSync('src/pages/Schedule/SchedulePage.tsx', 'utf8')
writeFileSync('src/pages/Schedule/SchedulePage.tsx', text)
execSync('git add -- src/pages/Schedule/SchedulePage.tsx', { stdio: 'inherit' })
writeFileSync('src/pages/Schedule/SchedulePage.tsx', working)
