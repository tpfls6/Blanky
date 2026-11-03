import assert from 'node:assert/strict'
import test from 'node:test'
import { recommendPriority } from '../packages/parse/src/priority.ts'
import { validateScheduleAnalysis } from '../packages/types/src/aiSchema.ts'
import { schedulingSettings } from '../packages/scheduling/src/settings.ts'
import { editsFromRecommendation } from '../packages/scheduling/src/approval.ts'
import { recommendExistingTasks, existingTaskUpdates, preserveExistingChoices } from '../src/features/ai/existingTaskPlanning.ts'
import type { WorkItem } from '../src/types/work.ts'

const now='2026-10-29T00:00:00Z'
const settings=schedulingSettings({now,startDate:'2026-10-29',endDate:'2026-10-30',dayStartTime:'09:00',dayEndTime:'18:00',breakMinutes:10})
const item=(id='one',patch:Partial<WorkItem>={}):WorkItem=>({id,kind:'task',title:id,description:'keep description',date:'2026-10-29',startTime:null,endTime:null,duration:60,categoryId:null,priority:'low',status:'todo',dueDate:'2026-10-30',dueTime:'12:00',endDate:null,allDay:false,repeat:'none',...patch})
const confirm=(plan:ReturnType<typeof recommendExistingTasks>)=>editsFromRecommendation(plan).map(row=>({...row,confirmed:true}))

test('priority recommendations honor explicit urgency, deferral and neutral deadline',()=>{
  assert.equal(recommendPriority('급하게 발표 준비').priority,'high')
  assert.equal(recommendPriority('중요한 제안서').priority,'high')
  assert.equal(recommendPriority('나중에 해도 되는 정리').priority,'low')
  assert.equal(recommendPriority('중요하지 않은 정리').priority,'low')
  assert.equal(recommendPriority('내일 오후 3시 마감').priority,'medium')
  assert.equal(recommendPriority('자료 조사',true).priority,'medium')
  assert.ok(recommendPriority('자료 조사').reason)
})
test('read-only recommendation preserves user priority and respects deadline, appointments and rest',()=>{
  const row=item(), snapshot=structuredClone(row)
  const busy=[item('meeting',{kind:'event',startTime:'09:00',endTime:'10:00'})]
  const plan=recommendExistingTasks([row],['one'],busy,settings)
  assert.equal(plan.result.blocks[0].priority,'low')
  assert.equal(plan.result.tasks[0].task.priorityIsEstimate,false)
  assert.equal(plan.result.blocks[0].startAt,'2026-10-29T10:10:00+09:00')
  assert.deepEqual(row,snapshot)
  assert.equal(plan.result.recommendationOnly,true)
})
test('apply patches original ID, keeps metadata, allows reviewed priority and rejects repeated application',()=>{
  const row=item('one',{repeat:'weekly',repeatDays:[4]})
  const plan=recommendExistingTasks([row],['one'],[],settings)
  const edits=confirm(plan);edits[0].priority='high'
  const [update]=existingTaskUpdates(plan,edits,[row],[],now)
  assert.equal(update.after.id,row.id)
  assert.equal(update.after.priority,'high')
  for(const key of ['description','dueDate','dueTime','status','repeat','repeatDays','categoryId'] as const)assert.deepEqual(update.after[key],row[key])
  assert.throws(()=>existingTaskUpdates(plan,edits,[update.after],[],now),/변경/)
})
test('apply detects newly added conflicts and stale user priority/deadline/duration',()=>{
  const row=item(),plan=recommendExistingTasks([row],['one'],[],settings),edits=confirm(plan)
  assert.throws(()=>existingTaskUpdates(plan,edits,[row],[item('new',{kind:'event',startTime:'09:00',endTime:'10:00'})],now),/겹쳐/)
  for(const patch of [{priority:'high' as const},{dueDate:'2026-10-29'},{dueTime:'09:30'},{duration:30}])assert.throws(()=>existingTaskUpdates(plan,edits,[{...row,...patch}],[],now),/변경/)
})
test('estimate requires explicit confirmation and remains editable',()=>{
  const row=item('one',{duration:null}),plan=recommendExistingTasks([row],['one'],[],settings),edits=editsFromRecommendation(plan)
  assert.ok(plan.result.blocks[0].confirmationNeeded.some(text=>text.includes('추정')))
  assert.throws(()=>existingTaskUpdates(plan,edits,[row],[],now),/추정/)
  edits[0]={...edits[0],confirmed:true,durationMinutes:30,endTime:'09:30'}
  assert.equal(existingTaskUpdates(plan,edits,[row],[],now)[0].after.duration,30)
})
test('deadline clocks and insufficient daily capacity never force a placement',()=>{
  const row=item('one',{dueDate:'2026-10-29',dueTime:'09:30'})
  const plan=recommendExistingTasks([row],['one'],[],settings)
  assert.equal(plan.result.blocks.length,0)
  assert.equal(plan.result.tasks[0].reason,'INSUFFICIENT_CAPACITY')
  assert.equal(recommendExistingTasks([item()],['one'],[],{...settings,maxDailyMinutes:30}).result.blocks.length,0)
  const expired=recommendExistingTasks([item('one',{dueDate:'2026-10-28'})],['one'],[],settings)
  assert.equal(expired.result.tasks[0].reason,'DEADLINE_PASSED')
})
test('dependency order and excluded predecessors are validated before applying',()=>{
  const rows=[item('one'),item('two')],plan=recommendExistingTasks(rows,['two','one'],[],settings,{two:['one']})
  assert.deepEqual(plan.result.blocks.map(row=>row.sourceTaskId),['one','two'])
  assert.throws(()=>existingTaskUpdates(plan,confirm(plan).filter(row=>row.id.startsWith('two:')),rows,[],now),/선행/)
  assert.equal(existingTaskUpdates(plan,confirm(plan),rows,[],now).length,2)
})
test('regeneration keeps confirmed time/priority and schedules remaining work around it',()=>{
  const rows=[item('one'),item('two')],plan=recommendExistingTasks(rows,['one','two'],[],settings),edits=confirm(plan)
  edits[0]={...edits[0],startTime:'11:00',endTime:'12:00',priority:'high'}
  edits[1].confirmed=false
  const next=preserveExistingChoices(recommendExistingTasks(rows,['one','two'],[],settings),plan,edits,[])
  const first=next.result.blocks.find(row=>row.sourceTaskId==='one')!
  assert.equal(first.startAt,'2026-10-29T11:00:00+09:00')
  assert.equal(first.priority,'high')
  assert.equal(existingTaskUpdates(next,confirm(next),rows,[],now).length,2)
})
test('regeneration retains edited priority and dependency validation with a fixed predecessor',()=>{
  const rows=[item('one'),item('two')],dependencies={two:['one']}
  const plan=recommendExistingTasks(rows,['one','two'],[],settings,dependencies),edits=confirm(plan)
  edits[0]={...edits[0],startTime:'11:00',endTime:'12:00'}
  edits[1]={...edits[1],priority:'high',confirmed:false}
  const next=preserveExistingChoices(recommendExistingTasks(rows,['one','two'],[],settings,dependencies),plan,edits,[])
  const second=next.result.blocks.find(row=>row.sourceTaskId==='two')!
  assert.equal(second.priority,'high')
  assert.ok(Date.parse(second.startAt)>=Date.parse('2026-10-29T12:10:00+09:00'))
  assert.equal(existingTaskUpdates(next,confirm(next),rows,[],now).length,2)
})
test('AI recommendation metadata is optional for legacy results and validated when present',()=>{
  const value={version:1,route:'ai',items:[{id:'one',type:'task',source:'ai',confidence:1,draft:{title:'one',date:null,startTime:null,endTime:null,dueDate:null,endDate:null,categoryId:null},evidence:{date:null,startTime:null,endTime:null,dueDate:null,endDate:null},categoryReason:null,uncertainties:[]}],relations:[],warnings:[]}
  assert.equal(validateScheduleAnalysis(value).items.length,1)
  const withPriority={...value,items:[{...value.items[0],priorityRecommendation:{priority:'low',reason:'미룰 수 있는 작업이에요.'}}]}
  assert.equal(validateScheduleAnalysis(withPriority).items[0].priorityRecommendation?.priority,'low')
  assert.throws(()=>validateScheduleAnalysis({...withPriority,items:[{...withPriority.items[0],priorityRecommendation:{priority:'invalid',reason:'invalid'}}]}))
})
