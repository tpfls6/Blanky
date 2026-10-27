import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalFixture } from './fixtures/planner.ts'
import { editsFromRecommendation,validatePlannerEdits } from '../packages/scheduling/src/approval.ts'
import { sealPlanner } from '../supabase/functions/_shared/plannerToken.ts'
import { createDraftHandler,type StoredDraft } from '../supabase/functions/planner-draft/handler.ts'
import { AnalysisError } from '../packages/types/src/aiSchema.ts'
import { validatePlannerDraft,type PlannerDraft,type PlannerDraftState } from '../packages/types/src/plannerDraft.ts'
import { PlannerDraftSync } from '../src/features/ai/draftSync.ts'
const now='2026-10-13T00:00:00Z',secret='draft-test-only',userId='owner'
async function fixture():Promise<PlannerDraft>{const plan=approvalFixture();plan.approval=await sealPlanner(plan,userId,secret,Date.parse(now));return {input:'공부 계획 세워줘',plan,edits:editsFromRecommendation(plan),saved:[]}}
const request=(body:unknown)=>new Request('http://test',{method:'POST',body:JSON.stringify(body)})
const body=(draft:PlannerDraft,revision=0)=>({action:'save',revision,input:draft.input,token:draft.plan.approval!.token,edits:draft.edits})
const snapshot=()=>({revision:'one',rows:[] as Record<string,unknown>[],calendars:[{id:'calendar',timezone:'Asia/Seoul',is_default_personal:true}]})
function server(){let stored:StoredDraft|null=null;const schedules=snapshot();const handler=createDraftHandler({authenticate:async()=>({userId,secret,now,read:async()=>stored,write:async(revision,payload)=>{if((stored?.revision??0)!==revision)throw new AnalysisError('DRAFT_CONFLICT','다른 기기에서 변경했어요.');stored={revision:revision+1,payload,updated_at:now};return stored},snapshot:async()=>schedules})});return {handler,schedules,stored:()=>stored}}
function transport(){let state:PlannerDraftState={revision:0,draft:null,updatedAt:null};return {read:()=>structuredClone(state),external:(draft:PlannerDraft|null)=>{state={revision:state.revision+1,draft,updatedAt:now}},load:async()=>structuredClone(state),save:async(revision:number,draft:PlannerDraft)=>{if(revision!==state.revision)throw new AnalysisError('DRAFT_CONFLICT','changed');state={revision:revision+1,draft:structuredClone(draft),updatedAt:now};return structuredClone(state)},clear:async(revision:number)=>{if(revision!==state.revision)throw new AnalysisError('DRAFT_CONFLICT','changed');state={revision:revision+1,draft:null,updatedAt:now};return state}}}

test('cloud draft retains unfinished fields and never creates schedule rows',async()=>{
 const draft=await fixture(),s=server();draft.edits[0].title='';draft.edits[0].date='';draft.edits[0].startTime='';draft.edits[0].durationMinutes=0
 validatePlannerDraft(draft);assert.throws(()=>validatePlannerEdits(draft.plan,draft.edits,[],now))
 const saved=await s.handler(request(body(draft)));assert.equal(saved.status,200);assert.equal(s.schedules.rows.length,0)
 const loaded=await (await s.handler(request({action:'load'}))).json();assert.equal(loaded.draft.edits[0].title,'');assert.equal(loaded.revision,1)
})
test('unknown work IDs, forged signed plans and foreign users are rejected',async()=>{
 const draft=await fixture(),s=server();const forged=structuredClone(draft);forged.edits[0].id='unknown';assert.equal((await s.handler(request(body(forged)))).status,400)
 const foreign=createDraftHandler({authenticate:async()=>({userId:'other',secret,now,read:async()=>null,write:async()=>{throw new Error('must not write')},snapshot:async()=>snapshot()})})
 assert.equal((await foreign(request(body(draft)))).status,400);assert.equal(s.stored(),null)
 const anonymous=createDraftHandler({authenticate:async()=>null});assert.equal((await anonymous(request({action:'load'}))).status,401)
})
test('revision conflict protects other device draft; clear tombstone rejects stale resurrection',async()=>{
 const draft=await fixture(),s=server();assert.equal((await s.handler(request(body(draft)))).status,200)
 const other=structuredClone(draft);other.edits[0].title='other device'
 assert.equal((await s.handler(request(body(other)))).status,409);assert.equal(s.stored()?.payload?.edits[0].title,draft.edits[0].title)
 assert.equal((await s.handler(request({action:'clear',revision:1}))).status,200);assert.equal(s.stored()?.payload,null);assert.equal(s.stored()?.revision,2)
 assert.equal((await s.handler(request(body(draft,1)))).status,409);assert.equal(s.stored()?.payload,null)
})
test('saved status and values come from current owned schedules, not client claims',async()=>{
 const draft=await fixture(),s=server(),edit=draft.edits[0]
 s.schedules.rows.push({id:'stored',user_id:userId,calendar_id:'calendar',planner_approval_key:draft.plan.approval!.previewId+':'+edit.id,title:'actual title',date:edit.date,start_time:edit.startTime,end_time:edit.endTime,duration_minutes:60,priority:'high'})
 const saved=await (await s.handler(request(body(draft)))).json();assert.deepEqual(saved.draft.saved,[edit.id]);assert.equal(saved.draft.edits[0].title,'actual title');assert.equal(saved.draft.edits[0].priority,'high')
})
test('serial coalesced saves keep newest edits and use increasing revisions',async()=>{
 const draft=await fixture(),t=transport();let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});const calls:number[]=[]
 const c=new PlannerDraftSync({...t,save:async(revision,value)=>{calls.push(revision);if(!calls.length||calls.length===1)await gate;return t.save(revision,value)}},()=>{},10000)
 await c.start();c.queue(draft);const saving=c.flush();const next=structuredClone(draft);next.edits[0].title='newest';c.queue(next);release();await saving
 assert.deepEqual(calls,[0,1]);assert.equal(t.read().draft?.edits[0].title,'newest');c.dispose()
})
test('typing then reverting before save never sends stale buffered edits',async()=>{
 const draft=await fixture(),t=transport();t.external(draft);const c=new PlannerDraftSync(t,()=>{},10000);await c.start();c.acceptRemote();const changed=structuredClone(draft);changed.edits[0].title='transient';c.queue(changed);c.queue(draft);await c.flush();assert.equal(t.read().revision,1);c.dispose()
})
test('cross-device conflict keeps local edits until explicit choice',async()=>{
 const draft=await fixture(),t=transport(),c=new PlannerDraftSync(t,()=>{},10000);await c.start();c.queue(draft);await c.flush()
 const remote=structuredClone(draft);remote.edits[0].title='remote';t.external(remote)
 const local=structuredClone(draft);local.edits[0].title='local';c.queue(local);await c.flush();assert.equal(c.state.conflict,true);assert.equal(t.read().draft?.edits[0].title,'remote')
 c.queue(local);await c.flush();assert.equal(t.read().draft?.edits[0].title,'remote');await c.keepLocal();assert.equal(t.read().draft?.edits[0].title,'local');assert.equal(c.state.conflict,false);c.dispose()
})
test('network failure keeps pending edits for retry and cancellation waits for inflight save',async()=>{
 const draft=await fixture(),t=transport();let fail=true
 const c=new PlannerDraftSync({...t,save:async(revision,value)=>{if(fail)throw new Error('network unavailable');return t.save(revision,value)}},()=>{},10000)
 await c.start();c.queue(draft);await c.flush();assert.equal(t.read().revision,0);fail=false;await c.flush();assert.equal(t.read().revision,1)
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});const slow=new PlannerDraftSync({...t,save:async(revision,value)=>{await gate;return t.save(revision,value)}},()=>{},10000);await slow.start();slow.acceptRemote();const next=structuredClone(draft);next.edits[0].title='inflight';slow.queue(next);const saving=slow.flush();const closing=slow.clear();release();await saving;await closing;assert.equal(t.read().draft,null);c.dispose();slow.dispose()
})
test('StrictMode effect restart continues publishing state; accepting remote preserves tombstone version',async()=>{
 const t=transport();let updates=0;const c=new PlannerDraftSync(t,()=>{updates++},10000);const start=c.start();c.dispose();await c.start();await start;c.queue(await fixture());await c.flush();assert.ok(updates>0)
 t.external(null);await c.refresh();assert.equal(c.state.conflict,true);assert.equal(c.acceptRemote(),null);c.queue(await fixture());await c.flush();assert.equal(t.read().revision,3);c.dispose()
})

test('repeated close requests serialize once; a new preview waits behind clear',async()=>{
 const t=transport(),draft=await fixture();t.external(draft);let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve});let clears=0
 const c=new PlannerDraftSync({...t,clear:async revision=>{clears++;await gate;return t.clear(revision)}},()=>{},10000);await c.start();c.acceptRemote();const one=c.clear(),two=c.clear();assert.equal(one,two);const next=structuredClone(draft);next.edits[0].title='new preview';c.queue(next);await c.flush();release();await one;await c.flush();assert.equal(clears,1);assert.equal(t.read().draft?.edits[0].title,'new preview');c.dispose()
})

test('close racing another device refreshes its revision without deleting its changes',async()=>{
 const t=transport(),draft=await fixture();t.external(draft);const c=new PlannerDraftSync(t,()=>{},10000);await c.start();c.acceptRemote();const remote=structuredClone(draft);remote.edits[0].title='protected remote';t.external(remote);await c.clear();assert.equal(c.state.conflict,true);assert.equal(c.state.remote?.revision,2);assert.equal(t.read().draft?.edits[0].title,'protected remote');c.acceptRemote();await c.clear();assert.equal(t.read().draft,null);c.dispose()
})
