import assert from 'node:assert/strict'
import { test } from 'node:test'
import { asIsoDateTime } from '../../../packages/types/src/calendarSync.ts'
import type { CalendarErrorCode } from '../../../packages/types/src/calendarSync.ts'
import { calendarPanel, errorLine, lastSyncLine } from './calendarPanel.ts'

test('disconnected shows intro and allows connect', () => {
  const panel = calendarPanel({ status: 'disconnected' })
  assert.equal(panel.statusLabel, '연결 안 됨')
  assert.equal(panel.canConnect, true)
  assert.equal(panel.connectLabel, 'Google Calendar 연결')
  assert.match(panel.intro ?? '', /로그인과 별개/)
  assert.match(panel.intro ?? '', /일정만/)
  assert.match(panel.intro ?? '', /서버/)
})

test('awaiting consent can connect again', () => {
  const panel = calendarPanel({ status: 'awaiting_consent' })
  assert.equal(panel.statusLabel, '권한 확인 중')
  assert.equal(panel.canConnect, true)
  assert.equal(panel.connectLabel, '다시 연결')
  assert.match(panel.hint ?? '', /다시 연결/)
})

test('connected shows account email and not connect', () => {
  const panel = calendarPanel({ status: 'connected', accountEmail: 'user@example.test' })
  assert.equal(panel.statusLabel, '연결됨')
  assert.equal(panel.accountEmail, 'user@example.test')
  assert.equal(panel.calendarSummary, null)
  assert.equal(panel.canConnect, false)
  assert.equal(panel.connectLabel, null)
  assert.equal(panel.lastSync, null)
})

test('ready shows account, calendar, and last sync counts', () => {
  const lastSync = {
    at: asIsoDateTime('2026-10-26T00:00:00.000Z'),
    imported: 2,
    exported: 1,
    deletedLocal: 3,
    deletedGoogle: 1,
    skippedUnsupported: 0,
    conflictCount: 0,
    error: null,
  }
  const panel = calendarPanel({
    status: 'ready',
    accountEmail: 'user@example.test',
    calendarSummary: '개인',
    autoSync: true,
    lastSync,
  })
  assert.equal(panel.statusLabel, '연결됨')
  assert.equal(panel.accountEmail, 'user@example.test')
  assert.equal(panel.calendarSummary, '개인')
  assert.equal(panel.canConnect, false)
  assert.deepEqual(panel.lastSync, lastSync)
  assert.match(lastSyncLine(lastSync), /가져옴 2/)
  assert.match(lastSyncLine(lastSync), /보냄 1/)
  assert.match(lastSyncLine(lastSync), /삭제 4/)
})

test('needs reauth shows account, calendar, and reconnect', () => {
  const panel = calendarPanel({
    status: 'needs_reauth',
    accountEmail: 'user@example.test',
    calendarSummary: '개인',
  })
  assert.equal(panel.statusLabel, '다시 연결 필요')
  assert.equal(panel.canConnect, true)
  assert.equal(panel.connectLabel, '다시 연결')
  assert.equal(panel.accountEmail, 'user@example.test')
  assert.equal(panel.calendarSummary, '개인')
})

test('error maps CalendarError codes including GOOGLE_ENV_MISSING', () => {
  const mapped: Record<CalendarErrorCode, string> = {
    GOOGLE_ENV_MISSING: 'Google Calendar 비밀값이 Edge Function에 없습니다.',
    UNAUTHENTICATED: '로그인이 필요합니다.',
    GOOGLE_DENIED: 'Google Calendar 권한이 거부되었습니다.',
    NOT_CONNECTED: 'Google Calendar에 먼저 연결해 주세요.',
    NEEDS_CALENDAR: '캘린더를 선택해 주세요.',
    GOOGLE_HTTP: 'Google Calendar에 연결하지 못했습니다.',
    INVALID_COMMAND: '요청을 확인하지 못했습니다.',
  }
  for (const [code, text] of Object.entries(mapped) as [CalendarErrorCode, string][]) {
    assert.equal(errorLine({ code }), text)
  }
  const panel = calendarPanel({
    status: 'error',
    code: 'GOOGLE_ENV_MISSING',
    message: 'missing',
  })
  assert.equal(panel.statusLabel, '오류')
  assert.equal(panel.canConnect, false)
  assert.equal(panel.errorText, mapped.GOOGLE_ENV_MISSING)
  assert.match(panel.hint ?? '', /CLIENT_SECRET/)
})

test('last sync error is the result line', () => {
  assert.equal(lastSyncLine({
    at: asIsoDateTime('2026-10-26T00:00:00.000Z'),
    imported: 0,
    exported: 0,
    deletedLocal: 0,
    deletedGoogle: 0,
    skippedUnsupported: 0,
    conflictCount: 0,
    error: '토큰이 만료되었습니다.',
  }), '토큰이 만료되었습니다.')
})
