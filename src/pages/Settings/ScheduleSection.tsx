import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { TASK_DURATIONS, type ScheduleTab, type TimelineDensity } from '../../types/records.ts'
import { Choice, Group, Section, SwitchRow } from './bits.tsx'

export function ScheduleSection() {
  const { t } = useI18n()
  const { settings, updateSettings } = useLibrary()
  const patch = (next: Partial<typeof settings>) => updateSettings(next)
  const minutes = (value: number) => patch({ taskDefaultDuration: value, defaultEventMinutes: value })

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
