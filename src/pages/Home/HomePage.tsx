import { usePlannerDraftSync } from '../../features/ai/usePlannerDraftSync.ts'
import { usePlannerConflicts } from '../../features/ai/usePlannerConflicts.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ENTRY_OPTIONS, type EntryType } from '../../types/records.ts'
import type { WorkItem } from '../../types/work.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { conversationIntent } from '../../features/ai/conversation.ts'
import { analyzeSchedules } from '../../services/schedule/index.ts'
import { AnalysisReview } from '../../components/schedule/AnalysisReview.tsx'
import { validatePlanningRecommendation, type PlanningRecommendation, type PlannerDraft, type ScheduleAnalysis } from '@blanky/types'
import { PlannerPreview } from '../../components/schedule/PlannerPreview.tsx'
import { processAiInput, approvePlanner, getPlannerSchedules, routeInput, replanRemaining } from '../../services/ai/index.ts'
import type { BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { useSession } from '../../state/useSession.ts'
import { createWorkItem, occursOn } from '../../utils/work.ts'
import { todayISO } from '../../utils/date.ts'
import { WorkCard } from '../../components/schedule/WorkCard.tsx'
import { captureIntent, shouldSaveAnalysisAsMemo } from '../../utils/captureIntent.ts'
type RecordType = 'diary' | 'memo' | 'reading'
const RECORD_LABELS = { diary: '일기', memo: '메모', reading: '독서 기록' }
type Message = { id:string; role:'user'|'assistant'; text:string; items?:WorkItem[]; before?:WorkItem }
export function HomePage() {
  const library=useLibrary()
  const {user}=useSession(),plannerKey='blanky.planner.'+(user?.id??'anonymous')
  const [text,setText]=useState(''),[type,setType]=useState<EntryType>('auto'),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false)
  const saveRecord = (input:string, recordType:RecordType) => {
    const error=library.saveCapture(input,recordType)
    if(error) throw new Error(error)
    setMessages(current=>[...current,{id:crypto.randomUUID(),role:'assistant',text:RECORD_LABELS[recordType]+'로 저장했어요.'}])
  }
  const {conflicts,setConflicts,error:conflictError,setError:setConflictError}=usePlannerConflicts(library.items)
  const locked=useRef(false),lastId=useRef<string|null>(null)
  const [analysis, setAnalysis] = useState<{ id: string; result: ScheduleAnalysis; input: string } | null>(null)
  const [planner,setPlanner]=useState<{input:string;plan:PlanningRecommendation;existing:BusySchedule[];initialDraft?:Pick<PlannerDraft,'edits'|'saved'>;resumeId?:string}|null>(()=>{
    try{const value=JSON.parse(sessionStorage.getItem(plannerKey)??'null');if(!value||typeof value.input!=='string')return null;validatePlanningRecommendation(value.plan);return value}catch{return null}
  })
  useEffect(()=>{try{if(planner)sessionStorage.setItem(plannerKey,JSON.stringify(planner));else sessionStorage.removeItem(plannerKey)}catch{/* storage full does not discard the visible draft */}},[planner,plannerKey])
  const cloud=usePlannerDraftSync(),autoRestore=useRef(!planner)
  const [syncError,setSyncError]=useState('')
  const plannerInput=planner?.input
  const restoreCloud=useCallback(async()=>{
    if(!cloud.state.remote)throw new Error('서버 초안을 조회하지 못했어요. 이 기기의 수정 내용은 유지됩니다.')
    const draft=cloud.state.remote.draft
    if(!draft){cloud.sync.acceptRemote();setText(current=>current||plannerInput||'');setPlanner(null);return}
    const existing=await getPlannerSchedules(draft.plan.result.settings.startDate,draft.plan.result.settings.endDate)
    cloud.sync.acceptRemote();setPlanner({input:draft.input,plan:draft.plan,existing,initialDraft:{edits:draft.edits,saved:draft.saved},resumeId:crypto.randomUUID()});setSyncError('')
  },[cloud.state.remote,cloud.sync,plannerInput])
  useEffect(()=>{if(cloud.state.ready&&cloud.state.remote?.draft&&autoRestore.current&&!planner){autoRestore.current=false;void restoreCloud().catch(error=>setSyncError(error instanceof Error?error.message:'초안을 불러오지 못했어요.'))}},[cloud.state.ready,cloud.state.remote,planner,restoreCloud])
  const queueDraft=cloud.queue
  const draftChanged=useCallback((draft:PlannerDraft)=>{
    queueDraft(draft)
    setPlanner(current=>current&&current.plan.approval?.token===draft.plan.approval?.token&&JSON.stringify(current.initialDraft)!==JSON.stringify({edits:draft.edits,saved:draft.saved})?{...current,initialDraft:{edits:draft.edits,saved:draft.saved}}:current)
  },[queueDraft])
  const generatePlanner=async(input:string)=>{
    const routed=await processAiInput({text:input})
    if(routed.intent==='ANALYZE_SCHEDULE')throw new Error('계획 요청을 확인해 주세요.')
    if(routed.intent==='RESCHEDULE'&&!routed.recommendation){setConflicts([]);throw new Error('충돌한 AI 일정이 없어요. 기존 일정은 유지됩니다.')}
    if(!routed.recommendation?.approval)throw new Error('승인 가능한 추천을 받지 못했어요. 다시 요청해 주세요.')
    const plan=routed.recommendation,existing=await getPlannerSchedules(plan.result.settings.startDate,plan.result.settings.endDate)
    autoRestore.current=false;setPlanner({input,plan,existing});setAnalysis(null)
  }
  const send=async()=>{
    if(!text.trim() || locked.current) return
    locked.current=true;setBusy(true)
    const input=text.trim();setText('')
    const append=(message:Omit<Message,'id'>)=>setMessages(current=>[...current,{...message,id:crypto.randomUUID()}])
    append({role:'user',text:input})
    let fallbackToMemo=type==='auto'
    try {
      if(type==='auto') {
        const classified=captureIntent(input)
        if(classified.type==='diary'||classified.type==='memo'||classified.type==='reading') {
          fallbackToMemo=false
          saveRecord(input,classified.type)
          return
        }
      }
      if(type!=='auto' && type!=='schedule' && type!=='task') { const error=library.saveCapture(input,type);append({role:'assistant',text:error ?? '기록을 저장했습니다.'});return }
      if(['planner','reschedule'].includes(routeInput(input).route)){await generatePlanner(input);append({role:'assistant',text:'계획을 추천했어요. 확인·수정한 뒤 적용해 주세요. 아직 저장하지 않았어요.'});return}
      const intent=conversationIntent(input,library.items,lastId.current,new Date(),library.categories)
      if(intent.type==='reply') {
        if(type==='auto') {fallbackToMemo=false;saveRecord(input,'memo')}
        else append({role:'assistant',text:intent.text})
      }
      else if(intent.type==='list') {const date=intent.date || todayISO(),items=library.items.filter(item=>occursOn(item,date));append({role:'assistant',text:date+' · '+items.length+'개 항목이 있어요.',items})}
      else if(intent.type==='create') {
        const result = await analyzeSchedules(intent.text, library.categories, new Date())
        if(type==='auto' && shouldSaveAnalysisAsMemo(result.items)) {
          fallbackToMemo=false;saveRecord(input,'memo');return
        }
        if(!result.items.length) {
          if(type!=='auto') throw new Error('일정을 찾지 못했어요. 입력 내용을 확인해 주세요.')
          fallbackToMemo=false;saveRecord(input,'memo');return
        }
        setAnalysis({ id: crypto.randomUUID(), result, input })
        append({role:'assistant',text:result.items.length+'개 항목을 분석했어요. 아래에서 확인한 후 저장해 주세요.'})
      }
      else {
        const before=intent.item,item={...before,...intent.patch}
        fallbackToMemo=false
        const saved=await library.commitWork(before,item,'ai_chat');if(!saved) throw new Error('저장 실패')
        lastId.current=saved.id;append({role:'assistant',text:saved.title+' '+(saved.kind==='task'?'할 일을':'일정을')+' '+(before?'변경':'추가')+'했습니다.',items:[saved],before:before ?? undefined})
      }
    } catch(error) {
      let failure=error
      if(fallbackToMemo) {
        try {saveRecord(input,'memo');return} catch(saveError) {failure=saveError}
      }
      setText(current=>current||input);append({role:'assistant',text:failure instanceof Error ? failure.message : '저장하지 못했어요. 다시 시도해 주세요.'})
    }
    finally {locked.current=false;setBusy(false)}
  }
  return <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12"><div className="mb-5 flex items-center justify-between"><p className="text-sm text-neutral-400">Blanky · 일상과 일정, 아이디어를 자유롭게 남겨 주세요</p><Link className="text-xs text-neutral-400" to="/activity">Activity ↗</Link></div>
    <div className="composer"><label className="sr-only" htmlFor="home-entry">기록 입력</label><textarea data-theme-slot="input" id="home-entry" rows={3} value={text} placeholder="오늘 친구랑 만나서 즐거웠다 / 내일 오후 3시 회의 / 블로그 아이디어" className="w-full resize-none bg-transparent leading-relaxed outline-none" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setText('');if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
      <div className="mt-3 flex justify-between gap-2 border-t border-line pt-2"><div className="flex flex-wrap gap-1">{[{id:'auto' as EntryType,label:'자동 분류'},...ENTRY_OPTIONS].map(option=><button data-theme-slot="button" key={option.id} className={type===option.id?'chip chip-on':'chip'} onClick={()=>setType(option.id)} aria-pressed={type===option.id}>{option.label}</button>)}</div><button data-theme-slot="button-primary" disabled={busy||!text.trim()} className="icon-btn-primary" aria-label="보내기" onClick={()=>void send()}><ArrowUp className="size-4"/></button></div></div>
    <p className="mt-3 text-xs text-neutral-400">Enter 보내기 · Shift + Enter 줄바꿈</p>
    {(conflicts.length>0||conflictError)&&<div className="mt-5 rounded-lg border border-line p-3"><p className="text-sm text-blue-600">{conflictError||('AI 일정 '+conflicts.length+'개가 다른 일정과 겹쳐요.')}</p>{conflicts.map(row=><p className="mt-1 text-xs text-neutral-500" key={row.id}>{row.date} · {row.title}</p>)}{conflicts.length>0&&<button type="button" disabled={busy} className="btn btn-ghost mt-2 text-blue-600" onClick={()=>{setText('충돌한 AI 일정 재배치해줘');void generatePlanner('충돌한 AI 일정 재배치해줘').catch(error=>setConflictError(error instanceof Error?error.message:'충돌을 확인하지 못했어요.'))}}>재배치 추천 보기</button>}</div>}
    <Link to="/settings/planning" className="mt-3 text-xs text-blue-600">작업 시간 · 개인화 설정</Link>
    {cloud.enabled&&<div className="mt-4 space-y-2 text-xs text-neutral-500" aria-label="초안 동기화" data-sync-ready={cloud.state.ready}><p role="status" data-planner-sync>{syncError||cloud.state.message||'로그인한 기기 사이에서 초안을 이어서 수정할 수 있어요.'}</p>{(cloud.state.conflict||!planner&&cloud.state.remote?.draft)&&<div className="flex flex-wrap gap-2"><button type="button" className="btn btn-ghost text-blue-600" disabled={cloud.state.busy} onClick={()=>void restoreCloud().catch(error=>setSyncError(error instanceof Error?error.message:'초안을 불러오지 못했어요.'))}>다른 기기 초안 불러오기</button>{planner&&<button type="button" className="btn btn-ghost" disabled={cloud.state.busy} onClick={()=>void cloud.sync.keepLocal()}>이 기기의 초안으로 저장</button>}{!planner&&<button type="button" className="btn btn-ghost" disabled={cloud.state.busy} onClick={()=>{cloud.sync.acceptRemote();void cloud.sync.clear()}}>서버 초안 닫기</button>}</div>}{/못|실패|만료|연결/.test(cloud.state.message)&&<button type="button" className="text-blue-600" onClick={()=>void cloud.sync.refresh().then(()=>cloud.sync.flush())}>초안 동기화 다시 시도</button>}</div>}
    {planner&&<PlannerPreview key={(planner.plan.approval?.token.slice(-16)??planner.input)+(planner.resumeId??'')} initialDraft={planner.initialDraft} onDraftChange={draftChanged} input={planner.input} plan={planner.plan} existing={planner.existing} onCancel={()=>{autoRestore.current=false;setText(planner.input);setPlanner(null);if(cloud.enabled)void cloud.sync.clear()}} onRegenerate={()=>generatePlanner(planner.input)} onRemaining={planner.plan.mode==='reschedule'?undefined:async edits=>{const result=await replanRemaining(planner.plan.approval!.token,edits);if(!result.recommendation)throw new Error('남은 작업이 없어요.');const plan=result.recommendation,existing=await getPlannerSchedules(plan.result.settings.startDate,plan.result.settings.endDate);setPlanner({input:planner.input,plan,existing})}} onApply={async blocks=>{
      const result=await approvePlanner({token:planner.plan.approval!.token,blocks})
      library.adoptPlannerSchedules(result.schedules)
      void library.refreshWork().catch(()=>setMessages(current=>[...current,{id:crypto.randomUUID(),role:'assistant',text:'일정은 저장되었어요. 변경 이력 동기화는 새로고침 후 확인해 주세요.'}]))
      void getPlannerSchedules(planner.plan.result.settings.startDate,planner.plan.result.settings.endDate).then(existing=>setPlanner(current=>current?{...current,existing}:current)).catch(()=>undefined)
      return result
    }}/>}
    {analysis && <AnalysisReview key={analysis.id} analysis={analysis.result} originalText={analysis.input} preferredKind={type === 'task' ? 'task' : type === 'schedule' ? 'event' : undefined} categories={library.categories} onClose={() => setAnalysis(null)} onSave={async input => {
      const item = createWorkItem(input, { inferEndTime: false })
      if (!item) return null
      const saved = await library.commitWork(null, item, 'ai_chat')
      if (saved) {
        lastId.current = saved.id
        setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', text: saved.title+' 저장했습니다.', items: [saved] }])
      }
      return saved
    }}/>}
    <div className="mt-8 space-y-6" aria-live="polite" aria-busy={busy}>{messages.map(message=><div key={message.id}><p className="mb-2 text-xs text-neutral-400">{message.role==='user'?'나':'Blanky'}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p><div className="mt-3 space-y-2">{message.items?.map(item=><WorkCard key={item.id} snapshot={item} before={message.before}/>)}</div></div>)}{busy && <p role="status" className="text-sm text-neutral-400">처리하고 있어요…</p>}</div>
  </div>
}
