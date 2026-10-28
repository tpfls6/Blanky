import { usePlannerDraftSync } from '../../features/ai/usePlannerDraftSync.ts'
import { usePlannerConflicts } from '../../features/ai/usePlannerConflicts.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ENTRY_OPTIONS, type EntryType } from '../../types/records.ts'
import type { WorkItem } from '../../types/work.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { conversationIntent, type ConversationPending } from '../../features/ai/conversation.ts'
import { describePlan, failedActionIds, liveActions, planConflicts, planDedupe, planMoveIncomplete, planSummarize, type AgentPlan } from '../../features/ai/agent.ts'
import { batchKeyFor, describeBatchApply } from '../../features/ai/batch.ts'
import { analyzeSchedules } from '../../services/schedule/index.ts'
import { AnalysisReview } from '../../components/schedule/AnalysisReview.tsx'
import { validatePlanningRecommendation, type PlanningRecommendation, type PlannerDraft, type ScheduleAnalysis } from '@blanky/types'
import { PlannerPreview } from '../../components/schedule/PlannerPreview.tsx'
import { processAiInput, approvePlanner, getPlannerSchedules, routeInput, replanRemaining } from '../../services/ai/index.ts'
import type { BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { useSession } from '../../state/useSession.ts'
import { createWorkItem, occursOn } from '../../utils/work.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { todayISO } from '../../utils/date.ts'
import { WorkCard } from '../../components/schedule/WorkCard.tsx'
import { captureIntent, shouldSaveAnalysisAsMemo } from '../../utils/captureIntent.ts'
type RecordType = 'diary' | 'memo' | 'reading'
type Message = { id:string; role:'user'|'assistant'; text:string; items?:WorkItem[]; before?:WorkItem; undoIds?:string[]; preview?:AgentPlan }
export function HomePage() {
  const { t } = useI18n()
  const library=useLibrary()
  const {user}=useSession(),plannerKey='blanky.planner.'+(user?.id??'anonymous')
  const [text,setText]=useState(''),[type,setType]=useState<EntryType>('auto'),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false)
  const saveRecord = (input:string, recordType:RecordType) => {
    const error=library.saveCapture(input,recordType)
    if(error) throw new Error(error)
    setMessages(current=>[...current,{id:crypto.randomUUID(),role:'assistant',text:t('home.savedAs', { type: t(`type.${recordType}`) })}])
  }
  const {conflicts,setConflicts,error:conflictError,setError:setConflictError}=usePlannerConflicts(library.items)
  const locked=useRef(false),lastId=useRef<string|null>(null),batchKeys=useRef(new Map<string,string>()),pending=useRef<ConversationPending>(null)
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
  const applyAgentPlan=async(plan:AgentPlan)=>{
    const actions=liveActions(plan,library.items)
    const deletes=actions.filter(action=>action.op==='delete')
    const updates=actions.filter(action=>action.op==='update')
    if(!actions.length){
      return {text:describeBatchApply({kind:plan.title.includes('중복')?'dedupe':'other',status:'empty',deletedCount:0,google:'idle'}),items:plan.kept,undoIds:[]}
    }
    if(deletes.length && !updates.length){
      try{
        const result=await library.applyWorkBatch({key:batchKeyFor(deletes.map(action=>action.item.id),batchKeys.current),deletes:deletes.map(action=>action.item),source:'ai_chat'})
        return {
          text:describeBatchApply({kind:plan.title.includes('중복')?'dedupe':'other',status:result.status,deletedCount:result.deletedIds.length,google:result.google}),
          items:[...plan.kept,...deletes.map(action=>action.item)],
          undoIds:result.deletedIds,
        }
      }catch{
        return {text:describeBatchApply({kind:'dedupe',status:'failed',deletedCount:0,google:'idle'}),items:plan.kept,undoIds:[]}
      }
    }
    const executed:WorkItem[]=[]
    const undoIds:string[]=[]
    const failed:string[]=[]
    for(const action of updates){
      try{
        const saved=await library.commitWork(action.item,{...action.item,...action.patch},'ai_chat')
        if(!saved) throw new Error('저장 실패')
        executed.push(saved)
      }catch{failed.push(action.item.id)}
    }
    const lines=[describePlan({...plan,mode:'auto',actions:failedActionIds(failed,plan.actions)})]
    if(failed.length)lines.push('일정 변경에 실패하여 기존 일정이 유지되었습니다.')
    return {text:lines.join('\n'),items:[...plan.kept,...executed],undoIds}
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
      if(['planner','reschedule'].includes(routeInput(input).route) && !pending.current){await generatePlanner(input);append({role:'assistant',text:'계획을 추천했어요. 확인·수정한 뒤 적용해 주세요. 아직 저장하지 않았어요.'});return}
      const intent=conversationIntent(input,library.items,lastId.current,new Date(),library.categories,pending.current)
      if(intent.type==='reply') {
        if(/지울지/.test(intent.text)) pending.current={kind:'clarify'}
        if(type==='auto' && !/(삭제|중복|겹치|지워|빼줘|남겨|남기|옮겨|delete|duplicate|overlap|remove)/i.test(input) && !pending.current) {fallbackToMemo=false;saveRecord(input,'memo')}
        else {fallbackToMemo=false;append({role:'assistant',text:intent.text})}
      }
      else if(intent.type==='list') {
        const date=intent.date || todayISO()
        const end=intent.endDate || date
        const items=library.items.filter(item=>{let day=date;while(day<=end){if(occursOn(item,day))return true;const next=new Date(`${day}T00:00:00`);next.setDate(next.getDate()+1);day=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;if(day===date)break}return false})
        append({role:'assistant',text:(intent.endDate?date+'~'+end:date)+' · '+items.length+'개 항목이 있어요.',items})
      }
      else if(intent.type==='create') {
        pending.current=null
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
      else if(intent.type==='delete') {
        fallbackToMemo=false
        await library.commitWork(intent.item,null,'ai_chat')
        lastId.current=null
        append({role:'assistant',text:intent.item.title+'을 휴지통으로 옮겼어요.',before:intent.item,undoIds:[intent.item.id]})
      }
      else if(intent.type==='dedupe'||intent.type==='conflicts'||intent.type==='summarize'||intent.type==='move_incomplete') {
        fallbackToMemo=false
        if(intent.type==='dedupe') pending.current={kind:'dedupe',start:intent.start,end:intent.end,titles:intent.titles,openEnd:intent.openEnd}
        const plan=intent.type==='dedupe'?planDedupe(library.items,{start:intent.start,end:intent.end,titles:intent.titles,openEnd:intent.openEnd}):intent.type==='conflicts'?planConflicts(library.items,intent.start,intent.end):intent.type==='summarize'?planSummarize(library.items,intent.start,intent.end):planMoveIncomplete(library.items,intent.from,intent.to)
        if(plan.mode==='preview'&&plan.actions.length) {
          append({role:'assistant',text:describePlan(plan),items:[...plan.kept,...plan.actions.map(action=>action.item)],preview:plan})
        } else {
          const result=await applyAgentPlan(plan)
          append({role:'assistant',text:result.text,items:result.items,undoIds:result.undoIds})
        }
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
  return <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-12"><div className="mb-5 flex items-center justify-between"><p className="text-sm text-neutral-400">Blanky · {t('home.tagline')}</p><Link className="text-xs text-neutral-400" to="/activity">{t('home.activityLink')}</Link></div>
    <div className="composer"><label className="sr-only" htmlFor="home-entry">{t('home.inputLabel')}</label><textarea data-theme-slot="input" id="home-entry" rows={3} value={text} placeholder={t('home.placeholder')} className="w-full resize-none bg-transparent leading-relaxed outline-none" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setText('');if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
      <div className="mt-3 flex justify-between gap-2 border-t border-line pt-2"><div className="flex flex-wrap gap-1">{[{id:'auto' as EntryType,label:t('type.auto')},...ENTRY_OPTIONS.map(option=>({...option,label:t(`type.${option.id}`)}))].map(option=><button data-theme-slot="button" key={option.id} className={type===option.id?'chip chip-on':'chip'} onClick={()=>setType(option.id)} aria-pressed={type===option.id}>{option.label}</button>)}</div><button data-theme-slot="button-primary" disabled={busy||!text.trim()} className="icon-btn-primary" aria-label={t('home.send')} onClick={()=>void send()}><ArrowUp className="size-4"/></button></div></div>
    <p className="mt-3 text-xs text-neutral-400">{t('home.enterHint')}</p>
    {(conflicts.length>0||conflictError)&&<div className="mt-5 rounded-lg border border-line p-3"><p className="text-sm text-blue-600">{conflictError||t('home.conflicts', { count: conflicts.length })}</p>{conflicts.map(row=><p className="mt-1 text-xs text-neutral-500" key={row.id}>{row.date} · {row.title}</p>)}{conflicts.length>0&&<button type="button" disabled={busy} className="btn btn-ghost mt-2 text-blue-600" onClick={()=>{setText(t('home.replanHint'));void generatePlanner(t('home.replanHint')).catch(error=>setConflictError(error instanceof Error?error.message:t('home.replanFailed')))}}>{t('home.replan')}</button>}</div>}
    <Link to="/settings/planning" className="mt-3 text-xs text-blue-600">{t('home.planningLink')}</Link>
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
    <div className="mt-8 space-y-6" aria-live="polite" aria-busy={busy}>{messages.map(message=><div key={message.id}><p className="mb-2 text-xs text-neutral-400">{message.role==='user'?t('me'):'Blanky'}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p><div className="mt-3 space-y-2">{message.items?.map(item=><WorkCard key={item.id} snapshot={item} before={message.before}/>)}</div>{message.preview&&<div className="mt-2 flex gap-2"><button type="button" className="btn btn-ghost text-blue-600" disabled={busy} onClick={()=>{if(locked.current)return;locked.current=true;setBusy(true);void applyAgentPlan(message.preview!).then(result=>setMessages(current=>current.map(row=>row.id===message.id?{...row,text:result.text,items:result.items,undoIds:result.undoIds,preview:undefined}:row))).finally(()=>{locked.current=false;setBusy(false)})}}>실행</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>{pending.current=null;setMessages(current=>current.map(row=>row.id===message.id?{...row,text:'실행하지 않았어요.',preview:undefined,items:undefined}:row))}}>취소</button></div>}{message.undoIds?.length?<button type="button" className="btn btn-ghost mt-2 text-blue-600" disabled={busy} onClick={()=>void Promise.all(message.undoIds!.map(id=>library.restoreTrash(id))).then(()=>setMessages(current=>current.map(row=>row.id===message.id?{...row,text:row.text+'\n되돌렸습니다.',undoIds:undefined}:row)))}>되돌리기</button>:null}</div>)}{busy && <p role="status" className="text-sm text-neutral-400">{t('home.working')}</p>}</div>
  </div>
}
