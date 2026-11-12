import { usePlannerDraftSync } from '../../features/ai/usePlannerDraftSync.ts'
import { usePlannerConflicts } from '../../features/ai/usePlannerConflicts.ts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, MessageSquare } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ENTRY_OPTIONS, type CaptureRef, type EntryType } from '../../types/records.ts'
import type { WorkItem } from '../../types/work.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { conversationIntent, type ConversationPending } from '../../features/ai/conversation.ts'
import { describePlan, failedActionIds, liveActions, planConflicts, planDedupe, planMoveIncomplete, planSummarize, type AgentPlan } from '../../features/ai/agent.ts'
import { batchKeyFor, describeBatchApply } from '../../features/ai/batch.ts'
import { analyzeSchedules } from '../../services/schedule/index.ts'
import { AnalysisReview } from '../../components/schedule/AnalysisReview.tsx'
import { validatePlanningRecommendation, type PlanningRecommendation, type PlannerDraft, type ScheduleAnalysis } from '@blanky/types'
import { PlannerPreview } from '../../components/schedule/PlannerPreview.tsx'
import { processAiInput, approvePlanner, getPlannerSchedules, replanRemaining, analyzeIntents } from '../../services/ai/index.ts'
import type { BusySchedule } from '../../../packages/scheduling/src/engine.ts'
import { useSession } from '../../state/useSession.ts'
import { createWorkItem, occursOn } from '../../utils/work.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { shiftISO, todayISO } from '../../utils/date.ts'
import { useToday } from '../../hooks/useToday.ts'
import { hasScheduleSignal, shouldSaveAnalysisAsMemo } from '../../utils/captureIntent.ts'
import { describeIntentPlan, describeIntentRun, planIntents, runIntentPlan, type IntentPlan } from '../../features/ai/intentPlan.ts'
import { commitSeriesChange, isRecurring } from '../../features/schedule/seriesEdit.ts'
import { needsIntentPlan } from '../../../packages/parse/src/intents.ts'
import { Onboarding } from '../../features/onboarding/Onboarding.tsx'
import { homeChatKey } from '../../state/storage.ts'
import { loadChat, saveChat, type ChatMessage } from '../../features/ai/homeChat.ts'
import { chipDetail, planAutoSave, reviewAnalysis, type AutoSaveInput } from '../../features/ai/autoSave.ts'
import { analyzeOnce } from '../../features/ai/analyzeOnce.ts'
import { routeUtterance } from '../../features/ai/routeUtterance.ts'
import type { IntentExtraction } from '../../../packages/parse/src/intents.ts'
import { ChatPanel } from '../../features/ai/ChatPanel.tsx'
import { WorkChip } from '../../components/schedule/WorkChip.tsx'
import { WorkEditDialog } from '../../components/schedule/WorkEditDialog.tsx'
import { dismissStatusToast, showStatusToast } from '../../components/layout/statusToast.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { ROUTES } from '../../constants/routes.ts'
import { settingsPath } from '../Settings/settingsNav.ts'
import { aiErrorText } from '../../features/ai/aiError.ts'
import './home.css'

type RecordType = 'diary' | 'memo' | 'reading'
type Message = ChatMessage
type Reply = Pick<Message, 'text' | 'status'>
/** A message belongs to the local calendar day it was written on. */
const isOnDay = (createdAt: string | undefined, day: string) => {
  const at = createdAt ? new Date(createdAt) : null
  if (!at || Number.isNaN(at.getTime())) return false
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` === day
}
type Translate = ReturnType<typeof useI18n>['t']
const savedText = (t: Translate, count: number, waiting: number) => [count ? t('home.savedCount', { count }) : '', waiting ? t('home.waitingCount', { count: waiting }) : ''].filter(Boolean).join(' ')
export function HomePage() {
  const { t } = useI18n()
  const library=useLibrary()
  const {user}=useSession(),plannerKey='blanky.planner.'+(user?.id??'anonymous'),chatKey=homeChatKey(user?.id??'anonymous')
  const [text,setText]=useState(''),[type,setType]=useState<EntryType>('auto'),[busy,setBusy]=useState(false)
  // History belongs to one account: switching users swaps the stored conversation before rendering.
  const [chat,setChat]=useState(()=>({key:chatKey,messages:loadChat(localStorage,chatKey)}))
  if(chat.key!==chatKey)setChat({key:chatKey,messages:loadChat(localStorage,chatKey)})
  const messages=chat.key===chatKey?chat.messages:[]
  // The panel shows today's conversation only; older messages stay in storage.
  const today=useToday(),todayMessages=messages.filter(row=>isOnDay(row.createdAt,today))
  const setMessages=useCallback((next:(current:Message[])=>Message[])=>setChat(current=>({...current,messages:next(current.messages)})),[])
  useEffect(()=>{saveChat(localStorage,chat.key,chat.messages)},[chat])
  const [panel,setPanel]=useState({open:false,focus:false})
  const [editing,setEditing]=useState<WorkItem|null>(null),[reviewing,setReviewing]=useState<{id:string;analysis:ScheduleAnalysis}|null>(null)
  // Phones keep typing after a send: results come as a toast and the history sheet opens only on request.
  const phone=useMediaQuery(PHONE_QUERY)
  const historyButton=useRef<HTMLButtonElement>(null),entry=useRef<HTMLTextAreaElement>(null)
  // Closing returns focus to whatever opened the panel: 기록, or the composer when the toast opened it.
  const openedFrom=useRef<'history'|'toast'>('history'),restoreTo=useRef<HTMLElement|null>(null)
  const openPanel=(from:'history'|'toast')=>{openedFrom.current=from;setPanel({open:true,focus:true})}
  const closePanel=useCallback((restoreFocus:boolean)=>{restoreTo.current=restoreFocus?(openedFrom.current==='toast'?entry.current:historyButton.current):null;setPanel({open:false,focus:false})},[])
  const patch=(id:string,next:Partial<Message>)=>setMessages(current=>current.map(row=>row.id===id?{...row,...next}:row))
  const lastReply=useRef<Reply|null>(null)
  const append=(message:Omit<Message,'id'|'createdAt'>)=>{const id=crypto.randomUUID();if(message.role==='assistant')lastReply.current=message;setMessages(current=>[...current,{...message,id,createdAt:new Date().toISOString()}]);return id}
  // Results land in the panel; while it is closed a one-line toast reports them instead, never both.
  const panelOpen=useRef(panel.open),notified=useRef(false)
  // Focus moves back once the sheet has released the page (inert is lifted in the panel's effect cleanup).
  useEffect(()=>{panelOpen.current=panel.open;if(panel.open)dismissStatusToast();else{restoreTo.current?.focus();restoreTo.current=null}},[panel.open])
  useEffect(()=>dismissStatusToast,[])
  // Results that need a look and failures stay up until acted on; plain saves fade out.
  const notify=(text:string,tone:'saved'|'failed',sticky=tone==='failed')=>{if(panelOpen.current)return;notified.current=true;showStatusToast({text,tone,sticky,action:{label:t('home.viewHistory'),run:()=>openPanel('toast')}})}
  const saveRecord = (input:string, recordType:RecordType) => {
    const result=library.saveCapture(input,recordType)
    if(result.error) throw new Error(result.error)
    const text=t('home.savedAs', { type: t(`type.${recordType}`) })
    append({role:'assistant',text,records:result.saved?[result.saved]:undefined});notify(text,'saved')
  }
  const {conflicts,setConflicts,error:conflictError,setError:setConflictError}=usePlannerConflicts(library.items)
  const locked=useRef(false),lastId=useRef<string|null>(null),batchKeys=useRef(new Map<string,string>()),pending=useRef<ConversationPending>(null)
  const [planner,setPlanner]=useState<{input:string;plan:PlanningRecommendation;existing:BusySchedule[];initialDraft?:Pick<PlannerDraft,'edits'|'saved'>;resumeId?:string}|null>(()=>{
    try{const value=JSON.parse(sessionStorage.getItem(plannerKey)??'null');if(!value||typeof value.input!=='string')return null;validatePlanningRecommendation(value.plan);return value}catch{return null}
  })
  useEffect(()=>{try{if(planner)sessionStorage.setItem(plannerKey,JSON.stringify(planner));else sessionStorage.removeItem(plannerKey)}catch{/* storage full does not discard the visible draft */}},[planner,plannerKey])
  const cloud=usePlannerDraftSync(),autoRestore=useRef(!planner)
  const [syncError,setSyncError]=useState('')
  const plannerInput=planner?.input
  const restoreCloud=useCallback(async()=>{
    if(!cloud.state.remote)throw new Error(t('home.draftLookupFailed'))
    const draft=cloud.state.remote.draft
    if(!draft){cloud.sync.acceptRemote();setText(current=>current||plannerInput||'');setPlanner(null);return}
    const existing=await getPlannerSchedules(draft.plan.result.settings.startDate,draft.plan.result.settings.endDate)
    cloud.sync.acceptRemote();setPlanner({input:draft.input,plan:draft.plan,existing,initialDraft:{edits:draft.edits,saved:draft.saved},resumeId:crypto.randomUUID()});setSyncError('')
  },[cloud.state.remote,cloud.sync,plannerInput,t])
  useEffect(()=>{if(cloud.state.ready&&cloud.state.remote?.draft&&autoRestore.current&&!planner){autoRestore.current=false;void restoreCloud().catch(error=>setSyncError(error instanceof Error?error.message:t('home.draftLoadFailed')))}},[cloud.state.ready,cloud.state.remote,planner,restoreCloud,t])
  const queueDraft=cloud.queue
  const draftChanged=useCallback((draft:PlannerDraft)=>{
    queueDraft(draft)
    setPlanner(current=>current&&current.plan.approval?.token===draft.plan.approval?.token&&JSON.stringify(current.initialDraft)!==JSON.stringify({edits:draft.edits,saved:draft.saved})?{...current,initialDraft:{edits:draft.edits,saved:draft.saved}}:current)
  },[queueDraft])
  const generatePlanner=async(input:string)=>{
    const routed=await processAiInput({text:input})
    if(routed.intent==='ANALYZE_SCHEDULE')throw new Error(t('home.needPlanRequest'))
    if(routed.intent==='RESCHEDULE'&&!routed.recommendation){setConflicts([]);throw new Error(t('home.noConflict'))}
    if(!routed.recommendation?.approval)throw new Error(t('home.noApproval'))
    const plan=routed.recommendation,existing=await getPlannerSchedules(plan.result.settings.startDate,plan.result.settings.endDate)
    autoRestore.current=false;setPlanner({input,plan,existing})
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
        if(!saved) throw new Error(t('home.saveFailedShort'))
        executed.push(saved)
      }catch{failed.push(action.item.id)}
    }
    const lines=[describePlan({...plan,mode:'auto',actions:failedActionIds(failed,plan.actions)})]
    if(failed.length)lines.push(t('home.changeFailedKept'))
    return {text:lines.join('\n'),items:[...plan.kept,...executed],undoIds}
  }
  /** One save request per message; its ids make a retry land on the same rows. */
  const autoSave=async(id:string,inputs:AutoSaveInput[],waiting:number)=>{
    patch(id,{status:'working',retry:inputs})
    try{
      const saved=await library.createWorkBatch(inputs)
      lastId.current=saved.at(-1)?.id??lastId.current
      setMessages(current=>current.map(row=>{
        if(row.id!==id)return row
        const items=[...(row.items??[]).filter(item=>!saved.some(next=>next.id===item.id)),...saved]
        return {...row,status:waiting?'review':'saved',text:savedText(t,items.length,waiting),items,saved:true,retry:undefined,review:waiting?row.review:undefined}
      }))
      notify(t(waiting?'home.toastSavedReview':'home.toastSavedCount',{count:saved.length}),'saved',waiting>0)
    }catch(error){
      patch(id,{status:'failed',text:t('home.saveFailedRetry',{reason:error instanceof Error?error.message:''}).replace(/ +\n/,'\n')})
      notify(t('home.toastFailed'),'failed')
    }
  }
  /** Each action runs on its own; the message lists what landed, what failed and what is still asked. */
  const runPlan=async(id:string,plan:IntentPlan)=>{
    patch(id,{status:'working',intentPlan:undefined})
    const records:CaptureRef[]=[],changed:string[]=[]
    const run=await runIntentPlan(plan,{items:library.items,
      // Everything a change action touches counts as a change, so its row offers 보기 but not 삭제.
      commitChange:changes=>commitSeriesChange(changes,(before,after)=>library.commitWork(before,after,'ai_chat')).then(result=>{changed.push(...result.updated.map(item=>item.id),...result.created.map(item=>item.id));return result}),
      createBatch:inputs=>library.createWorkBatch(inputs),
      saveRecord:(record,kind)=>{const result=library.saveCapture(record,kind);if(result.error)throw new Error(result.error);if(result.saved)records.push(result.saved)}})
    lastId.current=run.saved.at(-1)?.id??lastId.current
    // 실행 again runs only what failed; what landed stays on the message and is never saved twice.
    setMessages(current=>current.map(row=>{
      if(row.id!==id)return row
      const items=[...(row.items??[]).filter(item=>!run.saved.some(next=>next.id===item.id)),...run.saved]
      const allChanged=[...(row.changed??[]),...changed],allRecords=[...(row.records??[]),...records]
      return {...row,status:run.failed.length?'failed':'saved',text:describeIntentRun(plan,run),items,saved:true,intentPlan:run.remaining??undefined,
        changed:allChanged.length?allChanged:undefined,records:allRecords.length?allRecords:undefined}
    }))
    notify(t(run.failed.length?'home.toastFailed':'home.toastSaved'),run.failed.length?'failed':'saved')
  }
  const exclusive=async(task:()=>Promise<void>)=>{
    if(locked.current)return
    locked.current=true;setBusy(true)
    try{await task()}finally{locked.current=false;setBusy(false)}
  }
  const send=async()=>{
    if(!text.trim() || locked.current) return
    locked.current=true;setBusy(true)
    const input=text.trim();setText('')
    if(!phone){setPanel(current=>current.open?current:{open:true,focus:false});panelOpen.current=true}
    notified.current=false;lastReply.current=null
    append({role:'user',text:input})
    let fallbackToMemo=type==='auto'
    // Toasts tell a failed save apart from input that could not be analyzed (AI off, nothing found).
    let stage:'analyze'|'save'='analyze'
    // Set when intent analysis already spent this message's AI call; schedule analysis then asks for rules only.
    let intentAI:IntentExtraction|null=null
    // What a failure puts back in the box (and a memo fallback saves): never parts already saved as records.
    let retryText=input
    try {
      // One routing decision (records, mixed records + schedule, planner, schedule); later steps read its normalized text.
      const route=routeUtterance(input,{type,pending:Boolean(pending.current)})
      if(route.kind==='record') {
        fallbackToMemo=false;stage='save'
        saveRecord(input,route.type)
        return
      }
      if(type!=='auto' && type!=='schedule' && type!=='task') { const {error,saved}=library.saveCapture(input,type);append({role:'assistant',text:error ?? t('home.savedRecord'),status:error?'failed':undefined,records:saved?[saved]:undefined});notify(error?t('home.toastFailed'):t('home.savedAs',{type:t(`type.${type}`)}),error?'failed':'saved');return }
      if(route.kind==='planner'||route.kind==='reschedule'){await generatePlanner(input);append({role:'assistant',text:t('home.planRecommended')});return}
      // "데미안 50쪽 읽었고 내일 3시 회의": the reading is saved now, the schedule part continues on its own.
      if(route.kind==='mixed') {
        stage='save'
        for(const part of route.records)saveRecord(part.text,part.type)
        stage='analyze';fallbackToMemo=false;retryText=route.rest
      }
      const body=route.text
      const intent=conversationIntent(body,library.items,lastId.current,new Date(),library.categories,pending.current)
      // Changes to saved schedules and sentences with several intents go through one plan; list/cleanup commands keep their own flow.
      if(!pending.current && !['list','dedupe','conflicts','summarize','move_incomplete'].includes(intent.type)) {
        const extraction=await analyzeIntents(body,new Date())
        if(extraction.aiCalled)intentAI=extraction
        // A single, non-recurring update or delete the old flow already understood keeps its own confirm UI.
        const simple=extraction.intents.length===1&&(intent.type==='update'||intent.type==='delete')&&!isRecurring(intent.item)
        if(needsIntentPlan(extraction)&&!simple) {
          fallbackToMemo=false
          const plan=planIntents(extraction,library.items,{today:todayISO(),lastId:lastId.current})
          const targets=plan.actions.flatMap(action=>action.op==='change'?[action.target]:[])
          if(plan.mode==='auto') {const id=append({role:'assistant',text:describeIntentPlan(plan),status:'working'});await runPlan(id,plan)}
          else append({role:'assistant',text:describeIntentPlan(plan),items:targets,status:plan.actions.length?'confirm':'review',intentPlan:plan.actions.length?plan:undefined})
          return
        }
      }
      if(intent.type==='reply') {
        if(/지울지/.test(intent.text)) pending.current={kind:'clarify'}
        if(type==='auto' && !/(삭제|중복|겹치|지워|빼줘|남겨|남기|옮겨|delete|duplicate|overlap|remove)/i.test(body) && !pending.current && !hasScheduleSignal(body)) {fallbackToMemo=false;stage='save';saveRecord(retryText,'memo')}
        else {fallbackToMemo=false;append({role:'assistant',text:intent.text})}
      }
      else if(intent.type==='list') {
        const date=intent.date || todayISO()
        const end=intent.endDate || date
        const items=library.items.filter(item=>{let day=date;while(day<=end){if(occursOn(item,day))return true;const next=new Date(`${day}T00:00:00`);next.setDate(next.getDate()+1);day=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;if(day===date)break}return false})
        append({role:'assistant',text:t('home.listCount',{range:intent.endDate?date+'~'+end:date,count:items.length}),items})
      }
      else if(intent.type==='create') {
        pending.current=null
        const once=await analyzeOnce({intentAI,analyze:options=>analyzeSchedules(intent.text, library.categories, new Date(), options),planFromIntents:extraction=>planIntents(extraction,library.items,{today:todayISO(),lastId:lastId.current})})
        if('plan' in once) {
          fallbackToMemo=false
          const targets=once.plan.actions.flatMap(action=>action.op==='change'?[action.target]:[])
          append({role:'assistant',text:describeIntentPlan(once.plan),items:targets,status:'confirm',intentPlan:once.plan})
          return
        }
        const result=once.analysis
        if(type==='auto' && shouldSaveAnalysisAsMemo(result.items,body)) {
          fallbackToMemo=false;stage='save';saveRecord(retryText,'memo');return
        }
        if(!result.items.length) {
          throw new Error(t('home.noScheduleFound'))
        }
        fallbackToMemo=false
        const plan=planAutoSave(result,body,library.items,library.categories.map(category=>category.id),type==='task'?'task':type==='schedule'?'event':undefined)
        const review=plan.review.length?{analysis:result,input:body,rows:plan.review}:undefined
        const id=append({role:'assistant',text:plan.ready.length?t('home.saving'):savedText(t,0,plan.review.length),status:plan.ready.length?'working':'review',review,retry:plan.ready.length?plan.ready:undefined})
        if(plan.ready.length)await autoSave(id,plan.ready,plan.review.length)
      }
      else if(intent.type==='delete') {
        fallbackToMemo=false
        append({role:'assistant',text:t('home.confirmDelete',{title:intent.item.title}),status:'confirm',items:[intent.item],remove:intent.item})
      }
      else if(intent.type==='dedupe'||intent.type==='conflicts'||intent.type==='summarize'||intent.type==='move_incomplete') {
        fallbackToMemo=false
        const horizon=shiftISO(todayISO(),56)
        let plan=intent.type==='dedupe'?planDedupe(library.items,{start:intent.start,end:intent.end,titles:intent.titles,openEnd:intent.openEnd}):intent.type==='conflicts'?planConflicts(library.items,intent.start,intent.end,{keepTitles:intent.keepTitles,dropTitles:intent.dropTitles}):intent.type==='summarize'?planSummarize(library.items,intent.start,intent.end):planMoveIncomplete(library.items,intent.from,intent.to)
        if(intent.type==='dedupe'){
          pending.current={kind:'dedupe',start:intent.start,end:intent.end,titles:intent.titles,openEnd:intent.openEnd}
          if(!plan.actions.length){
            const start=intent.start??todayISO(), end=intent.end??horizon
            const conflict=planConflicts(library.items,start,end)
            if(conflict.kept.length){
              pending.current={kind:'conflicts',start,end}
              plan=conflict
            }
          }
        }
        if(intent.type==='conflicts') pending.current={kind:'conflicts',start:intent.start,end:intent.end,keepTitles:intent.keepTitles,dropTitles:intent.dropTitles}
        // Deleting always waits for 실행, even when the plan would run on its own.
        if((plan.mode==='preview'||plan.actions.some(action=>action.op==='delete'))&&plan.actions.length) {
          append({role:'assistant',text:describePlan({...plan,mode:'preview'}),items:[...plan.kept,...plan.actions.map(action=>action.item)],preview:plan,status:'confirm'})
        } else if(plan.skipped.length && !plan.actions.length) {
          append({role:'assistant',text:describePlan(plan),items:plan.kept,choices:[...new Set(plan.kept.map(item=>item.title))]})
        } else {
          const result=await applyAgentPlan(plan)
          append({role:'assistant',text:result.text,items:result.items,undoIds:result.undoIds})
        }
      }
      else {
        const before=intent.item,item={...before,...intent.patch}
        fallbackToMemo=false;stage='save'
        const saved=await library.commitWork(before,item,'ai_chat');if(!saved) throw new Error(t('home.saveFailedShort'))
        lastId.current=saved.id;append({role:'assistant',text:t(`home.${before?'changed':'added'}${saved.kind==='task'?'Task':'Event'}`,{title:saved.title}),items:[saved],saved:true,before:before ?? undefined,changed:before?[saved.id]:undefined,status:'saved'})
        notify(t('home.savedTitle',{title:saved.title}),'saved')
      }
    } catch(error) {
      let failure=error
      // A sentence about a schedule is never filed as a memo just because analysis failed.
      if(fallbackToMemo && !hasScheduleSignal(input)) {
        try {saveRecord(input,'memo');return} catch(saveError) {failure=saveError;stage='save'}
      }
      // After a mixed message the records are already saved; only the schedule part goes back to the box.
      setText(current=>current||retryText);append({role:'assistant',text:aiErrorText(t,failure,t('home.saveFailed')),status:'failed'});notify(t(stage==='save'?'home.toastFailed':'home.toastAnalyzeFailed'),'failed')
    }
    finally {
      locked.current=false;setBusy(false)
      // Replies without a save of their own (questions, lists, plans) still reach a closed panel as a toast.
      const reply=lastReply.current as Reply|null
      if(reply&&!notified.current){const review=reply.status==='confirm'||reply.status==='review';notify(review?t('home.toastNeedsReview'):reply.text,reply.status==='failed'?'failed':'saved',review||reply.status==='failed')}
    }
  }
  const openItem=(item:WorkItem)=>setEditing(item)
  // Saved results get one row each: 보기 opens the record's own editor or page, 삭제 removes that record.
  const navigate=useNavigate()
  // The sheet closes as the page changes (the next route may still be loading). Its Back entry (ChatPanel)
  // is replaced by the new page, so Back returns home rather than to a closed sheet.
  const go=(to:string,state?:object)=>{const replace=Boolean((history.state as Record<string,unknown>|null)?.blankyChatSheet);closePanel(false);navigate(to,{state,replace})}
  // `changed` rows edited an existing record: 보기 only, since 삭제 there would drop the whole original.
  type SavedRow={key:string;kind:string;title:string;detail?:string;live:boolean;changed?:boolean;view:()=>void;remove:()=>Promise<unknown>}
  const workRow=(snapshot:WorkItem,changed=false):SavedRow=>{
    const live=library.items.find(row=>row.id===snapshot.id),item=live??snapshot
    return {key:item.id,kind:t(item.kind==='task'?'type.task':'type.event'),title:item.title,detail:chipDetail(item),live:Boolean(live),changed,view:()=>{if(live)setEditing(live)},remove:()=>library.commitWork(live??item,null,'ai_chat')}
  }
  // Older single-change messages predate `changed`; their `before` marks every item as a change.
  const isChange=(message:Message,item:WorkItem)=>Boolean(message.before)||Boolean(message.changed?.includes(item.id))
  // Changing one record again and again lists it once, under the latest message that changed it.
  const latestChange=new Map<string,string>()
  for(const message of todayMessages)if(message.saved??message.status==='saved')for(const item of message.items??[])if(isChange(message,item))latestChange.set(item.id,message.id)
  const savedWorkRows=(message:Message)=>{
    const rows=new Map<string,SavedRow>()
    for(const item of message.items??[]){
      const changed=isChange(message,item)
      if(changed&&latestChange.get(item.id)!==message.id)continue
      rows.delete(item.id);rows.set(item.id,workRow(item,changed))
    }
    return [...rows.values()]
  }
  const recordRow=(saved:CaptureRef):SavedRow=>{
    const memo=saved.kind==='memo'?library.memos.find(row=>row.id===saved.id):undefined
    // Diaries load from the server; until they arrive a saved one is not reported as deleted.
    const log=saved.kind==='reading'?library.logs.find(row=>row.id===saved.id):undefined
    const live=saved.kind==='memo'?Boolean(memo):saved.kind==='diary'?library.diaryLoading||library.diaries.some(row=>row.id===saved.id):Boolean(log)
    // A reading row names the page this log recorded (not the book's overall progress), kept after 삭제.
    const page=saved.kind==='reading'?log?.page??saved.page:null
    return {key:saved.id,kind:t(`type.${saved.kind}`),title:memo?.title??saved.title,detail:page!=null?t('home.readingPage',{page}):undefined,live,
      view:()=>saved.kind==='reading'?go(ROUTES.reading,{legacyBookId:saved.bookId}):go(saved.kind==='memo'?ROUTES.memo:ROUTES.diary,{openId:saved.id}),
      remove:()=>library.eraseCapture(saved)}
  }
  const [rowError,setRowError]=useState<{key:string;text:string}|null>(null)
  const removeSaved=(message:Message,row:SavedRow)=>{
    if(locked.current)return
    setRowError(null)
    void exclusive(async()=>{
      try{
        await row.remove()
        if(lastId.current===row.key)lastId.current=null
        setMessages(current=>current.map(entry=>entry.id===message.id?{...entry,deleted:[...(entry.deleted??[]),row.key]}:entry))
      }catch{setRowError({key:message.id+row.key,text:t('home.deleteFailed')})}
    })
  }
  // 삭제 keeps its place (and focus) and turns into 삭제됨; aria-disabled rather than disabled so focus stays put.
  const renderSaved=(message:Message,rows:SavedRow[])=>rows.length?<ul className="home-saved mt-2 space-y-1.5">{rows.map(row=>{
    const gone=!row.live||Boolean(message.deleted?.includes(row.key)),error=rowError?.key===message.id+row.key?rowError.text:''
    return <li key={row.key} data-saved-row={row.key} data-saved-state={gone?'deleted':'saved'} data-saved-change={row.changed||undefined} className="home-saved-row">
      <p className={'min-w-0 flex-1 truncate text-xs'+(gone?' line-through opacity-60':'')}><span className="home-muted">{row.kind}</span> <span className="text-sm font-medium">{row.title}</span>{row.detail?<span className="home-muted"> {row.detail}</span>:null}</p>
      {gone?null:<button type="button" data-theme-slot="button" className="btn btn-ghost home-saved-action home-saved-view" aria-disabled={busy||undefined} aria-label={t('home.viewItem',{title:row.title})} onClick={()=>{if(!busy)row.view()}}>{t('home.view')}</button>}
      {row.changed&&!gone?null:<button type="button" data-theme-slot="button" className="btn btn-ghost home-saved-action" data-deleted={gone||undefined} aria-disabled={busy||gone||undefined} aria-label={t(gone?'home.deletedItem':'home.deleteItem',{title:row.title})} onClick={()=>{if(!gone&&!busy)removeSaved(message,row)}}>{t(gone?'home.deleted':'home.delete')}</button>}
      {error?<p role="alert" className="home-saved-error w-full text-xs">{error}</p>:null}
    </li>})}</ul>:null
  // The review modal keeps the analysis it opened with; the message settles when it closes.
  const reviewSaved=useRef<WorkItem[]>([]),reviewAll=useRef(false)
  const startReview=(message:Message)=>{reviewSaved.current=[];reviewAll.current=false;setReviewing({id:message.id,analysis:reviewAnalysis(message.review!.analysis,message.review!.rows)})}
  const finishReview=(id:string,all:boolean)=>{
    const saved=reviewSaved.current
    reviewSaved.current=[];setReviewing(null)
    setMessages(current=>current.map(row=>{
      if(row.id!==id||!row.review)return row
      let rows=row.review.rows
      if(all||saved.length>=rows.length)rows=[]
      else for(const item of saved){const index=rows.findIndex(entry=>entry.item.draft.title===item.title);rows=rows.filter((_,at)=>at!==(index<0?0:index))}
      const items=[...(row.items??[]),...saved.filter(item=>!row.items?.some(existing=>existing.id===item.id))]
      return {...row,items,saved:items.length>0||row.saved,review:rows.length?{...row.review,rows}:undefined,status:rows.length?'review':items.length?'saved':'done',text:savedText(t,items.length,rows.length)||row.text}
    }))
  }
  const renderMessage=(message:Message)=><div key={message.id} data-chat-message={message.role} data-chat-status={message.status}>
    <p className="home-muted mb-1 text-xs">{message.role==='user'?t('me'):'Blanky'}</p>
    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
    {message.before&&<p className="home-muted mt-1 text-xs">{t('home.before',{title:message.before.title,detail:chipDetail(message.before)})}</p>}
    {message.items?.length&&!(message.saved??message.status==='saved')?<div className="mt-2 flex flex-wrap gap-1.5">{message.items.map(item=><WorkChip key={item.id} snapshot={item} onOpen={openItem}/>)}</div>:null}
    {renderSaved(message,[...((message.saved??message.status==='saved')?savedWorkRows(message):[]),...(message.records??[]).map(recordRow)])}
    {message.review&&<>
      <ul className="mt-2 space-y-1 text-xs">{message.review.rows.map(row=><li key={row.item.id}><span className="font-medium">{row.item.draft.title}</span> <span className="text-amber-700">{row.reasons.join(' ')}</span></li>)}</ul>
      {reviewing?.id!==message.id&&<div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-ghost text-blue-600" disabled={busy} onClick={()=>startReview(message)}>{t('home.reviewSave')}</button>
        {message.review.rows.every(row=>row.input)&&<button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>void exclusive(()=>autoSave(message.id,message.review!.rows.map(row=>row.input!),0))}>{t('home.saveAsIs')}</button>}
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>patch(message.id,{review:undefined,status:'done',text:savedText(t,message.items?.length??0,0)?t('home.restNotSaved',{saved:savedText(t,message.items?.length??0,0)}):t('home.notSaved')})}>{t('home.dontSave')}</button>
      </div>}
      {reviewing?.id===message.id&&<AnalysisReview key={message.id} analysis={reviewing.analysis} originalText={message.review.input} categories={library.categories} onClose={()=>finishReview(message.id,reviewAll.current)}
        onSaveAll={async inputs=>{const saved=await library.createWorkBatch(inputs);reviewSaved.current=saved;reviewAll.current=true;return saved}}
        onSave={async input=>{const item=createWorkItem(input,{inferEndTime:false});if(!item)return null;const saved=await library.commitWork(null,item,'ai_chat');if(saved){lastId.current=saved.id;reviewSaved.current=[...reviewSaved.current,saved];if(reviewing.analysis.items.length===1)reviewAll.current=true;else setMessages(current=>current.map(row=>row.id===message.id?{...row,items:[...(row.items??[]),saved],saved:true}:row))}return saved}}/>}
    </>}
    {message.status==='failed'&&message.retry?.length?<button type="button" className="btn btn-ghost mt-2 text-blue-600" disabled={busy} onClick={()=>void exclusive(()=>autoSave(message.id,message.retry!,message.review?.rows.filter(row=>!message.retry!.some(input=>input.id===row.input?.id)).length??0))}>{t('home.retry')}</button>:null}
    {message.remove&&<div className="mt-2 flex gap-2"><button type="button" className="btn btn-ghost text-red-600" disabled={busy} onClick={()=>void exclusive(async()=>{const target=library.items.find(item=>item.id===message.remove!.id);if(!target){patch(message.id,{remove:undefined,status:'done',text:t('home.alreadyDeleted')});return}try{await library.commitWork(target,null,'ai_chat');lastId.current=null;patch(message.id,{remove:undefined,status:'done',text:t('home.movedToTrash',{title:target.title}),undoIds:[target.id]})}catch(error){patch(message.id,{status:'failed',text:error instanceof Error?error.message:t('home.deleteFailed')})}})}>{t('home.delete')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>patch(message.id,{remove:undefined,status:'done',text:t('home.notDeleted')})}>{t('home.cancel')}</button></div>}
    {message.choices?.length?<div className="mt-2 flex flex-wrap gap-2">{message.choices.map(title=><button type="button" key={title} className="btn btn-ghost text-blue-600" disabled={busy} onClick={()=>{const scope=pending.current&&pending.current.kind==='conflicts'?pending.current:{start:todayISO(),end:shiftISO(todayISO(),56)};const plan=planConflicts(library.items,scope.start,scope.end,{keepTitles:[title]});pending.current={kind:'conflicts',start:scope.start,end:scope.end,keepTitles:[title]};setMessages(current=>current.map(row=>row.id===message.id?{...row,text:describePlan(plan),items:[...plan.kept,...plan.actions.map(action=>action.item)],preview:plan,choices:undefined}:row))}}>{t('home.keepTitle',{title})}</button>)}</div>:null}
    {message.intentPlan&&<div className="mt-2 flex gap-2"><button type="button" className="btn btn-ghost text-blue-600" disabled={busy} onClick={()=>void exclusive(()=>runPlan(message.id,message.intentPlan!))}>{t('home.run')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>patch(message.id,{intentPlan:undefined,status:'done',text:`${message.text}\n${t('home.notRun')}`})}>{t('home.cancel')}</button></div>}
    {message.preview&&<div className="mt-2 flex gap-2"><button type="button" className="btn btn-ghost text-blue-600" disabled={busy} onClick={()=>void exclusive(()=>applyAgentPlan(message.preview!).then(result=>patch(message.id,{text:result.text,items:result.items,undoIds:result.undoIds,preview:undefined,status:'done'})))}>{t('home.run')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={()=>{pending.current=null;patch(message.id,{text:t('home.notRun'),preview:undefined,items:undefined,choices:undefined,status:'done'})}}>{t('home.cancel')}</button></div>}
    {message.undoIds?.length?<button type="button" className="btn btn-ghost mt-2 text-blue-600" disabled={busy} onClick={()=>void Promise.all(message.undoIds!.map(id=>library.restoreTrash(id))).then(()=>setMessages(current=>current.map(row=>row.id===message.id?{...row,text:row.text+'\n'+t('home.undone'),undoIds:undefined}:row)))}>{t('home.undo')}</button>:null}
  </div>
  return <div className="home-page flex min-h-0 flex-1">
    <div className="home-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
    <div className="home-content m-auto flex w-full max-w-2xl shrink-0 flex-col px-6 py-12"><Onboarding /><div data-theme-slot="page-header" className="home-header"><h1 className="home-title">{t('home.title')}</h1><p className="home-muted mt-1 text-sm">{t('home.tagline')}</p></div>
    <div className="composer"><label className="sr-only" htmlFor="home-entry">{t('home.inputLabel')}</label><textarea ref={entry} data-theme-slot="input" id="home-entry" rows={3} value={text} placeholder={t('home.placeholder')} className="w-full resize-none bg-transparent leading-relaxed outline-none" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&text){e.preventDefault();setText('')}if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
      <div className="home-composer-bar mt-3 flex justify-between gap-2 border-t border-line pt-2"><div data-tour="entry-types" className="flex min-w-0 flex-1 flex-wrap">{[{id:'auto' as EntryType,label:t('type.auto')},...ENTRY_OPTIONS.map(option=>({...option,label:t(`type.${option.id}`)}))].map(option=><button data-theme-slot="button" key={option.id} className={type===option.id?'chip chip-on':'chip'} onClick={()=>setType(option.id)} aria-pressed={type===option.id}>{option.label}</button>)}</div><button data-theme-slot="button-primary" disabled={busy||!text.trim()} className="icon-btn-primary self-end" aria-label={t('home.send')} onClick={()=>void send()}><ArrowUp className="size-4"/></button></div></div>
    {/* Secondary row: the personalization link and progress on the left, the history toggle on the right. */}
    <div className="home-aux mt-2 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><Link to={settingsPath('ai')} className="home-settings-link shrink-0 text-xs">{t('home.planningLink')}</Link><p role="status" className="home-muted min-w-0 truncate text-xs">{busy&&!panel.open?t('home.working'):''}</p></div>
      <button ref={historyButton} type="button" data-theme-slot="button" className={panel.open?'home-history chip chip-on inline-flex shrink-0 items-center justify-center gap-1':'home-history chip inline-flex shrink-0 items-center justify-center gap-1'} aria-controls="home-chat-panel" aria-expanded={panel.open} onClick={()=>panel.open?closePanel(false):openPanel('history')}><MessageSquare size={12} strokeWidth={1.5} aria-hidden="true" />{t('home.history')}{todayMessages.length?<span className="tabular-nums">{todayMessages.filter(row=>row.role==='user').length}</span>:null}</button>
    </div>
    {(conflicts.length>0||conflictError)&&<div className="mt-5 rounded-lg border border-line p-3"><p className="text-sm text-accent-text">{conflictError||t('home.conflicts', { count: conflicts.length })}</p>{conflicts.map(row=><p className="home-muted mt-1 text-xs" key={row.id}>{row.date} · {row.title}</p>)}{conflicts.length>0&&<button type="button" disabled={busy} className="btn btn-ghost mt-2 text-blue-600" onClick={()=>{setText(t('home.replanHint'));void generatePlanner(t('home.replanHint')).catch(error=>setConflictError(error instanceof Error?error.message:t('home.replanFailed')))}}>{t('home.replan')}</button>}</div>}
    {cloud.enabled&&<div className="home-muted mt-4 space-y-2 text-xs" aria-label={t('home.draftSync')} data-sync-ready={cloud.state.ready}>{syncError||cloud.state.message?<p role="status" data-planner-sync>{syncError||cloud.state.message}</p>:null}{(cloud.state.conflict||!planner&&cloud.state.remote?.draft)&&<div className="flex flex-wrap gap-2"><button type="button" className="btn btn-ghost text-blue-600" disabled={cloud.state.busy} onClick={()=>void restoreCloud().catch(error=>setSyncError(error instanceof Error?error.message:t('home.draftLoadFailed')))}>{t('home.loadRemoteDraft')}</button>{planner&&<button type="button" className="btn btn-ghost" disabled={cloud.state.busy} onClick={()=>void cloud.sync.keepLocal()}>{t('home.keepLocalDraft')}</button>}{!planner&&<button type="button" className="btn btn-ghost" disabled={cloud.state.busy} onClick={()=>{cloud.sync.acceptRemote();void cloud.sync.clear()}}>{t('home.closeRemoteDraft')}</button>}</div>}{/못|실패|만료|연결/.test(cloud.state.message)&&<button type="button" className="text-blue-600" onClick={()=>void cloud.sync.refresh().then(()=>cloud.sync.flush())}>{t('home.retryDraft')}</button>}</div>}
    {planner&&<PlannerPreview key={(planner.plan.approval?.token.slice(-16)??planner.input)+(planner.resumeId??'')} initialDraft={planner.initialDraft} onDraftChange={draftChanged} input={planner.input} plan={planner.plan} existing={planner.existing} onCancel={()=>{autoRestore.current=false;setText(planner.input);setPlanner(null);if(cloud.enabled)void cloud.sync.clear()}} onRegenerate={()=>generatePlanner(planner.input)} onRemaining={planner.plan.mode==='reschedule'?undefined:async edits=>{const result=await replanRemaining(planner.plan.approval!.token,edits);if(!result.recommendation)throw new Error(t('home.noRemaining'));const plan=result.recommendation,existing=await getPlannerSchedules(plan.result.settings.startDate,plan.result.settings.endDate);setPlanner({input:planner.input,plan,existing})}} onApply={async blocks=>{
      const result=await approvePlanner({token:planner.plan.approval!.token,blocks})
      library.adoptPlannerSchedules(result.schedules)
      void library.refreshWork().catch(()=>append({role:'assistant',text:t('home.activitySaved')}))
      void getPlannerSchedules(planner.plan.result.settings.startDate,planner.plan.result.settings.endDate).then(existing=>setPlanner(current=>current?{...current,existing}:current)).catch(()=>undefined)
      return result
    }}/>}
    </div>
    </div>
    <ChatPanel open={panel.open} focusOnOpen={panel.focus} busy={busy} onClose={closePanel}>
      {todayMessages.length?todayMessages.map(renderMessage):<p className="home-muted text-sm">{t('home.historyEmpty')}</p>}
      {busy&&<p role="status" className="home-muted text-sm">{t('home.working')}</p>}
    </ChatPanel>
    {editing&&<WorkEditDialog key={editing.id} item={editing} onClose={()=>setEditing(null)}/>}
  </div>
}
