import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const cache=new Map()
globalThis.localStorage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value),removeItem:key=>cache.delete(key)}
const server=await createServer({envDir:false,define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{middlewareMode:true},appType:'custom'})
try {
 const model=await server.ssrLoadModule('/packages/types/src/theme.ts')
 const service=await server.ssrLoadModule('/src/services/themes/index.ts')
 const client=await server.ssrLoadModule('/src/services/supabase/client.ts')
 assert.equal(client.isSupabaseConfigured,false,'smoke test must not contact a real database')
 const alice='smoke-alice',bob='smoke-bob'
 const initial=await service.loadThemes(alice)
 assert.equal(initial.themes.length,4)
 const draft={...structuredClone(model.BUILTIN_THEMES[0]),id:'smoke-theme',name:'Smoke Theme',creatorId:alice,creatorName:'Alice',visibility:'private'}
 await service.saveTheme(alice,draft)
 assert.equal((await service.loadThemes(alice)).themes.length,5)
 assert.equal((await service.loadThemes(bob)).themes.length,4)
 await assert.rejects(()=>service.saveTheme(bob,draft))
 await service.setActiveTheme(alice,draft.id)
 assert.equal((await service.loadThemes(alice)).active,draft.id)
 const vars=await server.ssrLoadModule('/src/theme/variables.ts')
 vars.themeVariables(model.BUILTIN_THEMES[3].config)
 assert.equal((await service.loadThemes(alice)).active,draft.id,'preview variable generation does not persist active theme')
 await service.installTheme(alice,model.BUILTIN_THEMES[0])
 await service.installTheme(alice,model.BUILTIN_THEMES[0])
 assert.equal((await service.loadThemes(alice)).installed.length,1)
 await assert.rejects(()=>service.installTheme(alice,{...draft,pricingType:'paid',price:1500}),/결제/)
 await assert.rejects(()=>service.removeTheme(alice,model.BUILTIN_THEMES[0]))
 await service.removeTheme(alice,draft)
 assert.equal((await service.loadThemes(alice)).themes.length,4)
 assert.equal((await service.loadThemes(alice)).active,null)
 await assert.rejects(()=>service.setActiveTheme(bob,draft.id))
 const loader=await server.ssrLoadModule('/src/theme/package/ThemeLoader.ts')
 const sanitizer=await server.ssrLoadModule('/src/theme/package/ThemeValidator.ts')
 const p=loader.packageFromTheme(draft)
 p.manifest.assets={background:'assets/background.svg'}
 p.files={'assets/background.svg':sanitizer.validateAsset('assets/background.svg',new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#ff9bb7"/></svg>'))}
 p.customCss='[data-theme-slot="schedule-card"]{border-radius:20px}'
 const packageTheme={...draft,id:'smoke-package',themeType:'package',visibility:'public',package:p}
 await service.saveTheme(alice,packageTheme)
 const savedPackage=(await service.loadThemes(alice)).themes.find(t=>t.id===packageTheme.id)
 assert.ok(savedPackage.package.files['assets/background.svg'].data)
 await service.installTheme(alice,savedPackage)
 await service.setActiveTheme(alice,savedPackage.id)
 assert.equal((await service.loadThemes(alice)).active,savedPackage.id)
 const shared=await loader.importThemePackage(await loader.exportThemePackage(savedPackage.package))
 assert.deepEqual(shared.config,savedPackage.config)
 const imported={...savedPackage,id:'smoke-bob-package',creatorId:bob,visibility:'private',package:shared}
 await service.importInstalledTheme(bob,imported)
 await service.setActiveTheme(bob,imported.id)
 assert.ok((await service.loadThemes(bob)).installed.includes(imported.id))
 await service.removeTheme(bob,imported)
 assert.equal((await service.loadThemes(bob)).active,null)
 assert.ok((await service.loadThemes(alice)).themes.some(t=>t.id===packageTheme.id),'sharing/uninstall preserves original')
 console.log('PASS package local persistence, public store install, sharing roundtrip, user isolation, uninstall cleanup')
 const pages=await server.ssrLoadModule('/src/pages/Themes/ThemePages.tsx')
 const {ThemeContext}=await server.ssrLoadModule('/src/theme/context.ts')
 const {ConfirmContext}=await server.ssrLoadModule('/src/state/useConfirm.ts')
 const {SessionContext}=await server.ssrLoadModule('/src/state/useSession.ts')
 const value={...initial,preview:null,error:'',loading:false,refresh:async()=>{},apply:async()=>{},startPreview:()=>{},endPreview:()=>{}}
 const user={id:alice,nickname:'Alice',name:'Alice',email:'alice@example.test',avatar:null,password:''}
 for(const [route,pattern,Component] of [['/store','/store',pages.StorePage],['/settings/themes','/settings/themes',pages.MyThemesPage],['/customize/theme','/customize/theme',pages.ThemeEditorPage],['/store/themes/'+model.BUILTIN_THEMES[0].id,'/store/themes/:themeId',pages.ThemeDetailPage],['/creator/blanky','/creator/:userId',pages.CreatorPage]]) {
  const tree=React.createElement(MemoryRouter,{initialEntries:[route]},React.createElement(SessionContext.Provider,{value:{user}},React.createElement(ThemeContext.Provider,{value},React.createElement(Routes,null,React.createElement(Route,{path:pattern,element:React.createElement(Component)})))))
  const html=renderToString(React.createElement(ConfirmContext.Provider,{value:async()=>true},tree))
  assert.ok(html.includes('테마')||html.includes('Blanky Default'),route)
  if (route === '/customize/theme') {
    assert.ok(html.includes('Color') && html.includes('Pattern') && html.includes('Character'), 'type cards')
    assert.ok(!html.includes('사이드바 상단'), 'character slots hidden until type is chosen')
  }
  console.log('PASS render '+route)
 }
 console.log('PASS local theme save, ownership, install, apply, preview isolation, paid guard, deletion')
} finally {await server.close()}
