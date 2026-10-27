import { planningPreferences, manualHistorySamples } from '../../../packages/scheduling/src/preferences.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../../../packages/api/src/database.generated.ts'
import { createScheduleRepository } from '../../../packages/api/src/scheduleRepository.ts'
import { createPreferenceRepository } from '../../../packages/api/src/preferenceRepository.ts'
import { createCalendarRepository } from '../../../packages/api/src/calendarRepository.ts'
import { createOpenAIPlanningProvider } from '../../../packages/parse/src/planningProvider.ts'
import { AnalysisError } from '../../../packages/types/src/aiSchema.ts'
import { createPlanTasksHandler } from './handler.ts'
import { sealPlanner } from '../_shared/plannerToken.ts'
declare const Deno: { serve: (handler: (request: Request) => Promise<Response>) => void; env: { get(key: string): string | undefined } }

Deno.serve(createPlanTasksHandler({
  authenticate: async request => {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_ANON_KEY'), token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!url || !key || !token) return null
    const client = createClient<Database>(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    const userId = data.user.id
    const calendars = () => createCalendarRepository(client).getCalendars()
    return {
      userId,
      now: new Date(Date.now()+5*60*1000).toISOString(), // leave time to review before approval
      provider: createOpenAIPlanningProvider({ key: Deno.env.get('AI_PROVIDER') === 'local' ? undefined : Deno.env.get('OPENAI_API_KEY'), model: Deno.env.get('OPENAI_PLANNING_MODEL') }),
      loadSettings: async () => {
        const preference = await createPreferenceRepository(client).get(userId)
        return planningPreferences(preference)
      },
      loadSchedules: async (start, end) => {
        const [rows, ownedCalendars] = await Promise.all([createScheduleRepository(client).listForPlanning(start, end), calendars()])
        return rows.map(row => {
          const calendar = ownedCalendars.find(calendar => calendar.id === row.calendarId)
          if (!calendar) throw new AnalysisError('SCHEDULE_DATA_INVALID', '일정 캘린더의 타임존을 확인할 수 없어요.')
          return { ...row, kind:row.plannerApprovalKey?'task' as const:row.kind, timezone: calendar.timezone }
        })
      },
      loadManualHistory: async () => {
        const {data,error}=await client.from('schedule_changes').select('after_data,source,action').eq('user_id',userId).order('created_at',{ascending:false}).limit(100)
        if(error)throw new AnalysisError('PLANNING_FAILED','직접 수정 이력을 읽지 못했어요.')
        return manualHistorySamples(data??[])
      },
      loadCategories: async () => {
        const { data, error } = await client.from('categories').select('id,name,parent_id')
        if (error) throw new AnalysisError('PLANNING_FAILED', '카테고리를 읽지 못했어요.')
        return data.map(row => ({ id: row.id, name: row.name, parentId: row.parent_id }))
      },
    }
  },
  seal:(plan,authenticated,input)=>sealPlanner(plan,authenticated.userId!,Deno.env.get('PLANNER_SIGNING_SECRET')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',Date.now(),input),
  log: entry => console.log(JSON.stringify(entry)),
}))
