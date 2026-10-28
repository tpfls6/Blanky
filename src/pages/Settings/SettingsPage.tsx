import { PlanningPreferences } from './PlanningPreferences.tsx'
import { useConfirm } from '../../state/useConfirm.ts'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, CalendarRange, Languages, Palette, PanelLeft, Plus, Sparkles, Tag, User, type LucideIcon } from 'lucide-react'
import { APP_LOCALES, type AppLocale } from '../../i18n/locale.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { TextField } from '../../components/common/TextField.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { ACCENTS, accentHex } from '../../theme/accent.ts'
import { TASK_DURATIONS, type HomeInputDefault, type ScheduleTab, type Settings, type TimelineDensity } from '../../types/records.ts'
import { CategorySection } from './CategorySection.tsx'
import { GoogleCalendarSection } from './GoogleCalendarSection.tsx'
import { NavSection } from './NavSection.tsx'
import { Choice, ConfirmDialog, Section, SwitchRow } from './bits.tsx'

const SECTIONS = [
  { id: 'general', key: 'general', icon: Languages },
  { id: 'planning', key: 'planning', icon: Sparkles },
  { id: 'account', key: 'account', icon: User },
  { id: 'appearance', key: 'appearance', icon: Palette },
  { id: 'navigation', key: 'navigation', icon: PanelLeft },
  { id: 'schedule', key: 'schedule', icon: CalendarDays },
  { id: 'google-calendar', key: 'googleCalendar', icon: CalendarRange },
  { id: 'categories', key: 'categories', icon: Tag },
  { id: 'input', key: 'input', icon: Sparkles },
] as const satisfies readonly { id: string; key: string; icon: LucideIcon }[]

function CustomAccent({
  accent,
  saved,
  onPick,
  onSave,
}: {
  accent: string
  saved: string[]
  onPick: (accent: string) => void
  onSave: (saved: string[]) => void
}) {
  const hex = accentHex(accent).toLowerCase()
  const kept = saved.includes(hex)
  const full = saved.length >= 8

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
      <label className="relative flex h-7 cursor-pointer items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2 text-xs text-neutral-500">
        <Plus className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
        커스텀 색상
        <input
          type="color"
          aria-label="커스텀 색상 선택"
          value={hex}
          onInput={(event) => onPick(event.currentTarget.value)}
          onChange={(event) => onPick(event.currentTarget.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <span className="inline-flex items-center gap-2 text-xs text-neutral-500">
        <span aria-hidden="true" className="size-4 rounded-full border border-line" style={{ backgroundColor: hex }} />
        {hex.toUpperCase()}
      </span>
      <button
        type="button"
        className="btn btn-line"
        disabled={kept || full}
        onClick={() => onSave([hex, ...saved])}
      >
        {kept ? '저장됨' : '색상 저장'}
      </button>
      </div>
      <p className="text-xs text-neutral-400" role="status">
        {full && !kept ? '최대 8개까지 저장할 수 있습니다. 기존 색상을 삭제한 뒤 저장해 주세요.' : '색상을 선택한 뒤 저장하세요. 저장한 색상은 아래에서 다시 선택할 수 있습니다.'}
      </p>
      {saved.length > 0 ? <p className="text-xs text-neutral-400">저장한 색상 · {saved.length}/8</p> : null}
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="저장한 커스텀 색상">
      {saved.map((color) => (
        <span key={color} className="inline-flex items-center gap-1">
          <button
            type="button"
            aria-label={`${color.toUpperCase()} 적용`}
            title={color.toUpperCase()}
            aria-pressed={hex === color}
            onClick={() => onPick(color)}
            className="size-6 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: hex === color ? '0 0 0 2px var(--bg), 0 0 0 4px var(--fg)' : undefined,
            }}
          />
          <button type="button" aria-label={`${color} 삭제`} onClick={() => onSave(saved.filter((item) => item !== color))} className="text-xs text-neutral-400">
            ×
          </button>
        </span>
      ))}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const confirm = useConfirm()
  const { t, locale, setLocale } = useI18n()

  const navigate = useNavigate()
  const params = useParams()
  const section = SECTIONS.find((item) => item.id === params.section)
  const sectionLabel = section ? t(`settings.${section.key}.label`) : ''
  const sectionDescription = section ? t(`settings.${section.key}.description`) : ''
  const { user, updateProfile, changePassword, signOut, deleteAccount } = useSession()
  const { settings, updateSettings, resetPreferences } = useLibrary()
  const [resetOpen, setResetOpen] = useState(false)
  const [name, setName] = useState(user?.name ?? '')
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null)
  const [profileMessage, setProfileMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  if (!user) return null
  if (params.section === 'custom-records') return <Navigate to="/custom?panel=records" replace />
  if (!section) return <Navigate to="/settings/general" replace />
  const id = section.id

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    const message = await updateProfile({ name, nickname, email, avatar })
    setProfileMessage(message ?? t('settings.account.profileSaved'))
  }

  const savePassword = async (event: FormEvent) => {
    event.preventDefault()
    const message = await changePassword(currentPassword, nextPassword, confirmPassword)
    setPasswordMessage(message ?? t('settings.account.passwordChanged'))
    if (!message) {
      setCurrentPassword('')
      setNextPassword('')
      setConfirmPassword('')
    }
  }

  const patch = (next: Partial<Settings>) => updateSettings(next)
  const minutes = (value: number) => patch({ taskDefaultDuration: value, defaultEventMinutes: value })

  let body: ReactNode = null
  if (id === 'general') {
    body = (
      <Section>
        <div>
          <p className="text-sm">{t('settings.general.language')}</p>
          <p className="mt-1 text-xs text-neutral-400">{t('settings.general.languageHint')}</p>
          <label className="mt-3 block text-sm">
            <span className="sr-only">{t('settings.general.language')}</span>
            <select
              className="field select mt-1 block w-52 max-w-full"
              value={locale}
              onChange={(event) => setLocale(event.target.value as AppLocale)}
            >
              {APP_LOCALES.map((value) => (
                <option key={value} value={value}>{t(value === 'ko' ? 'settings.general.korean' : 'settings.general.english')}</option>
              ))}
            </select>
          </label>
        </div>
      </Section>
    )
  } else if (id === 'account') {
    body = (
      <Section>
        <div>
          <p className="text-sm">{t('settings.account.profile')}</p>
          <form onSubmit={saveProfile} className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs text-neutral-400">
              {avatar ? <img src={avatar} alt="" className="size-full object-cover" /> : t('settings.account.photo')}
            </div>
            <label className="text-sm text-neutral-500">
              {t('settings.account.profileImage')}
              <input
                type="file"
                accept="image/*"
                className="mt-1 block text-xs"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (file.size > 350_000) {
                    setProfileMessage(t('settings.account.imageTooLarge'))
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => setAvatar(String(reader.result))
                  reader.readAsDataURL(file)
                }}
              />
            </label>
          </div>
          <TextField label={t('settings.account.name')} value={name} onChange={setName} />
          <TextField label={t('settings.account.nickname')} value={nickname} onChange={setNickname} />
          <TextField label={t('settings.account.email')} type="email" value={email} onChange={setEmail} />
          {profileMessage ? <p className="text-sm text-neutral-500">{profileMessage}</p> : null}
          <button type="submit" className="btn btn-primary">{t('settings.account.saveProfile')}</button>
          </form>
        </div>
        <div>
          <p className="text-sm">{t('settings.account.changePassword')}</p>
          <form onSubmit={savePassword} className="mt-4 space-y-4">
          <TextField label={t('settings.account.currentPassword')} type="password" value={currentPassword} onChange={setCurrentPassword} />
          <TextField label={t('settings.account.newPassword')} type="password" value={nextPassword} onChange={setNextPassword} />
          <TextField label={t('settings.account.confirmPassword')} type="password" value={confirmPassword} onChange={setConfirmPassword} />
          {passwordMessage ? <p className="text-sm text-neutral-500">{passwordMessage}</p> : null}
          <button type="submit" className="btn btn-primary">{t('settings.account.changePassword')}</button>
          </form>
        </div>
        <div className="flex gap-4 text-sm">
          <button type="button" className="btn btn-ghost" onClick={async () => { try { await signOut(); navigate(ROUTES.login) } catch { setProfileMessage(t('settings.account.signOutFailed')) } }}>{t('settings.account.signOut')}</button>
          <button
            type="button"
            className="text-neutral-400"
            onClick={async () => {
              if (!await confirm(t('settings.account.deleteAccountConfirm'))) return
              const message = await deleteAccount()
              if (message) { setProfileMessage(message); return }
              navigate(ROUTES.login)
            }}
          >
            {t('settings.account.deleteAccount')}
          </button>
        </div>
      </Section>
    )
  } else if (id === 'appearance') {
    body = (
      <Section>
        <p className="text-sm text-neutral-500">커스텀 테마가 적용되어 있으면 아래 색상 설정보다 우선합니다. <Link className="text-accent-text" to="/settings/themes">내 테마 관리</Link>에서 기존 설정으로 돌아갈 수 있습니다.</p>
        <div>
          <p className="text-sm">{t('settings.appearance.theme')}</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label={t('settings.appearance.theme')}>
            <Choice value="light" current={settings.theme} label={t('settings.appearance.light')} onPick={(theme) => patch({ theme })} />
            <Choice value="dark" current={settings.theme} label={t('settings.appearance.dark')} onPick={(theme) => patch({ theme })} />
            <Choice value="system" current={settings.theme} label={t('settings.appearance.system')} onPick={(theme) => patch({ theme })} />
          </div>
        </div>
        <div>
          <p className="text-sm">{t('settings.appearance.accent')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label={t('settings.appearance.accent')}>
            {ACCENTS.map((accent) => {
              const selected = settings.accent === accent.id
              return (
                <button
                  key={accent.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={accent.label}
                  onClick={() => patch({ accent: accent.id })}
                  className="size-6 rounded-full"
                  style={{
                    backgroundColor: accent.light.color,
                    boxShadow: selected ? '0 0 0 2px var(--bg), 0 0 0 4px var(--fg)' : undefined,
                  }}
                />
              )
            })}
          </div>
          <CustomAccent
            accent={settings.accent}
            saved={settings.savedAccents}
            onPick={(accent) => patch({ accent })}
            onSave={(savedAccents) => patch({ savedAccents })}
          />
        </div>
      </Section>
    )
  } else if (id === 'navigation') {
    body = (
      <Section>
        <NavSection />
      </Section>
    )
  } else if (id === 'schedule') {
    body = (
      <Section>
        <p className="text-sm text-neutral-500">
          <Link className="text-accent-text" to="/settings/google-calendar">{t('settings.schedule.googleLink')}</Link>
        </p>
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
          <p className="text-sm">주 시작 요일</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="주 시작 요일">
            <Choice value={0} current={settings.weekStartsOn} label="일요일" onPick={(weekStartsOn) => patch({ weekStartsOn })} />
            <Choice value={1} current={settings.weekStartsOn} label="월요일" onPick={(weekStartsOn) => patch({ weekStartsOn })} />
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="text-sm">
            하루 시작 시간
            <input type="time" value={settings.dayStartTime} onChange={(event) => patch({ dayStartTime: event.target.value })} className="field mt-1 block" />
          </label>
          <label className="text-sm">
            하루 종료 시간
            <input type="time" value={settings.dayEndTime} onChange={(event) => patch({ dayEndTime: event.target.value })} className="field mt-1 block" />
          </label>
        </div>
        <label className="block text-sm">
          할 일 기본 소요 시간
          <select
            value={settings.taskDefaultDuration}
            onChange={(event) => minutes(Number(event.target.value))}
            className="field select mt-1 block w-28"
          >
            {TASK_DURATIONS.map((value) => (
              <option key={value} value={value}>{value}분</option>
            ))}
          </select>
        </label>
        <div>
          <p className="text-sm">Timeline 표시 밀도</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Timeline 표시 밀도">
            {([
              ['compact', 'Compact'],
              ['default', 'Default'],
              ['comfortable', 'Comfortable'],
            ] as const satisfies readonly [TimelineDensity, string][]).map(([value, label]) => (
              <Choice key={value} value={value} current={settings.timelineDensity} label={label} onPick={(timelineDensity) => patch({ timelineDensity })} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm">할 일 기본 표시</p>
          <div className="mt-2 flex gap-1" role="radiogroup">
            <Choice value="open" current={settings.taskView} label="남은 일" onPick={(taskView) => patch({ taskView })} />
            <Choice value="all" current={settings.taskView} label="전체" onPick={(taskView) => patch({ taskView })} />
          </div>
        </div>
        <div>
          <p className="text-sm">알림</p>
          <div className="mt-3 space-y-3">
            <SwitchRow label="일정 알림" checked={settings.notifyEvents} onChange={() => patch({ notifyEvents: !settings.notifyEvents })} />
            <SwitchRow label="할 일 마감 알림" checked={settings.notifyTasks} onChange={() => patch({ notifyTasks: !settings.notifyTasks })} />
          </div>
        </div>
      </Section>
    )
  } else if (id === 'google-calendar') {
    body = (
      <Section>
        <GoogleCalendarSection />
      </Section>
    )
  } else if (id === 'categories') {
    body = (
      <Section>
        <CategorySection />
      </Section>
    )
  } else if (id === 'planning') {
    body = <Section><PlanningPreferences /></Section>
  } else if (id === 'input') {
    body = (
      <Section>
        <div>
          <p className="text-sm">Home 기본 입력 유형</p>
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Home 기본 입력 유형">
            {([
              ['auto', '자동 분류'],
              ['schedule', '일정'],
              ['task', '할 일'],
              ['diary', '일기'],
              ['memo', '메모'],
              ['reading', '독서 기록'],
              ['last', '마지막 사용 유형 유지'],
            ] as const satisfies readonly [HomeInputDefault, string][]).map(([value, label]) => (
              <Choice key={value} value={value} current={settings.homeDefaultInput} label={label} onPick={(homeDefaultInput) => patch({ homeDefaultInput })} />
            ))}
          </div>
        </div>
        <SwitchRow
          label="자동 분류 사용"
          hint="끄면 Home에서 유형을 직접 고른 뒤에만 저장됩니다."
          checked={settings.autoClassify}
          onChange={() => patch({ autoClassify: !settings.autoClassify })}
        />
        <SwitchRow
          label="AI 분석 후 바로 저장"
          hint="끄면 분류 결과를 확인한 뒤 저장합니다."
          checked={settings.autoSaveAfterClassify}
          onChange={() => patch({ autoSaveAfterClassify: !settings.autoSaveAfterClassify })}
        />
      </Section>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl items-start gap-8 px-6 py-8 md:px-10 lg:gap-14">
      <nav aria-label={t('settings.menu')} className="sticky top-8 hidden w-48 shrink-0 overflow-hidden rounded-md border border-line bg-surface px-3 py-4 lg:block">
        <p className="px-3 pb-3 text-sm font-medium tracking-tight">{t('settings.title')}</p>
        <div className="flex flex-col gap-0.5">
          {SECTIONS.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.id} to={`/settings/${item.id}`} className="settings-link">
                <Icon strokeWidth={1.5} aria-hidden="true" />
                {t(`settings.${item.key}.label`)}
              </NavLink>
            )
          })}
        </div>
      </nav>
      <div className="min-w-0 flex-1 overflow-hidden rounded-md border border-line bg-surface px-6 py-6">
        <label className="mb-6 block lg:hidden">
          <span className="sr-only">{t('settings.menu')}</span>
          <select
            className="field select w-full"
            value={id}
            onChange={(event) => navigate(`/settings/${event.target.value}`)}
          >
            {SECTIONS.map((item) => (
              <option key={item.id} value={item.id}>{t(`settings.${item.key}.label`)}</option>
            ))}
          </select>
        </label>
        <h1 className="text-2xl font-medium tracking-tight">{sectionLabel}</h1>
        <p className="mt-2 text-sm text-neutral-400">{sectionDescription}</p>
        <div className="mt-8">{body}</div>
        <div className="mt-10 border-t border-line pt-6">
          <button type="button" className="text-sm text-neutral-400" onClick={() => setResetOpen(true)}>
            {t('settings.reset')}
          </button>
        </div>
      </div>
      {resetOpen ? (
        <ConfirmDialog
          title={t('settings.resetTitle')}
          body={t('settings.resetBody')}
          confirmLabel={t('settings.resetConfirm')}
          onCancel={() => setResetOpen(false)}
          onConfirm={() => {
            resetPreferences()
            setResetOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
