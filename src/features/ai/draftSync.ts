import type { PlannerDraft,PlannerDraftState } from '../../../packages/types/src/plannerDraft.ts'
export type DraftTransport={load:()=>Promise<PlannerDraftState>;save:(revision:number,draft:PlannerDraft)=>Promise<PlannerDraftState>;clear:(revision:number)=>Promise<PlannerDraftState>}
export type DraftSyncState={ready:boolean;busy:boolean;conflict:boolean;remote:PlannerDraftState|null;message:string}
const same=(a:PlannerDraft|null,b:PlannerDraft|null)=>JSON.stringify(a&&{input:a.input,token:a.plan.approval?.token,edits:a.edits,saved:a.saved})===JSON.stringify(b&&{input:b.input,token:b.plan.approval?.token,edits:b.edits,saved:b.saved})
/** Serializes local writes, coalesces typing, and never automatically resolves CAS conflicts. */
export class PlannerDraftSync{
 state:DraftSyncState={ready:false,busy:false,conflict:false,remote:null,message:''}
 private revision=0
 private local:PlannerDraft|null=null
 private acknowledged:PlannerDraft|null=null
 private pending:PlannerDraft|null=null
 private timer:ReturnType<typeof setTimeout>|undefined
 private running:Promise<void>|null=null
 private closing:Promise<void>|null=null
 private active=true
 private starting:Promise<void>|null=null
 private transport:DraftTransport
 private changed:(state:DraftSyncState)=>void
 private debounce:number
 constructor(transport:DraftTransport,changed:(state:DraftSyncState)=>void,debounce=1000){this.transport=transport;this.changed=changed;this.debounce=debounce}
 private emit(patch:Partial<DraftSyncState>){this.state={...this.state,...patch};if(this.active)this.changed(this.state)}
 start(){this.active=true;if(this.state.ready)this.emit({});return this.starting??=this.refresh(true)}
 async refresh(initial=false){
  if(this.running)return
  try{const remote=await this.transport.load();if(this.running)return
   if(initial){this.revision=remote.revision;this.acknowledged=remote.draft;const conflict=!!this.local&&!!remote.draft&&!same(this.local,remote.draft);this.emit({ready:true,remote,conflict,message:conflict?'다른 기기에 저장된 초안이 있어요. 사용할 초안을 선택해 주세요.':remote.draft?'저장된 초안을 불러왔어요.':''});if(!conflict&&this.local&&!same(this.local,this.acknowledged)){this.pending=this.local;this.schedule()}}
   else if(remote.revision!==this.revision||!same(remote.draft,this.state.remote?.draft??null)){this.emit({remote,conflict:!!this.local,message:this.local?'다른 기기에서 초안이 변경되었어요. 이 기기의 수정 내용은 유지됩니다.':'다른 기기의 초안을 불러올 수 있어요.'});if(!this.local){this.revision=remote.revision;this.acknowledged=remote.draft}}
  }catch(error){this.emit({ready:true,message:error instanceof Error?error.message:'초안 동기화에 실패했어요. 이 기기의 초안은 유지됩니다.'})}
 }
 queue(draft:PlannerDraft){this.local=structuredClone(draft);if(!this.running&&same(this.local,this.acknowledged)){this.pending=null;clearTimeout(this.timer);return;}this.pending=this.local;if(this.state.ready&&!this.state.conflict)this.schedule()}
 private schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush()},this.debounce)}
 flush():Promise<void>{
  clearTimeout(this.timer)
  if(this.closing)return Promise.resolve()
  if(this.running)return this.running
  if(!this.state.ready||this.state.conflict||!this.pending)return Promise.resolve()
  this.running=this.drain().finally(()=>{this.running=null})
  return this.running
 }
 private async drain(){
  this.emit({busy:true,message:'초안을 동기화하고 있어요…'})
  while(this.pending&&!this.state.conflict){const value=this.pending;this.pending=null
   try{const remote=await this.transport.save(this.revision,value);this.revision=remote.revision;this.acknowledged=value;if(!same(remote.draft,value)&&!same(remote.draft,this.local)){this.pending=this.local;this.emit({remote,conflict:true,message:'서버의 승인 상태가 달라요. 초안을 불러와 최신 상태를 확인해 주세요.'})}else this.emit({remote,message:'다른 기기에서도 이어서 수정할 수 있어요.'})}
   catch(error){this.pending=this.local;if(error&&typeof error==='object'&&'code' in error&&error.code==='DRAFT_CONFLICT'){try{const remote=await this.transport.load();this.emit({remote,conflict:true,message:'다른 기기에서 초안이 변경되었어요. 사용할 초안을 선택해 주세요.'})}catch{this.emit({conflict:true,message:'초안 버전이 달라요. 연결 후 다시 확인해 주세요.'})}}else this.emit({message:error instanceof Error?error.message:'초안을 동기화하지 못했어요. 이 기기의 내용은 유지됩니다.'});break}
  }
  this.emit({busy:false})
 }
 acceptRemote(){clearTimeout(this.timer);const remote=this.state.remote;if(!remote)return null;this.revision=remote.revision;this.local=remote.draft;this.acknowledged=remote.draft;this.pending=null;this.emit({conflict:false,message:remote.draft?'다른 기기의 초안을 불러왔어요.':'다른 기기에서 초안을 닫았어요.'});return remote.draft}
 async keepLocal(){if(!this.local)return;this.revision=this.state.remote?.revision??this.revision;this.acknowledged=null;this.pending=this.local;this.emit({conflict:false});await this.flush()}
 clear(){if(this.closing)return this.closing;this.closing=this.doClear().finally(()=>{this.closing=null;this.emit({busy:false});if(this.pending)void this.flush()});return this.closing}
 private async doClear(){this.emit({busy:true});clearTimeout(this.timer);this.pending=null;this.local=null;await this.start();await this.running;if(this.state.conflict){this.emit({message:'이 기기의 미리보기는 닫았어요. 다른 기기의 초안은 유지됩니다.'});return}try{const remote=await this.transport.clear(this.revision);this.revision=remote.revision;this.acknowledged=null;this.emit({remote,message:'모든 기기에서 초안을 닫았어요.'})}catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='DRAFT_CONFLICT'){try{const remote=await this.transport.load();this.emit({remote,conflict:true,message:'다른 기기의 변경을 보호하기 위해 서버 초안을 유지했어요. 불러오거나 서버 초안 닫기를 선택해 주세요.'})}catch{this.emit({conflict:true,message:'서버 초안을 정리하지 못했어요. 연결 후 다시 확인해 주세요.'})}}else this.emit({message:error instanceof Error?error.message:'이 기기에서는 닫았지만 서버 초안은 정리하지 못했어요. 다시 시도해 주세요.'})}}
 dispose(){clearTimeout(this.timer);void this.flush();this.active=false}
}
