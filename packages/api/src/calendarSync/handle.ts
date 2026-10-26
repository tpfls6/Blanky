import type { ConnectionView, GoogleCalendarChoice, LastSync, SyncReport } from '../../../types/src/calendarSync.ts'
import { asIsoDateTime, asUserId } from '../../../types/src/calendarSync.ts'
import { parseCalendarAction } from './action.ts'
import type { ApplyDeps } from './apply.ts'
import type { Connection, ReadyConnection } from './domain.ts'
import type { GoogleCalendarSecrets } from './env.ts'
import { CalendarSyncError, asCalendarSyncError, calendarError, errorStatus } from './errors.ts'
import { createGoogleEvent, deleteGoogleEvent, listGoogleCalendars, listGoogleEvents, updateGoogleEvent } from './googleApi.ts'
import { consentUrl, createOAuthState, hashOAuthState, refreshAccessToken } from './oauth.ts'
import {
  clonePersonalOntoBoundCalendar,
  disconnectConnection,
  insertExternalCalendar,
  loadConnection,
  loadPersonalCalendarId,
  loadSnapshot,
  markNeedsReauth,
  saveAwaitingConsent,
  saveAutoSync,
  saveCursor,
  saveReadyBind,
  upsertLink,
  upsertSchedule,
  casUpdateSchedule,
  deleteLink,
  deleteSchedule,
  readUpdatedAt,
  wipeLinks,
  type DbClient,
} from './store.ts'
import { runSync } from './sync.ts'
import { viewFromConnection } from './view.ts'

export type HandleResult = {
  status: number
  body: ConnectionView | SyncReport | { authUrl: string } | { calendars: readonly GoogleCalendarChoice[] } | { error: ReturnType<typeof calendarError> }
}

export type HandleDeps = {
  userId: string
  origin: string
  body: unknown
  userClient: DbClient
  admin: DbClient
  google: GoogleCalendarSecrets
  fetch?: typeof fetch
}

function ready(connection: Connection | null): ReadyConnection {
  if (!connection || connection.status !== 'ready') {
    throw new CalendarSyncError('NOT_CONNECTED', 'Google Calendar에 연결된 캘린더가 없습니다.', 409)
  }
  return connection
}

function lastSyncOf(report: Pick<SyncReport, 'imported' | 'exported' | 'deletedLocal' | 'deletedGoogle' | 'skippedUnsupported' | 'conflicts'>): LastSync {
  return {
    at: asIsoDateTime(new Date().toISOString()),
    imported: report.imported,
    exported: report.exported,
    deletedLocal: report.deletedLocal,
    deletedGoogle: report.deletedGoogle,
    skippedUnsupported: report.skippedUnsupported,
    conflictCount: report.conflicts.length,
    error: null,
  }
}

async function withTokens(connection: Extract<Connection, { tokens: unknown }>, deps: HandleDeps) {
  try {
    return await refreshAccessToken({
      clientId: deps.google.clientId,
      clientSecret: deps.google.clientSecret,
      tokens: connection.tokens,
    }, deps.fetch)
  } catch (error) {
    await markNeedsReauth(deps.admin, connection.id)
    throw asCalendarSyncError(error, 'GOOGLE_DENIED')
  }
}

async function applyFor(connection: ReadyConnection, accessToken: string, deps: HandleDeps): Promise<ApplyDeps> {
  return {
    connectionId: connection.id,
    readUpdatedAt: (id) => readUpdatedAt(deps.admin, id),
    upsertSchedule: (draft) => upsertSchedule(deps.admin, {
      userId: connection.userId,
      calendarId: connection.calendar.blankyCalendarId,
      draft,
    }),
    deleteSchedule: (id) => deleteSchedule(deps.admin, id),
    casUpdateSchedule: (input) => casUpdateSchedule(deps.admin, input),
    upsertLink: (link) => upsertLink(deps.admin, link),
    deleteLink: (input) => deleteLink(deps.admin, input),
    createGoogleEvent: (body) => createGoogleEvent({
      accessToken,
      googleCalendarId: connection.calendar.googleCalendarId,
      body,
      timeZone: connection.calendar.timeZone,
    }, deps.fetch),
    updateGoogleEvent: (input) => updateGoogleEvent({
      accessToken,
      googleCalendarId: connection.calendar.googleCalendarId,
      timeZone: connection.calendar.timeZone,
      ...input,
    }, deps.fetch),
    deleteGoogleEvent: (input) => deleteGoogleEvent({
      accessToken,
      googleCalendarId: connection.calendar.googleCalendarId,
      ...input,
    }, deps.fetch),
  }
}

export async function handleCalendarAction(deps: HandleDeps): Promise<HandleResult> {
  try {
    const action = parseCalendarAction(deps.body)
    const userId = asUserId(deps.userId)
    const connection = await loadConnection(deps.admin, userId)

    if (action.type === 'status') return { status: 200, body: viewFromConnection(connection) }

    if (action.type === 'start_connect') {
      const state = createOAuthState()
      const hash = await hashOAuthState(state)
      await saveAwaitingConsent(deps.admin, {
        userId,
        hash,
        origin: deps.origin,
        id: connection?.id,
      })
      return {
        status: 200,
        body: { authUrl: consentUrl({ clientId: deps.google.clientId, redirectUri: deps.google.redirectUri, state }) },
      }
    }

    if (action.type === 'list_calendars') {
      if (!connection || (connection.status !== 'connected' && connection.status !== 'ready')) {
        throw new CalendarSyncError('NOT_CONNECTED', 'Google Calendar에 먼저 연결해 주세요.', 409)
      }
      if (connection.status === 'ready') throw new CalendarSyncError('NEEDS_CALENDAR', '이미 캘린더가 선택되어 있습니다.', 409)
      const tokens = await withTokens(connection, deps)
      return { status: 200, body: { calendars: await listGoogleCalendars(tokens.accessToken, deps.fetch) } }
    }

    if (action.type === 'select_calendar') {
      if (!connection || connection.status !== 'connected') {
        throw new CalendarSyncError('NEEDS_CALENDAR', '캘린더를 고르기 전에 Google Calendar에 연결해 주세요.', 409)
      }
      const tokens = await withTokens(connection, deps)
      const calendars = await listGoogleCalendars(tokens.accessToken, deps.fetch)
      const chosen = calendars.find((item) => item.id === action.googleCalendarId)
      if (!chosen) throw new CalendarSyncError('NEEDS_CALENDAR', '선택한 Google 캘린더를 찾지 못했습니다.', 409)
      const blankyCalendarId = await insertExternalCalendar(deps.admin, {
        userId,
        summary: chosen.summary,
        timeZone: chosen.timeZone,
      })
      await saveReadyBind(deps.admin, {
        id: connection.id,
        calendar: {
          googleCalendarId: chosen.id,
          blankyCalendarId,
          timeZone: chosen.timeZone,
          summary: chosen.summary,
        },
      })
      if (action.firstImport.direction === 'from_blanky') {
        const personal = await loadPersonalCalendarId(deps.admin, userId)
        if (personal) {
          await clonePersonalOntoBoundCalendar(deps.admin, {
            userId,
            personalCalendarId: personal,
            boundCalendarId: blankyCalendarId,
          })
        }
      }
      const bound = await loadConnection(deps.admin, userId)
      const readyConnection = ready(bound)
      const report = await runSync({
        connection: readyConnection,
        google: {
          list: (input) => listGoogleEvents({
            accessToken: tokens.accessToken,
            googleCalendarId: readyConnection.calendar.googleCalendarId,
            timeZone: readyConnection.calendar.timeZone,
            ...input,
          }, deps.fetch),
        },
        loadSnapshot: (current) => loadSnapshot(deps.admin, current),
        wipeLinks: (id) => wipeLinks(deps.admin, id),
        saveCursor: async (id, cursor) => {
          await saveCursor(deps.admin, id, cursor, lastSyncOf({
            imported: 0,
            exported: 0,
            deletedLocal: 0,
            deletedGoogle: 0,
            skippedUnsupported: 0,
            conflicts: [],
          }))
        },
        apply: await applyFor(readyConnection, tokens.accessToken, deps),
      })
      await saveCursor(deps.admin, readyConnection.id, report.cursor, lastSyncOf(report))
      const latest = await loadConnection(deps.admin, userId)
      return { status: 200, body: viewFromConnection(latest) }
    }

    if (action.type === 'sync') {
      const readyConnection = ready(connection)
      const tokens = await withTokens(readyConnection, deps)
      const report = await runSync({
        connection: readyConnection,
        google: {
          list: (input) => listGoogleEvents({
            accessToken: tokens.accessToken,
            googleCalendarId: readyConnection.calendar.googleCalendarId,
            timeZone: readyConnection.calendar.timeZone,
            ...input,
          }, deps.fetch),
        },
        loadSnapshot: (current) => loadSnapshot(deps.admin, current),
        wipeLinks: (id) => wipeLinks(deps.admin, id),
        saveCursor: async (id, cursor) => {
          await saveCursor(deps.admin, id, cursor, lastSyncOf({
            imported: 0,
            exported: 0,
            deletedLocal: 0,
            deletedGoogle: 0,
            skippedUnsupported: 0,
            conflicts: [],
          }))
        },
        apply: await applyFor(readyConnection, tokens.accessToken, deps),
      })
      await saveCursor(deps.admin, readyConnection.id, report.cursor, lastSyncOf(report))
      return { status: 200, body: report }
    }

    if (action.type === 'set_auto_sync') {
      const readyConnection = ready(connection)
      await saveAutoSync(deps.admin, readyConnection.id, action.enabled)
      const latest = await loadConnection(deps.admin, userId)
      return { status: 200, body: viewFromConnection(latest) }
    }

    if (action.type === 'disconnect') {
      if (!connection) return { status: 200, body: { status: 'disconnected' } }
      await disconnectConnection(deps.admin, connection, action.disposition)
      return { status: 200, body: { status: 'disconnected' } }
    }

    const _exhaustive: never = action
    void _exhaustive
    throw new CalendarSyncError('INVALID_COMMAND', 'Calendar 명령을 확인해 주세요.')
  } catch (error) {
    const mapped = asCalendarSyncError(error, 'INVALID_COMMAND')
    return { status: mapped.status || errorStatus(mapped.code), body: { error: calendarError(mapped.code, mapped.message) } }
  }
}
