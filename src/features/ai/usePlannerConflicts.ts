import { useEffect, useState } from 'react'
import { inspectPlannerConflicts } from '../../services/ai/index.ts'
export function usePlannerConflicts(items:unknown){
 const [conflicts,setConflicts]=useState<{id:string;title:string;date:string}[]>([]),[error,setError]=useState('')
 useEffect(()=>{let active=true;void inspectPlannerConflicts().then(rows=>{if(active){setConflicts(rows);setError('')}}).catch(error=>{if(active)setError(error instanceof Error?error.message:'충돌을 확인하지 못했어요.')});return()=>{active=false}},[items])
 return {conflicts,setConflicts,error,setError}
}
