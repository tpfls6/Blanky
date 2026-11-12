import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Calendar, CalendarEntry, CalendarInvitation, CalendarMember, CalendarRole, InviteLink, InviteLinkPreview,
  InviteRole, PersonalCalendarInput, ReceivedInvitation, SharedCalendarInput,
} from '../../types/src/calendar.ts'
import type { Database } from './database.generated.ts'
import { AppError, mapDbError } from './errors.ts'
import { isRecord } from './guards.ts'

export function mapCalendarRow(value: unknown): Calendar {
  if (!isRecord(value)) throw new AppError('REQUEST_FAILED', '캘린더 응답을 읽지 못했습니다.')
  const text = (key: string): string => {
    if (typeof value[key] !== 'string') throw new AppError('REQUEST_FAILED', '캘린더 응답을 읽지 못했습니다.', key)
    return value[key]
  }
  const type = text('type')
  if (!['personal', 'shared', 'external'].includes(type) || typeof value.is_default_personal !== 'boolean') {
    throw new AppError('REQUEST_FAILED', '캘린더 응답을 읽지 못했습니다.')
  }
  return {
    id: text('id'), ownerUserId: text('owner_user_id'), name: text('name'),
    description: text('description'), color: text('color'), icon: text('icon'),
    type: type as Calendar['type'], isDefaultPersonal: value.is_default_personal,
    timezone: text('timezone'), createdAt: text('created_at'), updatedAt: text('updated_at'),
  }
}

function columns(input: Partial<PersonalCalendarInput>) {
  if (input.name !== undefined && !input.name.trim()) throw new AppError('INVALID_INPUT', '캘린더 이름을 입력해 주세요.')
  if (input.timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }) }
    catch { throw new AppError('INVALID_INPUT', '시간대를 확인해 주세요.') }
  }
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  }
}

const SHARE_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: '로그인이 필요합니다.',
  FORBIDDEN: '이 캘린더를 관리할 권한이 없어요.',
  CALENDAR_NOT_FOUND: '공유 캘린더를 찾지 못했어요.',
  NOT_MEMBER: '이미 캘린더에서 나간 멤버예요.',
  LAST_OWNER: '마지막 소유자는 나가거나 권한을 낮출 수 없어요. 먼저 소유권을 넘겨 주세요.',
  ALREADY_MEMBER: '이미 참여 중인 사용자예요.',
  INVALID_EMAIL: '이메일 주소를 확인해 주세요.',
  INVALID_INPUT: '입력값을 확인해 주세요.',
  INVITE_INVALID: '유효하지 않은 초대예요.',
  INVITE_REVOKED: '취소되었거나 이미 처리된 초대예요.',
  INVITE_EXPIRED: '만료된 초대예요. 새 초대를 요청해 주세요.',
  NOT_FOUND: '초대를 찾지 못했어요.',
}

/** RPCs raise stable codes; anything else falls back to the shared DB error mapping. */
export function mapShareError(error: { message?: string; code?: string }): AppError {
  const code = Object.keys(SHARE_ERRORS).find(key => error.message === key)
  if (code) return new AppError(code, SHARE_ERRORS[code], error)
  if (error.code === '42501') return new AppError('FORBIDDEN', SHARE_ERRORS.FORBIDDEN, error)
  return mapDbError(error)
}

const ROLES: CalendarRole[] = ['owner', 'editor', 'viewer']
const role = (value: unknown): CalendarRole => ROLES.find(item => item === value) ?? 'viewer'
const inviteRole = (value: unknown): InviteRole => value === 'editor' ? 'editor' : 'viewer'
const str = (value: unknown): string => typeof value === 'string' ? value : ''

function sharedColumns(input: Partial<SharedCalendarInput>) {
  if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 80)) {
    throw new AppError('INVALID_INPUT', '캘린더 이름은 1~80자로 입력해 주세요.')
  }
  if (input.description !== undefined && input.description.length > 500) throw new AppError('INVALID_INPUT', '설명은 500자 이내로 입력해 주세요.')
  if (input.color !== undefined && !/^#[0-9a-f]{6}$/i.test(input.color)) throw new AppError('INVALID_INPUT', '색상을 확인해 주세요.')
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description.trim() } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  }
}

type RpcCall = (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>

export function createCalendarRepository(client: SupabaseClient<Database>) {
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await (client.rpc as unknown as RpcCall).call(client, name, args)
    if (error) throw mapShareError(error)
    return data as T
  }
  return {
    async getCalendars(): Promise<Calendar[]> {
      const { data, error } = await client.from('calendars').select('*').order('created_at')
      if (error) throw mapDbError(error)
      return (data ?? []).map(mapCalendarRow)
    },
    async getCalendar(id: string): Promise<Calendar> {
      const { data, error } = await client.from('calendars').select('*').eq('id', id).single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    async getDefaultPersonalCalendar(): Promise<Calendar> {
      const { data, error } = await client.from('calendars').select('*').eq('is_default_personal', true).single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    async createCalendar(input: PersonalCalendarInput): Promise<Calendar> {
      const { data: auth, error: authError } = await client.auth.getUser()
      if (authError || !auth.user) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
      const { data, error } = await client.from('calendars').insert({
        ...columns(input), owner_user_id: auth.user.id, type: 'personal',
      }).select('*').single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    async updateCalendar(id: string, input: Partial<PersonalCalendarInput>): Promise<Calendar> {
      const { data, error } = await client.from('calendars').update(columns(input)).eq('id', id).select('*').single()
      if (error) throw mapDbError(error)
      return mapCalendarRow(data)
    },
    /** Readable calendars with this user's role and display choices; personal and external ones are owned. */
    async listCalendarEntries(userId: string): Promise<CalendarEntry[]> {
      const [calendars, members] = await Promise.all([
        client.from('calendars').select('*').order('created_at'),
        client.from('calendar_members').select('calendar_id, role, hidden, notify').eq('user_id', userId),
      ])
      if (calendars.error) throw mapDbError(calendars.error)
      if (members.error) throw mapDbError(members.error)
      const mine = new Map((members.data ?? []).map(row => [row.calendar_id, row]))
      return (calendars.data ?? []).flatMap((row) => {
        const calendar = mapCalendarRow(row)
        const member = mine.get(calendar.id)
        // A shared calendar without my membership row is mid-revocation; leave it out.
        if (calendar.type === 'shared' && !member) return []
        return [{ ...calendar, role: member ? role(member.role) : 'owner', hidden: member?.hidden ?? false, notify: member?.notify ?? true }]
      })
    },
    async createSharedCalendar(input: SharedCalendarInput): Promise<Calendar> {
      const { data: auth, error: authError } = await client.auth.getUser()
      if (authError || !auth.user) throw new AppError('UNAUTHORIZED', '로그인이 필요합니다.')
      const columns = sharedColumns(input)
      if (!columns.name) throw new AppError('INVALID_INPUT', '캘린더 이름을 입력해 주세요.')
      const { data, error } = await client.from('calendars').insert({
        ...columns, name: columns.name, owner_user_id: auth.user.id, type: 'shared',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
      }).select('*').single()
      if (error) throw mapShareError(error)
      return mapCalendarRow(data)
    },
    async updateSharedCalendar(id: string, input: Partial<SharedCalendarInput>): Promise<Calendar> {
      const { data, error } = await client.from('calendars').update(sharedColumns(input)).eq('id', id).select('*').single()
      if (error) throw error.code === 'PGRST116' ? new AppError('FORBIDDEN', SHARE_ERRORS.FORBIDDEN, error) : mapShareError(error)
      return mapCalendarRow(data)
    },
    /** Owner only; removes every schedule in the calendar for all members. */
    async deleteSharedCalendar(id: string): Promise<void> {
      const { data, error } = await client.from('calendars').delete().eq('id', id).eq('type', 'shared').select('id')
      if (error) throw mapShareError(error)
      if (!data?.length) throw new AppError('FORBIDDEN', SHARE_ERRORS.FORBIDDEN)
    },
    async setCalendarDisplay(calendarId: string, userId: string, patch: { hidden?: boolean; notify?: boolean }): Promise<void> {
      const { error } = await client.from('calendar_members').update(patch).eq('calendar_id', calendarId).eq('user_id', userId)
      if (error) throw mapShareError(error)
    },
    async listMembers(calendarId: string): Promise<CalendarMember[]> {
      const rows = await rpc<Record<string, unknown>[]>('calendar_member_list', { p_calendar: calendarId })
      return (rows ?? []).map(row => ({
        userId: str(row.user_id), role: role(row.role), displayName: str(row.display_name), email: str(row.email),
        joinedAt: str(row.joined_at), isMe: row.is_me === true,
      }))
    },
    async listInvitations(calendarId: string): Promise<CalendarInvitation[]> {
      const { data, error } = await client.from('calendar_invitations')
        .select('id, calendar_id, kind, email, role, status, expires_at, created_at')
        .eq('calendar_id', calendarId).eq('status', 'pending').order('created_at', { ascending: false })
      if (error) throw mapShareError(error)
      return (data ?? []).map(row => ({
        id: row.id, calendarId: row.calendar_id, kind: row.kind === 'link' ? 'link' as const : 'email' as const, email: row.email,
        role: inviteRole(row.role), status: 'pending' as const, expiresAt: row.expires_at, createdAt: row.created_at,
      }))
    },
    async inviteByEmail(calendarId: string, email: string, inviteAs: InviteRole, days = 7): Promise<void> {
      await rpc('invite_calendar_member', { p_calendar: calendarId, p_email: email, p_role: inviteAs, p_days: days })
    },
    /** Issuing a link revokes the previous one; the token is only available from this call. */
    async createInviteLink(calendarId: string, inviteAs: InviteRole, days = 7): Promise<InviteLink> {
      const rows = await rpc<Record<string, unknown>[]>('create_calendar_invite_link', { p_calendar: calendarId, p_role: inviteAs, p_days: days })
      const row = rows?.[0]
      if (!row || typeof row.token !== 'string') throw new AppError('REQUEST_FAILED', '초대 링크를 만들지 못했어요.')
      return { id: str(row.id), token: row.token, role: inviteRole(row.role), expiresAt: str(row.expires_at) }
    },
    async revokeInvitation(id: string): Promise<void> {
      await rpc('revoke_calendar_invitation', { p_invitation: id })
    },
    async previewInviteLink(token: string): Promise<InviteLinkPreview> {
      const rows = await rpc<Record<string, unknown>[]>('invite_link_preview', { p_token: token })
      const row = rows?.[0] ?? {}
      const state = ['pending', 'member', 'revoked', 'expired'].includes(str(row.state)) ? str(row.state) as InviteLinkPreview['state'] : 'invalid'
      return {
        state, calendarId: str(row.calendar_id) || null, calendarName: str(row.calendar_name) || null,
        calendarColor: str(row.calendar_color) || null, role: row.role ? inviteRole(row.role) : null,
        inviterName: str(row.inviter_name) || null, expiresAt: str(row.expires_at) || null,
      }
    },
    async acceptInviteLink(token: string): Promise<string> {
      return rpc<string>('accept_calendar_invite_link', { p_token: token })
    },
    /** Links email invitations to this account after sign-in; returns how many were newly linked. */
    async claimInvitations(): Promise<number> {
      return rpc<number>('claim_calendar_invitations', {})
    },
    async listReceivedInvitations(): Promise<ReceivedInvitation[]> {
      const rows = await rpc<Record<string, unknown>[]>('my_calendar_invitations', {})
      return (rows ?? []).map(row => ({
        id: str(row.id), calendarId: str(row.calendar_id), calendarName: str(row.calendar_name),
        calendarColor: str(row.calendar_color), role: inviteRole(row.role), inviterName: str(row.inviter_name),
        expiresAt: str(row.expires_at),
      }))
    },
    async respondInvitation(id: string, accept: boolean): Promise<string> {
      return rpc<string>('respond_calendar_invitation', { p_invitation: id, p_accept: accept })
    },
    async setMemberRole(calendarId: string, userId: string, next: CalendarRole): Promise<void> {
      await rpc('set_calendar_member_role', { p_calendar: calendarId, p_user: userId, p_role: next })
    },
    async transferOwnership(calendarId: string, userId: string): Promise<void> {
      await rpc('transfer_calendar_ownership', { p_calendar: calendarId, p_user: userId })
    },
    /** Removing yourself is leaving the calendar. */
    async removeMember(calendarId: string, userId: string): Promise<void> {
      await rpc('remove_calendar_member', { p_calendar: calendarId, p_user: userId })
    },
    /** Default personal calendars and nonempty calendars cannot be deleted. */
    async deleteCalendar(id: string): Promise<void> {
      const { error } = await client.from('calendars').delete().eq('id', id).select('id').single()
      if (error) throw mapDbError(error)
    },
  }
}

export type CalendarRepository = ReturnType<typeof createCalendarRepository>
