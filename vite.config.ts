import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'

function packageEntry(relativePath: string): string {
  return fileURLToPath(new URL(relativePath, import.meta.url))
}

// Keep directly imported UI icons separate from the full, lazy Reading picker catalog.
const uiIcons=new Set<string>()
function collectIcons(directory:string){
 for(const entry of readdirSync(directory,{withFileTypes:true})){
  const path=join(directory,entry.name)
  if(entry.isDirectory())collectIcons(path)
  else if(/\.tsx?$/.test(path))for(const match of readFileSync(path,'utf8').matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g))for(const name of match[1].split(','))uiIcons.add(name.trim().split(/\s+as\s+/)[0].replace(/[^a-zA-Z0-9]/g,'').toLowerCase())
 }
}
collectIcons(packageEntry('./src'))
const prosemirrorPackages = Object.keys(JSON.parse(readFileSync(packageEntry('./node_modules/@tiptap/pm/package.json'), 'utf8')).dependencies) as string[]
// Account for Lucide aliases (for example CircleHelp → circle-question-mark).
for(const match of readFileSync(packageEntry('./node_modules/lucide-react/dist/esm/lucide-react.mjs'),'utf8').matchAll(/export\s*\{([^}]+)\}\s*from\s*['"]\.\/icons\/([^'"]+)['"]/g))if(match[1].split(',').some(name=>uiIcons.has(name.trim().split(/\s+as\s+/).at(-1)!.toLowerCase())))uiIcons.add(match[2].replace(/\.m?js$/,'').replace(/-/g,''))

// Emits /sw.js with the build's files listed for offline start. The lazy Reading
// icon catalog stays out of the precache; it is cached the first time it loads.
function serviceWorker(): Plugin {
  return {
    name: 'blanky-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.endsWith('.map') && !name.startsWith('.vite/') && !name.includes('reading-icons') && name !== 'index.html')
      const precache = ['/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/blanky-192.png', '/icons/blanky-512.png', '/icons/apple-touch-icon.png', ...files.map((name) => '/' + name)]
      const template = readFileSync(packageEntry('./src/pwa/serviceWorker.js'), 'utf8')
      // Hashed names cover the build; public files and the worker itself are hashed by content.
      const hash = createHash('sha256').update(template).update(precache.join('\n'))
      for (const path of precache.slice(1, 6)) hash.update(readFileSync(packageEntry('./public' + path)))
      const version = hash.digest('hex').slice(0, 12)
      const source = template
        .replace('__BLANKY_SW_VERSION__', version)
        .replace('__BLANKY_PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
// https://vite.dev/config/
export default defineConfig({
  build: { manifest: true, rolldownOptions: { output: { codeSplitting: { groups: [
    { name:'react-vendor',test:/node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,priority:20 },
    { name:'supabase',test:/node_modules[\\/]@supabase[\\/]/,priority:15 },
    { name:'reading-icons',test:(id:string)=>{const match=/lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/]([^/\\]+)\.m?js$/.exec(id);return !!match&&match[1]!=='index'&&!uiIcons.has(match[1].replace(/-/g,''))},maxSize:180000,priority:10 },
  ] } } } },
  plugins: [react(), tailwindcss(), serviceWorker()],
  // Phone testing through an HTTPS tunnel (see docs/MOBILE_PWA.md).
  server: { allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'] },
  preview: { allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'] },
  // Prebundle the lazy memo editor together. Discovering its dependencies in
  // separate optimizer runs can leave two ProseMirror module instances alive.
  optimizeDeps: {
    include: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/core', ...prosemirrorPackages.map(name => `@tiptap/pm/${name.replace('prosemirror-', '')}`)],
  },
  resolve: {
    dedupe: ['@tiptap/core', '@tiptap/pm', ...prosemirrorPackages],
    alias: {
      '@blanky/types': packageEntry('./packages/types/src/index.ts'),
      '@blanky/utils': packageEntry('./packages/utils/src/index.ts'),
      '@blanky/api': packageEntry('./packages/api/src/index.ts'),
      '@blanky/parse': packageEntry('./packages/parse/src/index.ts'),
    },
  },
})
