import type {
  CalendarErrorCode,
  ConnectionView,
  DisconnectDisposition,
  FirstImport,
  GoogleCalendarChoice,
  GoogleCalendarId,
  LastSync,
  SyncReport,
} from '@blanky/types'
import type { CalendarSyncClient } from '@blanky/api'

export const CALENDAR_SETTINGS_ANCHOR = 'google-calendar'
export const AUTO_SYNC_STALE_MS = 5 * 60 * 1000

export type BusyAction = 'connect' | 'bind' | 'sync' | 'autoSync' | 'disconnect'

export type Notice =
  | { kind: 'sync_ok'; report: SyncReport }
  | { kind: 'action_error'; message: string }

export type DisconnectPrompt = {
  policy: string
  keep: () => void
  dropImported: () => void
  cancel: () => void
}

export type CalendarPanelActions = {
  connect: () => void
  bind: (input: { googleCalendarId: GoogleCalendarId; firstImport: FirstImport }) => void
  sync: () => void
  setAutoSync: (enabled: boolean) => void
  disconnect: () => void
  resolveDisconnect: (disposition: DisconnectDisposition) => void
  cancelDisconnect: () => void
}

export type CalendarPanel =
  | { status: 'loading' }
  | {
      status: 'disconnected'
      intro: string
      connectLabel: string
      connect: () => void
      connectBusy: boolean
    }
  | {
      status: 'awaiting_consent'
      hint: string
      connectLabel: string
      connect: () => void
      connectBusy: boolean
    }
  | {
      status: 'connected'
      accountEmail: string
      calendars: readonly GoogleCalendarChoice[]
      firstImportNote: string
      bindLabel: string
      bind: (input: { googleCalendarId: GoogleCalendarId; firstImport: FirstImport }) => void
      bindBusy: boolean
    }
  | {
      status: 'ready'
      accountEmail: string
      calendarSummary: string
      lastSync: LastSync
      autoSync: boolean
      sync: () => void
      setAutoSync: (enabled: boolean) => void
      disconnect: () => void
      disconnectPrompt: DisconnectPrompt | null
      busy: BusyAction | null
    }
  | {
      status: 'needs_reauth'
      accountEmail: string
      calendarSummary: string
      hint: string
      reconnect: () => void
      disconnect: () => void
      disconnectPrompt: DisconnectPrompt | null
      busy: BusyAction | null
    }
  | {
      status: 'error'
      code: CalendarErrorCode
      message: string
      connect: (() => void) | null
      connectBusy: boolean
    }

export type CalendarSession = {
  panel: CalendarPanel
  notice: Notice | null
}

export type BindDraft = {
  googleCalendarId: GoogleCalendarId | ''
  direction: FirstImport['direction']
}

export type ProjectInput = {
  calendars: readonly GoogleCalendarChoice[]
  busy: BusyAction | null
  disconnectPrompt: DisconnectPrompt | null
  actions: CalendarPanelActions
}

export function defaultBindDraft(calendars: readonly GoogleCalendarChoice[]): BindDraft {
  const preferred = calendars.find((calendar) => calendar.primary) ?? calendars[0]
  return {
    googleCalendarId: preferred?.id ?? '',
    direction: 'from_google',
  }
}

export function errorRecovery(code: CalendarErrorCode): 'connect' | 'none' {
  if (code === 'GOOGLE_ENV_MISSING' || code === 'UNAUTHENTICATED') return 'none'
  return 'connect'
}

export function calendarErrorCopy(error: unknown): string {
  throw new Error('not implemented')
}

export function shouldAutoSync(view: ConnectionView, nowMs: number): view is Extract<ConnectionView, { status: 'ready' }> {
  if (view.status !== 'ready' || !view.autoSync) return false
  const ageMs = nowMs - Date.parse(view.lastSync.at)
  return Number.isFinite(ageMs) && ageMs >= AUTO_SYNC_STALE_MS
}

export function projectCalendarPanel(view: ConnectionView | { status: 'loading' }, input: ProjectInput): CalendarPanel {
  switch (view.status) {
    case 'loading':
      return { status: 'loading' }
    case 'disconnected':
      return {
        status: 'disconnected',
        intro: CALENDAR_COPY.disconnectedIntro,
        connectLabel: CALENDAR_COPY.connect,
        connect: input.actions.connect,
        connectBusy: input.busy === 'connect',
      }
    case 'awaiting_consent':
      return {
        status: 'awaiting_consent',
        hint: CALENDAR_COPY.awaitingHint,
        connectLabel: CALENDAR_COPY.retryConnect,
        connect: input.actions.connect,
        connectBusy: input.busy === 'connect',
      }
    case 'connected':
      return {
        status: 'connected',
        accountEmail: view.accountEmail,
        calendars: input.calendars,
        firstImportNote: CALENDAR_COPY.firstImportNote,
        bindLabel: CALENDAR_COPY.bind,
        bind: input.actions.bind,
        bindBusy: input.busy === 'bind',
      }
    case 'ready':
      return {
        status: 'ready',
        accountEmail: view.accountEmail,
        calendarSummary: view.calendarSummary,
        lastSync: view.lastSync,
        autoSync: view.autoSync,
        sync: input.actions.sync,
        setAutoSync: input.actions.setAutoSync,
        disconnect: input.actions.disconnect,
        disconnectPrompt: input.disconnectPrompt,
        busy: input.busy,
      }
    case 'needs_reauth':
      return {
        status: 'needs_reauth',
        accountEmail: view.accountEmail,
        calendarSummary: view.calendarSummary,
        hint: CALENDAR_COPY.needsReauthHint,
        reconnect: input.actions.connect,
        disconnect: input.actions.disconnect,
        disconnectPrompt: input.disconnectPrompt,
        busy: input.busy,
      }
    case 'error':
      return {
        status: 'error',
        code: view.code,
        message: view.message,
        connect: errorRecovery(view.code) === 'connect' ? input.actions.connect : null,
        connectBusy: input.busy === 'connect',
      }
  }
}

export const CALENDAR_COPY = {
  title: 'Google Calendar',
  disconnectedIntro:
    'Blanky 일정을 Google Calendar와 맞춥니다. 연결한 뒤 캘린더를 하나 고르고 첫 가져오기 방향을 정하면 됩니다. 이후 동기화는 양방향입니다.',
  connect: 'Google Calendar 연결',
  retryConnect: '다시 연결',
  awaitingHint: 'Google에서 권한을 허용하면 이 화면으로 돌아옵니다.',
  firstImportNote: '이 방향은 처음 한 번만 적용됩니다. 이후에는 양방향으로 맞춥니다.',
  bind: '이 캘린더 사용',
  noCalendars: '표시할 캘린더가 없습니다.',
  needsReauthHint: '권한이 만료되었습니다. 다시 연결해 주세요.',
  syncNow: '지금 동기화',
  autoSync: '자동 동기화',
  autoSyncHint: '이 화면을 열면 5분이 지난 연결을 다시 맞춥니다. 일정 저장은 Google에 바로 쓰지 않습니다.',
  disconnect: '연결 해제',
  disconnectTitle: '연결 해제',
  disconnectPolicy: 'Google Calendar의 일정은 삭제되지 않습니다. Blanky에 가져온 일정만 선택할 수 있습니다.',
  disconnectKeep: '가져온 일정 유지하고 해제',
  disconnectDelete: '가져온 일정도 삭제하고 해제',
  scheduleNavDescription: 'Google Calendar 연결과 타임라인 기본값을 설정합니다.',
} as const

export function createCalendarPanelActions(deps: {
  client: CalendarSyncClient
  assign: (authUrl: string) => void
  now: () => number
}): {
  session: () => CalendarSession
  actions: CalendarPanelActions
  refresh: () => Promise<void>
} {
  void deps
  throw new Error('not implemented')
  // TODO: one writer. busy no-ops a second command.
  // TODO: connect -> startConnect -> assign(authUrl). Same path for awaiting_consent and needs_reauth.
  // TODO: after status() === connected, listCalendars(). A list failure is a notice, the view stays connected.
  // TODO: shouldAutoSync after every ready view. Skip when busy !== null.
  // TODO: disconnect() only opens the prompt. resolveDisconnect sends disposition.
}

export function useGoogleCalendarSettings(): CalendarSession {
  throw new Error('not implemented')
}

export function GoogleCalendarSettings(): unknown {
  throw new Error('not implemented')
}

export function CalendarCard(_props: CalendarSession): unknown {
  throw new Error('not implemented')
  // TODO: switch (panel.status). Render only fields on that variant.
  // TODO: connected draft is useState(defaultBindDraft(panel.calendars)). Not session state.
  // TODO: disconnectPrompt replaces the disconnect button while open. One dialog, two dispositions.
}

export function formatLastSync(lastSync: LastSync): string {
  void lastSync
  throw new Error('not implemented')
}

export function formatSyncNotice(report: SyncReport): string {
  void report
  throw new Error('not implemented')
}
