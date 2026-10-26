import type {
  CalendarId,
  ConnectionId,
  Etag,
  GoogleCalendarId,
  GoogleEventId,
  GoogleSub,
  IsoDateTime,
  LastSync,
  OAuthState,
  PeerWhen,
  Recurrence,
  ScheduleId,
  SyncCursor,
  UserId,
} from '../../../types/src/calendarSync.ts'

export type TokenSet = {
  refreshToken: string
  accessToken: string
  accessTokenExpiresAt: IsoDateTime
}

export type BoundCalendar = {
  googleCalendarId: GoogleCalendarId
  blankyCalendarId: CalendarId
  timeZone: string
  summary: string
}

export type Connection =
  | { status: 'awaiting_consent'; id: ConnectionId; userId: UserId; oauthState: OAuthState; origin: string }
  | { status: 'connected'; id: ConnectionId; userId: UserId; googleSub: GoogleSub; accountEmail: string; tokens: TokenSet }
  | {
      status: 'ready'
      id: ConnectionId
      userId: UserId
      googleSub: GoogleSub
      accountEmail: string
      tokens: TokenSet
      calendar: BoundCalendar
      cursor: SyncCursor
      autoSync: boolean
      lastSync: LastSync
    }
  | {
      status: 'needs_reauth'
      id: ConnectionId
      userId: UserId
      googleSub: GoogleSub
      accountEmail: string
      calendar: BoundCalendar
      autoSync: boolean
    }

export type ReadyConnection = Extract<Connection, { status: 'ready' }>

export type EventLink = {
  connectionId: ConnectionId
  scheduleId: ScheduleId
  googleEventId: GoogleEventId
  appliedEtag: Etag
  appliedBlankyUpdatedAt: IsoDateTime
  origin: 'blanky' | 'google'
  recurrenceMirror: 'mirrored'
}

export type SnapshotRow = {
  scheduleId: ScheduleId
  updatedAt: IsoDateTime
  title: string
  description: string
  when: PeerWhen
  recurrence: Recurrence
}

export type BlankySnapshot = {
  calendarId: CalendarId
  rows: readonly SnapshotRow[]
  links: readonly EventLink[]
}

export type UnsupportedRecurrence = { kind: 'unsupported' }

export type GooglePeerEvent =
  | {
      id: GoogleEventId
      etag: Etag
      status: 'confirmed'
      title: string
      description: string
      when: PeerWhen
      recurrence: Recurrence | UnsupportedRecurrence
      updated: IsoDateTime
      blankyScheduleId: ScheduleId | null
    }
  | { id: GoogleEventId; etag: Etag; status: 'cancelled' }

export type GoogleEventPage = {
  events: readonly GooglePeerEvent[]
  nextPageToken: string | null
  nextSyncToken: import('../../../types/src/calendarSync.ts').SyncToken | null
}

export type GoogleListResult =
  | { kind: 'page'; page: GoogleEventPage }
  | { kind: 'gone' }

export type GoogleEventWrite = {
  summary: string
  description: string
  when: PeerWhen
  recurrence: Recurrence
  blankyScheduleId: ScheduleId
}

export type ConflictNote = {
  scheduleId: ScheduleId
  googleEventId: GoogleEventId
  reason: 'both_dirty' | 'etag_mismatch'
  resolved: 'blanky_wins'
}

export type ReconcileOp =
  | { kind: 'upsert_blanky'; googleEventId: GoogleEventId; etag: Etag; origin: 'google'; draft: SnapshotRow }
  | { kind: 'delete_blanky'; scheduleId: ScheduleId; googleEventId: GoogleEventId }
  | { kind: 'create_google'; scheduleId: ScheduleId; body: GoogleEventWrite }
  | { kind: 'update_google'; scheduleId: ScheduleId; googleEventId: GoogleEventId; etag: Etag; body: GoogleEventWrite }
  | { kind: 'delete_google'; googleEventId: GoogleEventId; etag: Etag }
  | { kind: 'link'; scheduleId: ScheduleId; googleEventId: GoogleEventId; etag: Etag; origin: EventLink['origin']; appliedBlankyUpdatedAt: IsoDateTime }
  | { kind: 'skip_unsupported'; googleEventId: GoogleEventId }
  | { kind: 'conflict'; note: ConflictNote; follow: Extract<ReconcileOp, { kind: 'update_google' }> }

export type ReconcileInput = {
  connection: ReadyConnection
  snapshot: BlankySnapshot
  page: GoogleEventPage
}

export function isUnsupportedRecurrence(value: Recurrence | UnsupportedRecurrence): value is UnsupportedRecurrence {
  return 'kind' in value && value.kind === 'unsupported'
}
