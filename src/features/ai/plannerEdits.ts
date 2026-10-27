import type { PlannerEdit } from '../../../packages/types/src/planning.ts'
/** User edits are the draft source of truth; no regeneration overwrites this draft. */
export function patchPlannerEdit(edit:PlannerEdit,patch:Partial<PlannerEdit>):PlannerEdit {
 const next={...edit,...patch}
 const clock=(text:string)=>{const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);return match?Number(match[1])*60+Number(match[2]):null}
 const start=clock(next.startTime)
 if(patch.durationMinutes!==undefined&&start!==null&&Number.isInteger(patch.durationMinutes)) {
  const end=start+patch.durationMinutes
  next.endTime=end<1440?`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`:''
 } else if(patch.startTime!==undefined&&start!==null) {
  const end=start+next.durationMinutes
  next.endTime=end<1440?`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`:''
 } else if(patch.endTime!==undefined&&start!==null) {
  const end=clock(next.endTime);if(end!==null)next.durationMinutes=end-start
 }
 return next
}
