import { useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ENTRY_OPTIONS, type EntryType } from '../../types/records.ts'
import type { WorkItem } from '../../types/work.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { conversationIntent } from '../../features/ai/conversation.ts'
import { classifySchedule } from '../../services/schedule/index.ts'
import { createWorkItem, occursOn } from '../../utils/work.ts'
import { todayISO } from '../../utils/date.ts'
import { WorkCard } from '../../components/schedule/WorkCard.tsx'
type Message = { id:string; role:'user'|'assistant'; text:string; items?:WorkItem[]; before?:WorkItem }
export function HomePage() {
  const library=useLibrary()
  const [text,setText]=useState(''),[type,setType]=useState<EntryType>('auto'),[messages,setMessages]=useState<Message[]>([]),[busy,setBusy]=useState(false)
  const locked=useRef(false),lastId=useRef<string|null>(null)
  const send=async()=>{
    if(!text.trim() || locked.current) return
    locked.current=true;setBusy(true)
    const input=text.trim();setText('')
    const append=(message:Omit<Message,'id'>)=>setMessages(current=>[...current,{...message,id:crypto.randomUUID()}])
    append({role:'user',text:input})
    try {
      if(type!=='auto' && type!=='schedule' && type!=='task') { const error=library.saveCapture(input,type);append({role:'assistant',text:error ?? '기록을 저장했습니다.'});return }
      const intent=conversationIntent(input,library.items,lastId.current,new Date(),library.categories)
      if(intent.type==='reply') append({role:'assistant',text:intent.text})
      else if(intent.type==='list') {const date=intent.date || todayISO(),items=library.items.filter(item=>occursOn(item,date));append({role:'assistant',text:date+' · '+items.length+'개 항목이 있어요.',items})}
      else {
        let before:WorkItem|null=null,item:WorkItem|null
        if(intent.type==='update') {before=intent.item;item={...before,...intent.patch}}
        else {const draft=await classifySchedule(intent.text,todayISO(),library.categories,new Date());item=createWorkItem({...draft,kind:type==='task'?'task':type==='schedule'?'event':draft.kind,startTime:draft.startTime || null,endTime:draft.endTime || null,dueDate:draft.dueDate || null,duration:Number(draft.duration)||null})}
        if(!item) {append({role:'assistant',text:'제목과 날짜를 알려 주세요.'});return}
        const saved=await library.commitWork(before,item,'ai_chat');if(!saved) throw new Error('저장 실패')
        lastId.current=saved.id;append({role:'assistant',text:saved.title+' '+(saved.kind==='task'?'할 일을':'일정을')+' '+(before?'변경':'추가')+'했습니다.',items:[saved],before:before ?? undefined})
      }
    } catch {append({role:'assistant',text:'저장하지 못했습니다. 연결과 DB 마이그레이션을 확인해 주세요.'})}
    finally {locked.current=false;setBusy(false)}
  }
  return <div className="mx-auto w-full max-w-2xl px-6 py-12"><div className="mb-5 flex items-center justify-between"><p className="text-sm text-neutral-400">Blanky AI · 일정과 할 일을 이야기해 주세요</p><Link className="text-xs text-neutral-400" to="/activity">Activity ↗</Link></div>
    <div className="composer"><label className="sr-only" htmlFor="home-entry">AI에게 입력</label><textarea data-theme-slot="input" id="home-entry" rows={3} value={text} placeholder="내일 오후 3시에 운동 추가해줘" className="w-full resize-none bg-transparent leading-relaxed outline-none" onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setText('');if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
      <div className="mt-3 flex justify-between gap-2 border-t border-line pt-2"><div className="flex flex-wrap gap-1">{[{id:'auto' as EntryType,label:'AI 대화'},...ENTRY_OPTIONS].map(option=><button data-theme-slot="button" key={option.id} className={type===option.id?'chip chip-on':'chip'} onClick={()=>setType(option.id)} aria-pressed={type===option.id}>{option.label}</button>)}</div><button data-theme-slot="button-primary" disabled={busy||!text.trim()} className="icon-btn-primary" aria-label="보내기" onClick={()=>void send()}><ArrowUp className="size-4"/></button></div></div>
    <p className="mt-3 text-xs text-neutral-400">Enter 보내기 · Shift + Enter 줄바꿈</p>
    <div className="mt-8 space-y-6" aria-live="polite" aria-busy={busy}>{messages.map(message=><div key={message.id}><p className="mb-2 text-xs text-neutral-400">{message.role==='user'?'나':'Blanky'}</p><p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p><div className="mt-3 space-y-2">{message.items?.map(item=><WorkCard key={item.id} snapshot={item} before={message.before}/>)}</div></div>)}{busy && <p role="status" className="text-sm text-neutral-400">처리하고 있어요…</p>}</div>
  </div>
}
