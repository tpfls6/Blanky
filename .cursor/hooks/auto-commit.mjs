import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function finish() {
  process.stdout.write('{}\n')
}

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

const blocked = /(^|\/)\.env($|\.)|credentials\.json$|\.pem$/i

let payload = {}
try {
  const input = readFileSync(0, 'utf8')
  if (input.trim()) payload = JSON.parse(input)
} catch {
  finish()
  process.exit(0)
}

if (payload.status !== 'completed') {
  finish()
  process.exit(0)
}

let porcelain = ''
try {
  porcelain = git(['status', '--porcelain'])
} catch {
  finish()
  process.exit(0)
}

if (!porcelain) {
  finish()
  process.exit(0)
}

try {
  git(['add', '-A'])
  const staged = git(['diff', '--cached', '--name-only'])
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)

  const secrets = staged.filter((file) => blocked.test(file))
  if (secrets.length > 0) {
    git(['reset', 'HEAD', '--', ...secrets])
  }

  const files = git(['diff', '--cached', '--name-only'])
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean)

  if (files.length === 0) {
    finish()
    process.exit(0)
  }

  const areas = [...new Set(files.map((file) => file.split('/')[0]))]
  const subject = `Save changes in ${areas.slice(0, 3).join(', ')}`
  const body = files.slice(0, 12).join('\n')
  git(['commit', '-m', subject, '-m', body])
} catch {
  finish()
  process.exit(0)
}

finish()
