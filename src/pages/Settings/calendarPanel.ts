import type { CalendarErrorCode, ConnectionView, LastSync } from '../../../packages/types/src/calendarSync.ts'

const ERROR_LINE: Record<CalendarErrorCode, string> = {
  GOOGLE_ENV_MISSING: 'Google Calendar 비밀값이 Edge Function에 없습니다.',
  UNAUTHENTICATED: '로그인이 필요합니다.',
  GOOGLE_DENIED: 'Google Calendar 권한이 거부되었습니다.',
  NOT_CONNECTED: 'Google Calendar에 먼저 연결해 주세요.',
  NEEDS_CALENDAR: '캘린더를 선택해 주세요.',
  GOOGLE_HTTP: 'Google Calendar에 연결하지 못했습니다.',
  INVALID_COMMAND: '요청을 확인하지 못했습니다.',
}

const ERROR_FIX: Record<CalendarErrorCode, string> = {
  GOOGLE_ENV_MISSING: '서버에 GOOGLE_CALENDAR_CLIENT_ID와 CLIENT_SECRET을 넣은 뒤 다시 열어 주세요.',
  UNAUTHENTICATED: 'Blanky에 로그인한 다음 이 화면으로 돌아와 주세요.',
  GOOGLE_DENIED: 'Google 동의 화면에서 캘린더 권한을 허용해 주세요.',
  NOT_CONNECTED: '아래 연결 버튼으로 Google Calendar 권한을 받아 주세요.',
  NEEDS_CALENDAR: '연결한 계정에서 캘린더를 고른 뒤 이 캘린더 사용을 눌러 주세요.',
  GOOGLE_HTTP: '네트워크를 확인한 뒤 다시 시도해 주세요.',
  INVALID_COMMAND: '화면을 새로고침한 뒤 다시 시도해 주세요.',
}

export type CalendarPanelCopy = {
  statusLabel: string
  canConnect: boolean
  connectLabel: string | null
  accountEmail: string | null
  calendarSummary: string | null
  lastSync: LastSync | null
  intro: string | null
  hint: string | null
  errorText: string | null
}

const empty: Omit<CalendarPanelCopy, 'statusLabel'> = {
  canConnect: false,
  connectLabel: null,
  accountEmail: null,
  calendarSummary: null,
  lastSync: null,
  intro: null,
  hint: null,
  errorText: null,
}

export function errorLine(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (code in ERROR_LINE) return ERROR_LINE[code as CalendarErrorCode]
  return error instanceof Error ? error.message : 'Google Calendar 요청을 처리하지 못했습니다.'
}

export function lastSyncLine(last: LastSync): string {
  if (last.error) return last.error
  return [
    `마지막 동기화 ${formatSyncAt(last.at)}`,
    `가져옴 ${last.imported}`,
    `보냄 ${last.exported}`,
    `삭제 ${last.deletedLocal + last.deletedGoogle}`,
  ].join(' · ')
}

export function calendarPanel(view: ConnectionView): CalendarPanelCopy {
  if (view.status === 'disconnected') {
    return {
      ...empty,
      statusLabel: '연결 안 됨',
      canConnect: true,
      connectLabel: 'Google Calendar 연결',
      intro: '로그인과 별개입니다. 일정만 맞추며, 비밀값은 서버에만 있습니다.',
    }
  }
  if (view.status === 'awaiting_consent') {
    return {
      ...empty,
      statusLabel: '권한 확인 중',
      canConnect: true,
      connectLabel: '다시 연결',
      hint: 'Google 동의 화면에서 캘린더 권한을 허용한 뒤 이 화면으로 돌아옵니다. 취소했다면 다시 연결해 주세요.',
    }
  }
  if (view.status === 'connected') {
    return {
      ...empty,
      statusLabel: '연결됨',
      accountEmail: view.accountEmail,
      hint: '동기화할 캘린더와 첫 가져오기 방향을 고르세요. 이후 동기화는 양방향입니다.',
    }
  }
  if (view.status === 'ready') {
    return {
      ...empty,
      statusLabel: '연결됨',
      accountEmail: view.accountEmail,
      calendarSummary: view.calendarSummary,
      lastSync: view.lastSync,
    }
  }
  if (view.status === 'needs_reauth') {
    return {
      ...empty,
      statusLabel: '다시 연결 필요',
      canConnect: true,
      connectLabel: '다시 연결',
      accountEmail: view.accountEmail,
      calendarSummary: view.calendarSummary,
      hint: 'Google 권한이 만료되었습니다. 다시 연결해 주세요.',
    }
  }
  return {
    ...empty,
    statusLabel: '오류',
    errorText: ERROR_LINE[view.code],
    hint: ERROR_FIX[view.code],
  }
}

function formatSyncAt(value: string): string {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return value
  return new Date(time).toLocaleString('ko-KR')
}
