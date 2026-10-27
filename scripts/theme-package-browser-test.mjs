// Runs the real app in local mode with an isolated account and disposable Chromium profile.
// Set THEME_TEST_CHROMIUM if a cached Playwright headless Chromium is unavailable.
import { mkdir, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const base = process.env.THEME_TEST_URL ?? 'http://127.0.0.1:5186'
if (new URL(base).hostname !== '127.0.0.1') throw new Error('Test URL must be on loopback')
const cache = join(homedir(), 'AppData', 'Local', 'ms-playwright')
const cached = (await readdir(cache).catch(() => [])).filter(name => name.startsWith('chromium_headless_shell-')).sort().at(-1)
const chromium = process.env.THEME_TEST_CHROMIUM ?? (cached ? join(cache, cached, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe') : null)
if (!chromium) throw new Error('Set THEME_TEST_CHROMIUM to an installed Chromium executable')
const profile = await mkdtemp(join(tmpdir(), 'blanky-theme-test-'))
const browser = spawn(chromium, ['--headless', '--no-sandbox', '--remote-debugging-port=0', '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'pipe' })
let browserOutput = ''
const browserEndpoint = await new Promise((resolve, reject) => {
  browser.on('error', reject)
  browser.stderr.on('data', data => { browserOutput += data; const match = browserOutput.match(/ws:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0].replace('ws:', 'http:')) })
  browser.on('exit', code => reject(new Error('Chromium exited: ' + code + ' ' + browserOutput)))
})
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: { ignored: ["**/.tmp/**"] } } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
let serverOutput = ''; server.stdout.on('data', data => { serverOutput += data }); server.stderr.on('data', data => { serverOutput += data })
for (let i=0; i<60; i++) { try { const res = await fetch(base); if(res.ok) break } catch {} await new Promise(r=>setTimeout(r,100)); if(i===59) throw new Error(serverOutput) }
let targets
for (let i=0;i<50;i++){try{targets=await fetch(browserEndpoint + '/json/list').then(r=>r.json()); break}catch{} await new Promise(r=>setTimeout(r,100));if(i===49)throw new Error(browserOutput)}
const target = targets.find(t => t.type === 'page')
if (!target) throw new Error('No disposable browser test page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0
let loadResolve = null
const pending = new Map()
const errors = []
const diagnostics = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === "Page.loadEventFired" && loadResolve) { loadResolve(); loadResolve = null }
  if (message.method === 'Network.loadingFailed' || message.method === 'Runtime.consoleAPICalled') diagnostics.push(message)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description ?? ''))
  const pair = pending.get(message.id)
  if (pair) { pending.delete(message.id); message.error ? pair.reject(message.error) : pair.resolve(message.result) }
})
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) }) }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value
}
async function navigate(url) {
  const loaded = new Promise(resolve => { loadResolve = resolve })
  const result = await send(url ? 'Page.navigate' : 'Page.reload', url ? { url } : {})
  if (result.errorText) throw new Error(result.errorText)
  await loaded
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function wait(expression, label) { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}

const owner='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333'
const outDir=resolve('.tmp/theme-package-tests')
await mkdir(outDir,{recursive:true})
for(const name of await readdir(outDir))if(name.endsWith('.blankytheme') || name.endsWith('.zip') || name === 'Flower-Package.json')await import('node:fs/promises').then(fs=>fs.unlink(join(outDir,name)))
const assetPath=join(outDir,'flower.svg')
await writeFile(assetPath,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#ffc6d8"/><circle cx="24" cy="24" r="12" fill="#ff9bb7"/></svg>')
const checks=[]
async function upload(label,file){const doc=await send('DOM.getDocument');const found=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[aria-label='+q(label)+']'});assert.ok(found.nodeId,label);await send('DOM.setFileInputFiles',{nodeId:found.nodeId,files:[file]})}
async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(outDir,name+'.png'),Buffer.from(result.data,'base64'))}
const active=()=>evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")||"{}").active')
const css='[data-theme-slot="schedule-card"] { border-radius: 24px; backdrop-filter: blur(4px); }\n[data-theme-slot="sidebar"] { background-image: url("asset://sidebar"); }'
try {
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin === '+q(base)+' && !localStorage.getItem("blanky.theme.test.seeded")){localStorage.setItem("blanky.accounts.v1",JSON.stringify([{id:'+q(owner)+',name:"Theme Test",nickname:"테마 테스트",email:"theme-test@example.test",password:"test-only",avatar:null},{id:'+q(bob)+',name:"Bob",nickname:"Bob",email:"theme-bob@example.test",password:"test-only",avatar:null}]));localStorage.setItem("blanky.session.v1",'+q(owner)+');localStorage.setItem("blanky.library.'+owner+'",JSON.stringify({items:[{id:"theme-event",kind:"event",title:"패키지 테스트 일정",description:"",date:"2026-10-08",startTime:"10:00",endTime:"11:00",status:"todo",priority:"normal",categoryId:null,allDay:false,repeatRule:"none",createdAt:"2026-10-08T00:00:00Z",updatedAt:"2026-10-08T00:00:00Z"}],categories:[],settings:{},diaries:[]}));localStorage.setItem("blanky.theme.test.seeded","1");}'})
 await navigate(base+'/settings/themes');await wait('document.querySelectorAll("article").length>=4','legacy themes')
 await evaluate('[...document.querySelectorAll("article")].find(a=>a.textContent.includes("Soft Pink")).parentElement.querySelector("button").click()')
 await wait('document.querySelector(".blanky-themed")?.style.getPropertyValue("--bg")==="#fff8fb"','legacy apply')
 const previous=await active();assert.ok(previous);checks.push('Legacy Soft Pink applies and persists')
 await navigate(base+'/customize/theme');await wait('!!document.querySelector(".theme-editor")','editor')
 await fill('input[maxlength="100"]','Flower Package')
 await evaluate('document.querySelector(".color-choice").open=true');
 await fill('[aria-label="배경 HEX"]','#e4edf9');
 await wait('document.querySelector(".theme-preview").style.getPropertyValue("--bg")==="#e4edf9"','HEX live preview');
 assert.equal(await active(),previous);
 await screenshot('editor-colors');
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:outDir});
 await button('테마 파일로 내보내기');
 for(let i=0;i<80;i++){if((await readdir(outDir)).includes('Flower-Package.blankytheme'))break;await pause(100)}
 assert.ok((await readdir(outDir)).includes('Flower-Package.blankytheme'),'actual .blankytheme download');
 await button('캘린더');
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-preview [data-theme-slot=task-card]")).display'),'none');
 await button('전체');
 await button('취소');
 assert.equal(await evaluate('document.querySelector(".theme-preview").style.getPropertyValue("--bg")'),'#ffffff');
 checks.push('Circular HEX picker, preview screen switching and cancel preserve active theme');
 await button('테마 가져오기');
 await upload('테마 가져오기',join(outDir,'Flower-Package.blankytheme'));
 await wait('!!document.querySelector(".theme-import-review")','package review');
 await wait('document.querySelector(".theme-preview").style.getPropertyValue("--bg")==="#e4edf9"','JSON right preview');
 assert.equal(await active(),previous);
 await click('.theme-import-review .btn-line');
 assert.equal(await evaluate('document.querySelector(".theme-preview").style.getPropertyValue("--bg")'),'#ffffff');
 checks.push('Color-only .blankytheme export and import show isolated right preview and cancel restores draft');
 await fill('input[maxlength="100"]','Flower Package');
 await button('이미지 꾸미기');
 for(const label of ['전체 배경 업로드','사이드바 배경 업로드','캘린더 배경 업로드','일정 카드 배경 업로드','체크박스 SVG 업로드','home 아이콘 업로드']){await upload(label,assetPath);await pause(100)}
 const png = await evaluate('(()=>{const canvas=document.createElement("canvas");canvas.width=120;canvas.height=120;const context=canvas.getContext("2d");context.fillStyle="#b8c9ef";context.beginPath();context.arc(60,60,40,0,Math.PI*2);context.fill();return canvas.toDataURL("image/png").split(",")[1]})()');
 const characterPath=join(outDir,'character.png');await writeFile(characterPath,Buffer.from(png,'base64'));
 await upload('캐릭터 장식 업로드',characterPath);
 await pause(150);
 await fill('[aria-label="캐릭터 장식 opacity"]','65');
 await wait('getComputedStyle(document.querySelector(".theme-preview"),"::after").opacity==="0.65"','character opacity');
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-preview"),"::after").pointerEvents'),'none');
 await screenshot('editor-images');
 await button('고급 편집');await fill('[aria-label="고급 CSS"]',css)
 await wait('getComputedStyle(document.querySelector(".theme-preview [data-theme-slot=schedule-card]")).borderRadius==="24px"','live stylesheet')
 assert.match(await evaluate('getComputedStyle(document.querySelector(".theme-preview [data-theme-slot=sidebar]")).backgroundImage'),/blob:/)
 assert.equal(await evaluate('document.querySelectorAll(".theme-preview img").length'),1)
 assert.equal(await active(),previous)
 checks.push('Live image, SVG icon, checkbox and Custom CSS preview without changing active theme')
 await screenshot('editor-package')
 await fill('[aria-label="고급 CSS"]','[data-theme-slot="app"]{position:fixed}')
 await button('저장');await wait('document.body.innerText.includes("허용되지 않은 CSS")','unsafe CSS error')
 assert.equal(await active(),previous)
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")).themes.some(t=>t.name==="Flower Package")'),false)
 checks.push('Unsafe CSS blocks save and preserves active theme')
 await fill('[aria-label="고급 CSS"]',css);await button('저장')
 await wait('[...document.querySelectorAll("[role=status]")].some(p=>p.textContent==="완료했습니다.")','save package')
 const themeId=await evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")).themes.find(t=>t.name==="Flower Package").id')
 assert.equal(await active(),previous)
 assert.deepEqual(await evaluate('Object.keys(JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")).themes.find(t=>t.id==='+q(themeId)+').package.files)'),[])
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")).themes.find(t=>t.id==='+q(themeId)+').package.manifest.imageSettings.character.opacity'),65);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await button('색상 테마');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
 await screenshot('mobile-editor');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 checks.push('Save persists PNG assets and placement separately in IndexedDB; mobile editor has no horizontal overflow')
 await button('저장하고 적용하기');await wait('JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")).active==='+q(themeId),'apply package')
 await navigate(base+'/schedule');await wait('document.querySelector("aside img")?.getAttribute("src")?.startsWith("blob:")','active icon')
 assert.match(await evaluate('getComputedStyle(document.querySelector("[data-theme-scope]")).backgroundImage'),/blob:/)
 assert.match(await evaluate('getComputedStyle(document.querySelector("[data-theme-slot=calendar]")).backgroundImage'),/blob:/)
 await wait('getComputedStyle(document.querySelector("[data-theme-scope]"),"::after").opacity==="0.65"','persisted transparent PNG character');
 await screenshot('schedule-package');checks.push('Package applies to real schedule, sidebar, calendar and icons after refresh')
 await navigate(base+'/store/themes/00000000-0000-4000-8000-000000000004')
 await wait('[...document.querySelectorAll("button")].some(b=>b.textContent==="내 일정으로 미리보기")','detail')
 await button('내 일정으로 미리보기');await wait('!!document.querySelector(".theme-preview-bar")','preview banner')
 await wait('document.querySelector(".blanky-themed")?.style.getPropertyValue("--bg")==="#141414"','Dark preview')
 assert.equal(await active(),themeId)
 await button('미리보기 종료');await wait('!document.querySelector(".theme-preview-bar")','preview ended')
 await wait('document.querySelector("aside img")?.src.startsWith("blob:")','package restored')
 assert.equal(await active(),themeId);checks.push('Temporary preview restores original package assets, icons and active theme')
 // Exercise real download button, then feed the downloaded .blankytheme to a second isolated account.
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:outDir})
 await navigate(base+'/customize/theme?id='+themeId);await wait('!!document.querySelector(".theme-editor")','saved editor')
 await button('테마 파일로 내보내기')
 let exported
 for(let i=0;i<80;i++){exported=(await readdir(outDir)).find(n=>n.endsWith('.blankytheme'));if(exported)break;await pause(100)}
 assert.ok(exported,'actual .blankytheme download');checks.push('Creator export downloads the .blankytheme extension')
 await evaluate('localStorage.setItem("blanky.session.v1",'+q(bob)+')')
 await navigate(base+'/settings/themes');await wait('document.querySelectorAll("article").length>=4','Bob themes')
 await upload('테마 가져오기',join(outDir,exported))
 await wait('!!document.querySelector(".theme-import-review")','validated install review')
 assert.match(await evaluate('document.querySelector(".theme-import-review").innerText'),/Flower Package/)
 await wait('getComputedStyle(document.querySelector(".theme-import-review [data-theme-slot=schedule-card]")).borderRadius==="24px"','import preview same stylesheet')
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+bob+'")||"{}").active??null'),null)
 await screenshot('import-review');await button('설치')
 await wait('!document.querySelector(".theme-import-review")','import installed')
 await evaluate('[...document.querySelectorAll("article")].find(a=>a.textContent.includes("Flower Package")).parentElement.querySelector("button").click()')
 await wait('!!JSON.parse(localStorage.getItem("blanky.themes.'+bob+'")).active','Bob applies')
 const bobTheme=await evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+bob+'")).active')
 await navigate(base+'/schedule');await wait('document.querySelector("aside img")?.src.startsWith("blob:")','Bob icon roundtrip')
 assert.match(await evaluate('getComputedStyle(document.querySelector("[data-theme-scope]")).backgroundImage'),/blob:/)
 checks.push('Second account imports, previews, installs and applies identical package without store')
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true})
 await navigate(base+'/settings/themes');await wait('document.querySelectorAll("article").length>=4','mobile library')
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true)
 await screenshot('mobile-library');checks.push('Package library renders on mobile without horizontal overflow')
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false})
 await evaluate('[...[...document.querySelectorAll("article")].find(a=>a.textContent.includes("Flower Package")).parentElement.querySelectorAll("button")].find(b=>b.textContent==="삭제").click()')
 await wait('!!document.querySelector("dialog[open]")','delete confirm');await evaluate('[...document.querySelector("dialog[open]").querySelectorAll("button")].find(b=>b.textContent==="삭제").click()')
 await wait('!JSON.parse(localStorage.getItem("blanky.themes.'+bob+'")).themes.some(t=>t.id==='+q(bobTheme)+')','delete imported')
 assert.equal(await evaluate('JSON.parse(localStorage.getItem("blanky.themes.'+owner+'")).themes.some(t=>t.id==='+q(themeId)+')'),true)
 await wait('(async()=>(await import("/src/theme/package/ThemeAssetResolver.ts")).themeAssetCacheSize()===0)()','Object URL cleanup')
 checks.push('Deleting imported copy releases Object URLs and preserves original creator package')
 await evaluate('localStorage.setItem("blanky.session.v1",'+q(owner)+')');await navigate(base+'/schedule');await wait('document.querySelector("aside img")?.src.startsWith("blob:")','owner restored')
 await evaluate('(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open("blanky-theme-packages",1);q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const tx=db.transaction("packages","readwrite");const store=tx.objectStore("packages");const q=store.get('+q(owner+':')+'+'+q(themeId)+');q.onsuccess=()=>{const p=q.result;delete p.files[p.manifest.assets.background];store.put(p,'+q(owner+':')+'+'+q(themeId)+')};await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()})()')
 await navigate();await wait('document.body.innerText.includes("기본 테마로 복구했습니다")','damaged package fallback')
 assert.equal(await evaluate('document.querySelector(".blanky-themed").style.getPropertyValue("--bg")'),'#ffffff')
 assert.equal(await evaluate('document.querySelectorAll("aside img").length'),0)
 assert.equal(await evaluate('!!document.querySelector("nav")'),true)
 checks.push('Missing asset falls back to Default Theme with a recovery notice and functional navigation')
 await screenshot('corrupt-package-fallback')
 assert.equal(errors.length,0,errors.join('\n'))
 console.log(JSON.stringify({passed:checks,browserErrors:errors},null,2))
 await writeFile(join(outDir,'results.json'),JSON.stringify({passed:checks,browserErrors:errors},null,2))
} catch(error){console.error(await evaluate('JSON.stringify({text:document.body.innerText,url:location.href})'));console.error(errors);console.error(serverOutput);throw error}
finally{ws.close();server.kill();const stopped=new Promise(r=>browser.once('exit',r));browser.kill();await stopped;if(resolve(profile).startsWith(resolve(tmpdir())+'\\')&&profile.includes('blanky-theme-test-'))await rm(profile,{recursive:true,force:true}).catch(()=>undefined)}
