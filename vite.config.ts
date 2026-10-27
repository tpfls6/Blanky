import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
// https://vite.dev/config/
export default defineConfig({
  build: { manifest: true, rolldownOptions: { output: { codeSplitting: { groups: [
    { name:'react-vendor',test:/node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,priority:20 },
    { name:'supabase',test:/node_modules[\\/]@supabase[\\/]/,priority:15 },
    { name:'reading-icons',test:(id:string)=>{const match=/lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/]([^/\\]+)\.m?js$/.exec(id);return !!match&&match[1]!=='index'&&!uiIcons.has(match[1].replace(/-/g,''))},maxSize:180000,priority:10 },
  ] } } } },
  plugins: [react(), tailwindcss()],
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
