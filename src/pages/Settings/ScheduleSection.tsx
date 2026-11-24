import { useState } from 'react'
import { SETTINGS_COMPACT_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { TASK_DURATIONS, type CalendarView, type ScheduleTab, type TimelineDensity } from '../../types/records.ts'
import { Choice, Group, Section, SwitchRow } from './bits.tsx'
import { MCard, MLabel, MRow, MSeg, MSheet, MSwitch, MTimeField } from './mobileRows.tsx'

export function ScheduleSection() {
  const { t } = useI18n()
  const { settings, updateSettings } = useLibrary()
  const patch = (next: Partial<typeof settings>) => updateSettings(next)
  const minutes = (value: number) => patch({ taskDefaultDuration: value, defaultEventMinutes: value })
  const compact = useMediaQuery(SETTINGS_COMPACT_QUERY)
  const [sheet, setSheet] = useState<'range' | 'duration' | null>(null)
  const [timeOpen, setTimeOpen] = useState<'start' | 'end' | null>('start')

  // Phones: short choices as segments on the right, times and durations in sheets. Every change saves as before.
  if (compact) {
    return (
      <div>
        <MLabel>{t('settings.mobile.scheduleDefaults')}</MLabel>
        <MCard>
          <MRow label={t('settings.mobile.defaultTab')}>
            <MSeg label={t('settings.schedule.defaultTab')} value={settings.defaultScheduleTab} onPick={(defaultScheduleTab) => patch({ defaultScheduleTab })}
              options={[['all', t('settings.schedule.tabAll')], ['timeline', t('settings.schedule.tabTimeline')], ['tasks', t('settings.schedule.tabTasks')]] as const satisfies readonly (readonly [ScheduleTab, string])[]} />
          </MRow>
          <MRow label={t('settings.schedule.weekStarts')}>
            <MSeg label={t('settings.schedule.weekStarts')} value={settings.weekStartsOn} onPick={(weekStartsOn) => patch({ weekStartsOn })}
              options={[[0, t('settings.schedule.sunday')], [1, t('settings.schedule.monday')]] as const} />
          </MRow>
          <MRow label={t('settings.mobile.dayRange')} value={`${settings.dayStartTime} – ${settings.dayEndTime}`} onPress={() => { setTimeOpen('start'); setSheet('range') }} data-settings-row="day-range" />
          <MRow label={t('settings.schedule.taskDuration')} value={t('settings.schedule.minutes', { count: settings.taskDefaultDuration })} onPress={() => setSheet('duration')} data-settings-row="task-duration" />
        </MCard>
        <MLabel>{t('settings.mobile.view')}</MLabel>
        <MCard>
          <MRow label={t('settings.mobile.density')}>
            <MSeg label={t('settings.schedule.density')} value={settings.timelineDensity} onPick={(timelineDensity) => patch({ timelineDensity })}
              options={[['compact', t('settings.schedule.compact')], ['default', t('settings.schedule.default')], ['comfortable', t('settings.schedule.comfortable')]] as const satisfies readonly (readonly [TimelineDensity, string])[]} />
          </MRow>
          <MRow label={t('settings.mobile.calendarView')}>
            <MSeg label={t('settings.schedule.calendarView')} value={settings.calendarView} onPick={(calendarView) => patch({ calendarView })}
              options={[['simple', t('settings.mobile.simple')], ['detailed', t('settings.mobile.detailed')]] as const satisfies readonly (readonly [CalendarView, string])[]} />
          </MRow>
          <MRow label={t('settings.schedule.taskView')}>
            <MSeg label={t('settings.schedule.taskView')} value={settings.taskView} onPick={(taskView) => patch({ taskView })}
              options={[['open', t('settings.schedule.openTasks')], ['all', t('settings.schedule.allTasks')]] as const} />
          </MRow>
        </MCard>
        <MLabel>{t('settings.schedule.notifications')}</MLabel>
        <MCard>
          <MSwitch label={t('settings.schedule.notifyEvents')} checked={settings.notifyEvents} onChange={() => patch({ notifyEvents: !settings.notifyEvents })} />
          <MSwitch label={t('settings.schedule.notifyTasks')} checked={settings.notifyTasks} onChange={() => patch({ notifyTasks: !settings.notifyTasks })} />
        </MCard>
        {sheet === 'range' ? (
          <MSheet title={t('settings.mobile.dayRange')} onClose={() => setSheet(null)}>
            <div className="more-times">
              <MTimeField label={t('settings.schedule.dayStart')} value={settings.dayStartTime} open={timeOpen === 'start'} onToggle={() => setTimeOpen(timeOpen === 'start' ? null : 'start')} onChange={(dayStartTime) => patch({ dayStartTime })} />
              <MTimeField label={t('settings.schedule.dayEnd')} value={settings.dayEndTime} open={timeOpen === 'end'} onToggle={() => setTimeOpen(timeOpen === 'end' ? null : 'end')} onChange={(dayEndTime) => patch({ dayEndTime })} />
            </div>
          </MSheet>
        ) : null}
        {sheet === 'duration' ? (
          <MSheet title={t('settings.schedule.taskDuration')} onClose={() => setSheet(null)}>
            <div className="more-options" role="radiogroup" aria-label={t('settings.schedule.taskDuration')}>
              {TASK_DURATIONS.map((value) => (
                <button key={value} type="button" role="radio" aria-checked={settings.taskDefaultDuration === value} onClick={() => { minutes(value); setSheet(null) }}>{t('settings.schedule.minutes', { count: value })}</button>
              ))}
            </div>
          </MSheet>
        ) : null}
      </div>
    )
  }

  return (
    <Section>
      <Group title={t('settings.calendar.scheduleTitle')} description={t('settings.calendar.scheduleHint')}>
        <div>
          <p className="text-sm">{t('settings.schedule.defaultTab')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.schedule.defaultTab')}>
            {([
              ['all', t('settings.schedule.tabAll')],
              ['timeline', t('settings.schedule.tabTimeline')],
              ['tasks', t('settings.schedule.tabTasks')],
            ] as [ScheduleTab, string][]).map(([value, label]) => (
              <Choice key={value} value={value} current={settings.defaultScheduleTab} label={label} onPick={(defaultScheduleTab) => patch({ defaultScheduleTab })} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm">{t('settings.schedule.weekStarts')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.schedule.weekStarts')}>
            <Choice value={0} current={settings.weekStartsOn} label={t('settings.schedule.sunday')} onPick={(weekStartsOn) => patch({ weekStartsOn })} />
            <Choice value={1} current={settings.weekStartsOn} label={t('settings.schedule.monday')} onPick={(weekStartsOn) => patch({ weekStartsOn })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="text-sm">
            {t('settings.schedule.dayStart')}
            <input type="time" value={settings.dayStartTime} onChange={(event) => patch({ dayStartTime: event.target.value })} className="field mt-1 block" />
          </label>
          <label className="text-sm">
            {t('settings.schedule.dayEnd')}
            <input type="time" value={settings.dayEndTime} onChange={(event) => patch({ dayEndTime: event.target.value })} className="field mt-1 block" />
          </label>
        </div>
        <label className="block text-sm">
          {t('settings.schedule.taskDuration')}
          <select
            value={settings.taskDefaultDuration}
            onChange={(event) => minutes(Number(event.target.value))}
            className="field select mt-1 block w-28"
          >
            {TASK_DURATIONS.map((value) => (
              <option key={value} value={value}>{t('settings.schedule.minutes', { count: value })}</option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-sm">{t('settings.schedule.density')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.schedule.density')}>
            {([
              ['compact', t('settings.schedule.compact')],
              ['default', t('settings.schedule.default')],
              ['comfortable', t('settings.schedule.comfortable')],
            ] as const satisfies readonly [TimelineDensity, string][]).map(([value, label]) => (
              <Choice key={value} value={value} current={settings.timelineDensity} label={label} onPick={(timelineDensity) => patch({ timelineDensity })} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm">{t('settings.schedule.calendarView')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.schedule.calendarView')}>
            {([
              ['simple', t('settings.schedule.calendarSimple')],
              ['detailed', t('settings.schedule.calendarDetailed')],
            ] as const satisfies readonly [CalendarView, string][]).map(([value, label]) => (
              <Choice key={value} value={value} current={settings.calendarView} label={label} onPick={(calendarView) => patch({ calendarView })} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm">{t('settings.schedule.taskView')}</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={t('settings.schedule.taskView')}>
            <Choice value="open" current={settings.taskView} label={t('settings.schedule.openTasks')} onPick={(taskView) => patch({ taskView })} />
            <Choice value="all" current={settings.taskView} label={t('settings.schedule.allTasks')} onPick={(taskView) => patch({ taskView })} />
          </div>
        </div>
        <div>
          <p className="text-sm">{t('settings.schedule.notifications')}</p>
          <div className="mt-3 space-y-3">
            <SwitchRow label={t('settings.schedule.notifyEvents')} checked={settings.notifyEvents} onChange={() => patch({ notifyEvents: !settings.notifyEvents })} />
            <SwitchRow label={t('settings.schedule.notifyTasks')} checked={settings.notifyTasks} onChange={() => patch({ notifyTasks: !settings.notifyTasks })} />
          </div>
        </div>
      </Group>
    </Section>
  )
}
