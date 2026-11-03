import type { ReactElement } from 'react'
import type {
  CalendarErrorCode,
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
  IsoDateTime,
  LastSync,
  SyncReport,
} from '@blanky/types'

export const GOOGLE_CALENDAR_SECTION = {
  id: 'google-calendar',
  label: 'Google Calendar',
  description: 'Google 계정과 캘린더 동기화를 관리합니다.',
} as const

export const AUTO_SYNC_STALE_MS = 5 * 60 * 1000

export function googleCalendarPath(): `/settings/${typeof GOOGLE_CALENDAR_SECTION.id}` {
  return `/settings/${GOOGLE_CALENDAR_SECTION.id}`
}

export type ConsentKind = 'connect' | 'retry' | 'reconnect'

export type DisconnectKind = 'hidden' | 'leave' | 'policy'

export type RecoverableError = Extract<
  CalendarErrorCode,
  'GOOGLE_DENIED' | 'NOT_CONNECTED' | 'UNAUTHENTICATED' | 'GOOGLE_HTTP'
>

export type VisibleControls = {
  intro: boolean
  consent: ConsentKind | null
  accountEmail: string | null
  calendarPick: boolean
  calendarBound: string | null
  firstImport: boolean
  autoSync: boolean | null
  manualSync: boolean
  lastSync: LastSync | null
  disconnect: DisconnectKind
}

export function visibleControls(view: ConnectionView): VisibleControls {
  switch (view.status) {
    case 'disconnected':
      return {
        intro: true,
        consent: 'connect',
        accountEmail: null,
        calendarPick: false,
        calendarBound: null,
        firstImport: false,
        autoSync: null,
        manualSync: false,
        lastSync: null,
        disconnect: 'hidden',
      }
    case 'awaiting_consent':
      return {
        intro: false,
        consent: 'retry',
        accountEmail: null,
        calendarPick: false,
        calendarBound: null,
        firstImport: false,
        autoSync: null,
        manualSync: false,
        lastSync: null,
        disconnect: 'leave',
      }
    case 'connected':
      return {
        intro: false,
        consent: null,
        accountEmail: view.accountEmail,
        calendarPick: true,
        calendarBound: null,
        firstImport: true,
        autoSync: null,
        manualSync: false,
        lastSync: null,
        disconnect: 'leave',
      }
    case 'ready':
      return {
        intro: false,
        consent: null,
        accountEmail: view.accountEmail,
        calendarPick: false,
        calendarBound: view.calendarSummary,
        firstImport: false,
        autoSync: view.autoSync,
        manualSync: true,
        lastSync: view.lastSync,
        disconnect: 'policy',
      }
    case 'needs_reauth':
      return {
        intro: false,
        consent: 'reconnect',
        accountEmail: view.accountEmail,
        calendarPick: false,
        calendarBound: view.calendarSummary,
        firstImport: false,
        autoSync: null,
        manualSync: false,
        lastSync: null,
        disconnect: 'policy',
      }
    case 'error':
      return {
        intro: false,
        consent: isRecoverableError(view.code) ? 'retry' : null,
        accountEmail: null,
        calendarPick: false,
        calendarBound: null,
        firstImport: false,
        autoSync: null,
        manualSync: false,
        lastSync: null,
        disconnect: 'leave',
      }
  }
}

export function isRecoverableError(code: CalendarErrorCode): code is RecoverableError {
  return (
    code === 'GOOGLE_DENIED'
    || code === 'NOT_CONNECTED'
    || code === 'UNAUTHENTICATED'
    || code === 'GOOGLE_HTTP'
  )
}

export function shouldLeaveScheduleForSetup(view: ConnectionView): boolean {
  return view.status === 'connected' || view.status === 'awaiting_consent'
}

export function shouldAutoSync(view: ConnectionView, nowMs: number): boolean {
  if (view.status !== 'ready' || !view.autoSync) return false
  const at = Date.parse(view.lastSync.at)
  if (!Number.isFinite(at)) return false
  return nowMs - at >= AUTO_SYNC_STALE_MS
}

export type CalendarPickDraft = {
  googleCalendarId: GoogleCalendarId | null
  firstImport: FirstImport
}

export function initialPick(calendars: readonly GoogleCalendarChoice[]): CalendarPickDraft {
  const primary = calendars.find((item) => item.primary)
  const first = primary ?? calendars[0]
  return {
    googleCalendarId: first?.id ?? null,
    firstImport: { direction: 'from_google' },
  }
}

export type Notice =
  | { tone: 'ok'; text: string }
  | { tone: 'problem'; text: string }

export function noticeFromUnknown(error: unknown): Notice {
  const code = errorCode(error)
  if (code === 'GOOGLE_ENV_MISSING') {
    return { tone: 'problem', text: 'Google Calendar 비밀값이 Edge Function에 없습니다.' }
  }
  if (code === 'UNAUTHENTICATED') return { tone: 'problem', text: '로그인이 필요합니다.' }
  if (code === 'GOOGLE_DENIED') return { tone: 'problem', text: 'Google Calendar 권한이 거부되었습니다.' }
  if (code === 'NOT_CONNECTED') return { tone: 'problem', text: 'Google Calendar에 먼저 연결해 주세요.' }
  if (code === 'NEEDS_CALENDAR') return { tone: 'problem', text: '캘린더를 선택해 주세요.' }
  if (code === 'GOOGLE_HTTP') return { tone: 'problem', text: 'Google Calendar에 연결하지 못했습니다.' }
  if (code === 'INVALID_COMMAND') return { tone: 'problem', text: '요청을 확인하지 못했습니다.' }
  const message = error instanceof Error ? error.message : 'Google Calendar 요청을 처리하지 못했습니다.'
  return { tone: 'problem', text: message }
}

export function noticeFromReport(report: SyncReport): Notice {
  const parts = [
    `가져옴 ${report.imported}`,
    `보냄 ${report.exported}`,
  ]
  if (report.skippedUnsupported > 0) parts.push(`건너뜀 ${report.skippedUnsupported}`)
  if (report.conflicts.length > 0) parts.push(`충돌 ${report.conflicts.length}`)
  return { tone: 'ok', text: `동기화 ${parts.join(' · ')}` }
}

export function formatLastSyncAt(at: IsoDateTime): string {
  const ms = Date.parse(at)
  if (!Number.isFinite(ms)) return at
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms))
}

export function lastSyncSummary(last: LastSync): string {
  if (last.error) return last.error
  const parts = [
    `가져옴 ${last.imported}`,
    `보냄 ${last.exported}`,
  ]
  if (last.skippedUnsupported > 0) parts.push(`건너뜀 ${last.skippedUnsupported}`)
  if (last.conflictCount > 0) parts.push(`충돌 ${last.conflictCount}`)
  return `${formatLastSyncAt(last.at)} · ${parts.join(' · ')}`
}

export type PanelCopy = {
  title: string
  intro: string | null
  status: string
  consentLabel: string | null
  boundHint: string | null
}

export function panelCopy(view: ConnectionView): PanelCopy {
  const title = 'Google Calendar'
  const controls = visibleControls(view)
  if (view.status === 'disconnected') {
    return {
      title,
      intro: 'Google Calendar와 Blanky 일정을 맞춥니다. Google 로그인은 계정만 만들고, 캘린더 권한은 여기서 받습니다.',
      status: '연결되지 않음',
      consentLabel: 'Google Calendar 연결',
      boundHint: null,
    }
  }
  if (view.status === 'awaiting_consent') {
    return {
      title,
      intro: null,
      status: 'Google 권한 확인이 끝나지 않았습니다. 다시 연결하면 이 화면으로 돌아옵니다.',
      consentLabel: '다시 연결',
      boundHint: null,
    }
  }
  if (view.status === 'connected') {
    return {
      title,
      intro: null,
      status: `${view.accountEmail} · 캘린더와 첫 가져오기 방향을 고르세요`,
      consentLabel: null,
      boundHint: null,
    }
  }
  if (view.status === 'ready') {
    return {
      title,
      intro: null,
      status: view.accountEmail,
      consentLabel: null,
      boundHint: '선택한 캘린더는 바꿀 수 없습니다.',
    }
  }
  if (view.status === 'needs_reauth') {
    return {
      title,
      intro: null,
      status: `${view.accountEmail} · 다시 연결해야 합니다`,
      consentLabel: '다시 연결',
      boundHint: '선택한 캘린더는 바꿀 수 없습니다.',
    }
  }
  return {
    title,
    intro: null,
    status: view.message,
    consentLabel: controls.consent ? '다시 연결' : null,
    boundHint: null,
  }
}

export type LeaveCopy = {
  title: string
  body: string
  confirmLabel: string
}

export function leaveCopy(): LeaveCopy {
  return {
    title: '연결 해제',
    body: 'Google Calendar 연결을 해제할까요? Google 캘린더의 일정은 삭제되지 않습니다.',
    confirmLabel: '해제',
  }
}

export type DisconnectPolicyCopy = {
  title: string
  body: string
  keepLabel: string
  deleteLabel: string
  cancelLabel: string
}

export function disconnectPolicyCopy(): DisconnectPolicyCopy {
  return {
    title: '연결 해제',
    body: '연결을 해제해도 Google Calendar의 일정은 삭제되지 않습니다. Blanky로 가져온 일정만 지울 수 있습니다.',
    keepLabel: '가져온 일정 유지',
    deleteLabel: '가져온 일정 삭제',
    cancelLabel: '취소',
  }
}

export function dispositionFor(kind: DisconnectKind, importedRows: DisconnectDisposition['importedRows']): DisconnectDisposition | null {
  if (kind === 'hidden') return null
  if (kind === 'leave') return { importedRows: 'keep' }
  return { importedRows }
}

export type InFlight =
  | 'consent'
  | 'list_calendars'
  | 'select_calendar'
  | 'sync'
  | 'set_auto_sync'
  | 'disconnect'

type LiveBase = {
  inflight: InFlight | null
  notice: Notice | null
  disconnectOpen: boolean
}

export type LivePanel =
  | {
      kind: 'live'
      view: Extract<ConnectionView, { status: 'connected' }>
      calendars: readonly GoogleCalendarChoice[]
      pick: CalendarPickDraft
    } & LiveBase
  | {
      kind: 'live'
      view: Exclude<ConnectionView, { status: 'connected' }>
      calendars: readonly []
      pick: null
    } & LiveBase

export type PanelState =
  | { kind: 'loading' }
  | { kind: 'blocked'; message: string }
  | LivePanel

export type PanelEvent =
  | { type: 'blocked'; message: string }
  | { type: 'ready'; view: ConnectionView; calendars: readonly GoogleCalendarChoice[] }
  | { type: 'view'; view: ConnectionView }
  | { type: 'calendars'; calendars: readonly GoogleCalendarChoice[] }
  | { type: 'pick'; pick: CalendarPickDraft }
  | { type: 'inflight'; command: InFlight | null }
  | { type: 'notice'; notice: Notice | null }
  | { type: 'disconnectOpen'; open: boolean }

export function reducePanel(state: PanelState, event: PanelEvent): PanelState {
  if (event.type === 'blocked') return { kind: 'blocked', message: event.message }
  if (event.type === 'ready') return liveFrom(event.view, event.calendars, emptyLive())
  if (state.kind !== 'live') return state
  if (event.type === 'view') {
    const calendars = event.view.status === 'connected' ? state.calendars : []
    return liveFrom(event.view, calendars, {
      inflight: null,
      notice: state.notice,
      disconnectOpen: false,
    })
  }
  if (event.type === 'calendars') {
    if (state.view.status !== 'connected') return state
    return {
      ...state,
      calendars: event.calendars,
      pick: initialPick(event.calendars),
    }
  }
  if (event.type === 'pick') {
    if (state.view.status !== 'connected') return state
    return { ...state, pick: event.pick }
  }
  if (event.type === 'inflight') return { ...state, inflight: event.command }
  if (event.type === 'notice') return { ...state, notice: event.notice }
  if (event.type === 'disconnectOpen') return { ...state, disconnectOpen: event.open }
  return state
}

export async function loadPanel(input: {
  supabaseReady: boolean
  status: () => Promise<ConnectionView>
  listCalendars: () => Promise<readonly GoogleCalendarChoice[]>
}): Promise<PanelState> {
  if (!input.supabaseReady) {
    return {
      kind: 'blocked',
      message: '서버에 연결되면 Google Calendar를 연결할 수 있습니다.',
    }
  }
  try {
    const view = await input.status()
    const calendars = view.status === 'connected' ? await input.listCalendars() : []
    return liveFrom(view, calendars, emptyLive())
  } catch (error) {
    const notice = noticeFromUnknown(error)
    const code = errorCode(error)
    if (code) {
      return liveFrom({ status: 'error', code, message: notice.text }, [], emptyLive())
    }
    return { kind: 'blocked', message: notice.text }
  }
}

export async function beginConsent(startConnect: () => Promise<{ authUrl: string }>): Promise<void> {
  const { authUrl } = await startConnect()
  window.location.assign(authUrl)
}

export function GoogleCalendarPanel(): ReactElement {
  throw new Error('not implemented')
  // TODO mount loadPanel on first paint
  // TODO derive copy and controls from view only
  // TODO connected: Calendar pick + first-import Choice, submit selectCalendar
  // TODO ready: account, bound summary, lastSyncSummary, SwitchRow autoSync, sync button
  // TODO consent buttons call beginConsent
  // TODO disconnectOpen uses ConfirmDialog for leave, DisconnectPolicyDialog for policy
  // TODO after every command, status() then reducePanel { type: 'view' }
  // TODO if shouldAutoSync(view, Date.now()) run sync once after load
}

export function GoogleCalendarScheduleLink(): ReactElement {
  throw new Error('not implemented')
  // TODO status() once
  // TODO if shouldLeaveScheduleForSetup, <Navigate to={googleCalendarPath()} replace />
  // TODO else one-line panelCopy(view).status plus Link to googleCalendarPath()
}

export function DisconnectPolicyDialog(props: {
  onCancel: () => void
  onChoose: (importedRows: DisconnectDisposition['importedRows']) => void
}): ReactElement {
  void props
  throw new Error('not implemented')
  // TODO render disconnectPolicyCopy(); keep and delete both close the dialog
}

const CALENDAR_ERROR_CODES: readonly CalendarErrorCode[] = [
  'UNAUTHENTICATED',
  'GOOGLE_ENV_MISSING',
  'GOOGLE_DENIED',
  'NOT_CONNECTED',
  'NEEDS_CALENDAR',
  'GOOGLE_HTTP',
  'INVALID_COMMAND',
]

function errorCode(error: unknown): CalendarErrorCode | '' {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') {
    return ''
  }
  return CALENDAR_ERROR_CODES.find((code) => code === error.code) ?? ''
}

function emptyLive(): LiveBase {
  return { inflight: null, notice: null, disconnectOpen: false }
}

function liveFrom(
  view: ConnectionView,
  calendars: readonly GoogleCalendarChoice[],
  base: LiveBase,
): LivePanel {
  if (view.status === 'connected') {
    return {
      kind: 'live',
      view,
      calendars,
      pick: initialPick(calendars),
      ...base,
    }
  }
  return {
    kind: 'live',
    view,
    calendars: [],
    pick: null,
    ...base,
  }
}
