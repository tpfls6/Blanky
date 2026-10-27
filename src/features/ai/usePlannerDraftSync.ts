import { useCallback,useEffect,useState } from 'react'
import { loadPlannerDraft,savePlannerDraft,clearPlannerDraft } from '@blanky/api'
import type { PlannerDraft } from '@blanky/types'
import { getSupabaseClient,isSupabaseConfigured } from '../../services/supabase/client.ts'
import { PlannerDraftSync,type DraftSyncState } from './draftSync.ts'
export function usePlannerDraftSync(){
 const [state,setState]=useState<DraftSyncState>({ready:false,busy:false,conflict:false,remote:null,message:''})
 const [sync]=useState(()=>new PlannerDraftSync({load:()=>loadPlannerDraft(getSupabaseClient()),save:(revision,draft)=>savePlannerDraft(getSupabaseClient(),revision,draft),clear:revision=>clearPlannerDraft(getSupabaseClient(),revision)},setState))
 useEffect(()=>{if(!isSupabaseConfigured)return;void sync.start();const refresh=()=>{if(document.visibilityState==='visible')void sync.refresh();else void sync.flush()};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,20000);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);sync.dispose()}},[sync])
 const queue=useCallback((draft:PlannerDraft)=>{if(isSupabaseConfigured)sync.queue(draft)},[sync])
 return {state,sync,queue,enabled:isSupabaseConfigured}
}
