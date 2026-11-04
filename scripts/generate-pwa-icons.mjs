// Renders public/logo.svg into the PWA icon set with headless Chromium.
// Maskable icons keep the mark inside the 40% radius safe zone.
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter((name) => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.WORKSPACE_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set WORKSPACE_TEST_CHROMIUM to an installed Chromium executable')

const logo = await readFile(resolve('public/logo.svg'), 'utf8')
const work = await mkdtemp(join(tmpdir(), 'blanky-icons-'))
// [file, size, logo height as a share of the canvas]
const icons = [
  ['blanky-192.png', 192, 0.62],
  ['blanky-512.png', 512, 0.62],
  ['blanky-maskable-192.png', 192, 0.46],
  ['blanky-maskable-512.png', 512, 0.46],
  ['apple-touch-icon.png', 180, 0.56],
]
for (const [file, size, share] of icons) {
  const height = Math.round(size * share)
  const html = join(work, file + '.html')
  await writeFile(html, `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:#fff">${logo.replace('<svg ', `<svg height="${height}" `)}</body></html>`)
  const out = resolve('public/icons', file)
  execFileSync(chromium, ['--headless', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', `--window-size=${size},${size}`, `--screenshot=${out}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' })
  console.log('wrote public/icons/' + file)
}
