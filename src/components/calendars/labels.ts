import type { AppNotification, CalendarRole } from '@blanky/types'

export const ROLE_LABEL: Record<CalendarRole, string> = { owner: '소유자', editor: '편집자', viewer: '조회자' }

export const ROLE_HINT: Record<CalendarRole, string> = {
  owner: '캘린더 삭제, 멤버와 권한 관리, 모든 일정 관리',
  editor: '공유 일정 추가·수정·삭제',
  viewer: '공유 일정 보기만 가능',
}

function roleName(value: string | null): string {
  return value === 'owner' || value === 'editor' || value === 'viewer' ? ROLE_LABEL[value] : '멤버'
}

export function notificationText(item: AppNotification): string {
  const who = item.actorName || '누군가'
  const calendar = `'${item.calendarName || '공유 캘린더'}'`
  const title = `'${item.title || '제목 없음'}'`
  const times = item.count > 1 ? ` (${item.count}회)` : ''
  switch (item.type) {
    case 'invite_received': return `${who}님이 ${calendar} 캘린더에 ${roleName(item.role)}(으)로 초대했어요`
    case 'invite_accepted': return `${who}님이 ${calendar} 초대를 수락했어요`
    case 'invite_declined': return `${who}님이 ${calendar} 초대를 거절했어요`
    case 'schedule_created': return `${who}님이 ${calendar}에 ${title} 일정을 추가했어요${times}`
    case 'schedule_updated': return `${who}님이 ${calendar}의 ${title} 일정을 변경했어요${times}`
    case 'schedule_deleted': return `${who}님이 ${calendar}의 ${title} 일정을 삭제했어요${times}`
    case 'member_removed': return `${calendar} 캘린더에서 내보내졌어요`
    case 'role_changed': return `${calendar} 캘린더 권한이 ${roleName(item.role)}(으)로 바뀌었어요`
    case 'ownership_transferred': return `${calendar} 캘린더의 소유자가 되었어요`
  }
}

export function relativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60000)
  if (minutes < 1) return '방금'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.round(hours / 24)
  return days < 7 ? `${days}일 전` : new Date(iso).toLocaleDateString('ko-KR')
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${encodeURIComponent(token)}`
}
