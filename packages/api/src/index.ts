export { getCurrentUserId, signInWithPassword, signInWithGoogle, signOut } from './auth.ts'
export { PARSE_SCHEDULE_FUNCTION, mapParsedSchedule, parseScheduleFromText, analyzeScheduleFromText } from './ai.ts'
export { createCategoryRepository, mapCategoryRow } from './categoryRepository.ts'
export type { CategoryInput, CategoryRepository } from './categoryRepository.ts'
export { AppError, mapDbError } from './errors.ts'
export { createFeedbackRepository, mapFeedbackRow } from './feedbackRepository.ts'
export type { FeedbackInput, FeedbackRepository } from './feedbackRepository.ts'
export { createNotificationRepository } from './notificationRepository.ts'
export type { NotificationRepository } from './notificationRepository.ts'
export { createPreferenceRepository, mapPreferenceRow } from './preferenceRepository.ts'
export type { PreferenceRepository } from './preferenceRepository.ts'
export { createRecordRepository, mapCustomRecordRow, mapCustomRecordTypeRow } from './recordRepository.ts'
export type { CustomRecordInput, CustomRecordTypeInput, RecordRepository } from './recordRepository.ts'
export { createScheduleRepository, mapScheduleRow } from './scheduleRepository.ts'
export type { ScheduleRepository } from './scheduleRepository.ts'
export { mapBatchError, parseScheduleBatchResult } from './scheduleBatch.ts'
export type { ScheduleBatchGoogle, ScheduleBatchResult, ScheduleBatchStatus } from './scheduleBatch.ts'
export {
  createSupabaseClient,
  isSupabaseConfigValid,
} from './supabase.ts'
export type { SupabasePublicConfig } from './supabase.ts'
export type { Database } from './database.generated.ts'
export type { SupabaseClient } from '@supabase/supabase-js'

export { createCalendarRepository, mapCalendarRow } from './calendarRepository.ts'
export type { CalendarRepository } from './calendarRepository.ts'
export { createCalendarSyncClient } from './calendarSync/client.ts'
export type { CalendarSyncClient } from './calendarSync/client.ts'
export type {
  CalendarError,
  CalendarErrorCode,
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
  LastSync,
  SyncReport,
} from '../../types/src/calendarSync.ts'

export * from './themeRepository.ts'
export * from './templateRepository.ts'

export { createDiaryRepository, diaryTitle, mapDiaryRecord } from './diaryRepository.ts'
export type { DiaryRecord } from './diaryRepository.ts'

export * from './readingRepository.ts'
export * from './bookSearch.ts'
export { PLAN_TASKS_FUNCTION, planTasksFromText } from './planning.ts'
export { approvePlanner } from './plannerApproval.ts'

export { replanTasks } from './planning.ts'

export { loadPlannerDraft,savePlannerDraft,clearPlannerDraft } from './plannerDraft.ts'
