import type { SchedulingSettings } from '../../types/src/planning.ts'
import { AnalysisError, isCalendarDate } from '../../types/src/aiSchema.ts'
import { dateDistance, epoch, localDate, nextDate, weekday } from './time.ts'

export function schedulingSettings(overrides: Partial<SchedulingSettings> = {}, now = new Date().toISOString()): SchedulingSettings {
  overrides=Object.fromEntries(Object.entries(overrides).filter(([,value])=>value!==undefined)) as Partial<SchedulingSettings>
  const timezone = overrides.timezone ?? 'Asia/Seoul'
  let today: string
  try { today = localDate(overrides.now ?? now, timezone) } catch { throw new AnalysisError('INVALID_INPUT', '타임존 또는 현재 시각을 확인해 주세요.') }
  const startDate = overrides.startDate ?? today
  if (!isCalendarDate(startDate)) throw new AnalysisError('INVALID_INPUT', '시작 날짜를 확인해 주세요.')
  const result: SchedulingSettings = { timezone, startDate, endDate: nextDate(startDate, 7 - weekday(startDate)), workDays: [1, 2, 3, 4, 5, 6, 7],
    dayStartTime: '09:00', dayEndTime: '21:00', maxDailyMinutes: 240, breakMinutes: 10, minBlockMinutes: 25, maxBlockMinutes: 90,
    defaultDurationMinutes: 60, repeatOnSeparateDays: true, allowSplit: true, placementMode: 'earliest', preferredStartTime: null, preferredEndTime: null, useManualHistory: false, now, ...overrides }
  validateSettings(result)
  return result
}
export function validateSettings(settings: SchedulingSettings): void {
  const invalid = () => { throw new AnalysisError('INVALID_INPUT', '작업 가능 시간, 날짜 범위와 배치 설정을 확인해 주세요.') }
  if (typeof settings.repeatOnSeparateDays !== 'boolean') invalid()
  if (!isCalendarDate(settings.startDate) || !isCalendarDate(settings.endDate) || settings.startDate > settings.endDate || dateDistance(settings.startDate, settings.endDate) > 30) invalid()
  if (!Array.isArray(settings.workDays) || !settings.workDays.length || new Set(settings.workDays).size !== settings.workDays.length || settings.workDays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) invalid()
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!clock.test(settings.dayStartTime) || !clock.test(settings.dayEndTime) || settings.dayStartTime >= settings.dayEndTime) invalid()
  for (const key of ['maxDailyMinutes', 'minBlockMinutes', 'maxBlockMinutes', 'defaultDurationMinutes'] as const) if (!Number.isInteger(settings[key]) || settings[key] < 1 || settings[key] > 1440) invalid()
  if (!Number.isInteger(settings.breakMinutes) || settings.breakMinutes < 0 || settings.breakMinutes > 240 || settings.minBlockMinutes > settings.maxBlockMinutes) invalid()
  if (settings.allowSplit !== undefined && typeof settings.allowSplit !== 'boolean') invalid()
  if (settings.useManualHistory !== undefined && typeof settings.useManualHistory !== 'boolean') invalid()
  if (settings.placementMode !== undefined && !['earliest','focus'].includes(settings.placementMode)) invalid()
  if (settings.preferredStartTime || settings.preferredEndTime) {
    if (!clock.test(settings.preferredStartTime ?? '') || !clock.test(settings.preferredEndTime ?? '') || settings.preferredStartTime! >= settings.preferredEndTime! || settings.preferredStartTime! < settings.dayStartTime || settings.preferredEndTime! > settings.dayEndTime) invalid()
  }
  try { epoch(settings.now); localDate(settings.now, settings.timezone) } catch { invalid() }
}
