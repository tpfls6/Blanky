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
const server = spawn(process.execPath, ['--input-type=module', '-e', 'import { createServer } from "vite"; const server = await createServer({ server: { host: "127.0.0.1", port: ' + new URL(base).port + ', strictPort: true, watch: null } }); await server.listen(); server.printUrls();'], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }, windowsHide: true, stdio: 'pipe' })
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
async function wait(expression, label) { for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await pause(100) } throw new Error('Timed out: ' + label) }
const q = value => JSON.stringify(value)
async function click(selector) { await evaluate('document.querySelector(' + q(selector) + ').click()') }
async function button(text) { await evaluate('[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ' + q(text) + ').click()') }
async function fill(selector, value) {
  await evaluate('(()=>{const el=document.querySelector(' + q(selector) + '); const proto=el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,"value").set.call(el,' + q(value) + '); el.dispatchEvent(new Event("input",{bubbles:true}));})()')
}

const owner='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333'
const outDir=resolve('.tmp/theme-preview-layout')
await mkdir(outDir,{recursive:true})
const checks=[];
async function screenshot(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(outDir,name+'.png'),Buffer.from(result.data,'base64'))}
try {
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin === '+q(base)+' && !localStorage.getItem("blanky.theme.test.seeded")){localStorage.setItem("blanky.accounts.v1",JSON.stringify([{id:'+q(owner)+',name:"Theme Test",nickname:"테마 테스트",email:"theme-test@example.test",password:"test-only",avatar:null},{id:'+q(bob)+',name:"Bob",nickname:"Bob",email:"theme-bob@example.test",password:"test-only",avatar:null}]));localStorage.setItem("blanky.session.v1",'+q(owner)+');localStorage.setItem("blanky.library.'+owner+'",JSON.stringify({items:[{id:"theme-event",kind:"event",title:"패키지 테스트 일정",description:"",date:"2026-10-08",startTime:"10:00",endTime:"11:00",status:"todo",priority:"normal",categoryId:null,allDay:false,repeatRule:"none",createdAt:"2026-10-08T00:00:00Z",updatedAt:"2026-10-08T00:00:00Z"}],categories:[],settings:{},diaries:[]}));localStorage.setItem("blanky.theme.test.seeded","1");}'})

 await navigate(base+'/store');await wait('document.querySelectorAll(".theme-grid article").length>=4','store');
 const ids=await evaluate('[...document.querySelectorAll(".theme-grid article a:first-child")].map(a=>a.getAttribute("href"))');
 for(const width of [1440,768,390]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
 for(const [i,path] of ids.entries()) {
 await navigate(base+path);await wait('!!document.querySelector(".theme-preview, .theme-preview-frame")','detail');await pause(700);
 const metrics=await evaluate(`(()=>{const frame=document.querySelector('iframe.theme-preview-frame');const doc=frame?.contentDocument??document;const side=doc.querySelector('.theme-preview-sidebar');const page=doc.querySelector('.theme-preview-page');const a=side?.getBoundingClientRect(),b=page?.getBoundingClientRect();return {outerOverflow:document.documentElement.scrollWidth>innerWidth,overlap:a&&b&&getComputedStyle(side).display!=='none'&&a.right>b.left+1,innerOverflow:doc.documentElement.scrollWidth>(frame?.clientWidth??innerWidth)}})()`);
 checks.push({width,theme:i,...metrics});
 if(i===0)await screenshot((process.env.PREVIEW_PHASE??'after')+'-'+width);
 }
 }
 if(process.env.PREVIEW_PHASE!=='before') {
 const packageId=await evaluate(`(async()=>{
 const {BUILTIN_THEMES}=await import('/packages/types/src/theme.ts');
 const {packageFromTheme,exportThemePackage,importThemePackage}=await import('/src/theme/package/ThemeLoader.ts');
 const {validateAsset}=await import('/src/theme/package/ThemeValidator.ts');
 const api=await import('/src/services/themes/index.ts');
 const p=packageFromTheme(BUILTIN_THEMES[1]);p.manifest.id='preview-layout-package';p.manifest.name='LongThemeName'.repeat(6);p.manifest.author='LongCreatorName'.repeat(4);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60"><rect width="240" height="60" fill="#ff9bb7"/></svg>';
 p.manifest.assets={sidebar:'assets/wide.svg',pageHeader:'assets/wide.svg'};
 p.files={'assets/wide.svg':validateAsset('assets/wide.svg',new TextEncoder().encode(svg))};
 p.customCss='[data-theme-slot="card"] { border-radius: 23px; } [data-theme-slot="sidebar"] { color: #772244; }';
 const imported=await importThemePackage(await exportThemePackage(p));
 const t={...BUILTIN_THEMES[1],id:p.manifest.id,creatorId:'${owner}',name:p.manifest.name,creatorName:p.manifest.author,visibility:'public',package:imported,thumbnailUrl:null};
 await api.saveTheme('${owner}',t);await api.installTheme('${owner}',t);await api.setActiveTheme('${owner}',BUILTIN_THEMES[2].id);return t.id;
 })()`);
 for(const width of [1440,768,390]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
 await navigate(base+'/store');await wait('document.body.innerText.includes("LongThemeName")','long store name');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 await navigate(base+'/store/themes/'+packageId);await wait('!!document.querySelector("iframe")?.contentDocument?.querySelector(".theme-preview-page > *")','package preview');
 await wait('!!document.querySelector("iframe").contentDocument.querySelector(".theme-preview style")','package styles');
 const outside=await evaluate('getComputedStyle(document.querySelector(".theme-page h1")).color');
 for(const tab of ['홈','일정','일기','독서','메모']) {
 await evaluate('[...document.querySelectorAll(".theme-preview-tabs button")].find(b=>b.textContent==='+q(tab)+').click()');await pause(300);
 const result=await evaluate(`(()=>{const d=document.querySelector('iframe').contentDocument;return {outer:document.documentElement.scrollWidth<=innerWidth,inner:d.documentElement.scrollWidth<=d.documentElement.clientWidth,page:!!d.querySelector('.theme-preview-page > *')}})()`);
 assert.ok(result.outer&&result.inner&&result.page,JSON.stringify({width,tab,result}));
 }
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".theme-page h1")).color'),outside);
 await screenshot('package-'+width);
 }
 const persisted=await evaluate('localStorage.getItem("blanky.themes.'+owner+'")');
 const library=await evaluate('localStorage.getItem("blanky.library.'+owner+'")');
 const original=await evaluate('document.querySelector("[data-theme-scope]").style.cssText');
 await button('내 일정으로 미리보기');await wait('!!document.querySelector(".theme-preview-bar")','live preview');
 assert.equal(await evaluate('localStorage.getItem("blanky.themes.'+owner+'")'),persisted);
 await button('미리보기 종료');await wait('!document.querySelector(".theme-preview-bar")','preview exit');
 assert.equal(await evaluate('document.querySelector("[data-theme-scope]").style.cssText'),original);
 assert.equal(await evaluate('localStorage.getItem("blanky.library.'+owner+'")'),library);
 await evaluate(`(async()=>{const api=await import('/src/services/themes/index.ts');const t=(await api.loadThemes('${owner}')).themes.find(t=>t.id==='preview-layout-package');await api.removeTheme('${owner}',t)})()`);
 assert.ok(!errors.length,errors.join('\n'));
 console.log('PASS package isolation, 5 pages x 3 sizes, long names, export/import/install/delete, live preview restore and user data preservation');
 }
 await writeFile(join(outDir,(process.env.PREVIEW_PHASE??'after')+'.json'),JSON.stringify(checks,null,2));
 console.log(JSON.stringify(checks,null,2));
 if(process.env.PREVIEW_PHASE!=='before')assert.ok(checks.every(c=>!c.overlap&&!c.outerOverflow&&!c.innerOverflow));
} catch(error) {
 console.error(await evaluate('document.body.innerText'));
 console.error(serverOutput);
 throw error;
} finally {ws.close();server.kill();browser.kill()}
