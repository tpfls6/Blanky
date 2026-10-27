import { parseScheduleText } from '../../../packages/parse/src/parse.ts'
import { routeInput, PlannerRequiredError } from '../../../packages/parse/src/intentRouter.ts'
import type { WorkItem, WorkPatch, WorkspaceCategory } from '../../types/work.ts'

export type Intent =
  | { type: 'create'; text: string }
  | { type: 'list'; date: string }
  | { type: 'update'; item: WorkItem; patch: WorkPatch }
  | { type: 'reply'; text: string }

/** Route commands; all date/time interpretation stays in the existing parser. */
export function conversationIntent(text: string, items: WorkItem[], lastId: string | null, today: Date, categories: WorkspaceCategory[]): Intent {
  const route = routeInput(text)
  if(route.route==='reschedule')return {type:'reply',text:'자동 재배치는 준비 중이에요. 기존 일정은 변경하지 않았어요.'}
  if (route.route === 'planner') return { type: 'reply', text: new PlannerRequiredError().message }
  if (route.route === 'ai') {
    if (/(바꿔|변경|미뤄|수정해|완료해|완료 처리|삭제|지워|뭐 있어|보여|알려|조회)/.test(text)) return { type: 'reply', text: '여러 항목의 변경이나 조회는 각각 요청해 주세요. 복합 입력 분석은 새 일정과 할 일 추가를 지원해요.' }
    return { type: 'create', text: text.replace(/\s*(?:추가해\s*줘|추가해줘|추가|등록해줘)\s*[.!?]?$/, '').trim() }
  }
  const parsed = parseScheduleText(text, { today, categories })
  if (/(정리해|시간 찾아|추천|재배치)/.test(text)) return { type: 'reply', text: '자동 정리와 빈 시간 추천은 준비 중이에요. 일정 조회, 추가, 시간 변경, 할 일 완료를 도와드릴 수 있어요.' }
  if (/(뭐 있어|보여|알려|조회)/.test(text)) return { type: 'list', date: parsed.draft.date ?? '' }
  if (/(바꿔|변경|미뤄|미뤄줘|수정해|완료해|완료 처리)/.test(text)) {
    const referring = /(그거|그것|방금|이 일정|이 할 일)/.test(text)
    let matches = referring ? items.filter(item => item.id === lastId) : items.filter(item => text.includes(item.title))
    // A date on a named item identifies it; a pronoun date is its destination.
    if (!referring && /(오늘|내일|모레|요일)/.test(text) && parsed.draft.date) {
      const onDate = matches.filter(item => item.date === parsed.draft.date)
      if (onDate.length) matches = onDate
    }
    if (matches.length !== 1) return { type: 'reply', text: matches.length ? '같은 이름이 여러 개예요. 날짜와 제목을 함께 입력해 주세요.' : '변경할 항목을 찾지 못했어요. 정확한 제목을 알려 주세요.' }
    const item = matches[0]
    if (/완료/.test(text)) return { type: 'update', item, patch: { status: 'done' } }
    const rename = /제목(?:을)?\s*["“]?(.+?)["”]?(?:으로|로)\s*(?:바꿔|변경)/.exec(text)
    if (rename) return { type: 'update', item, patch: { title: rename[1].trim() } }
    const relative = /(?:(\d+)\s*시간|한\s*시간)\s*뒤로/.exec(text)
    let start = parsed.draft.startTime
    if (relative && item.startTime) {
      const [h, m] = item.startTime.split(':').map(Number)
      const minutes = h * 60 + m + Number(relative[1] ?? 1) * 60
      if (minutes >= 1440) return { type: 'reply', text: '자정을 넘는 변경은 날짜와 시간을 직접 지정해 주세요.' }
      start = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    }
    if (!start && /(오늘|내일|모레|요일|\d+\s*월)/.test(text) && parsed.draft.date) {
      return { type: 'update', item, patch: item.kind === 'task' && /마감|까지/.test(text)
        ? { dueDate: parsed.draft.dueDate ?? parsed.draft.date }
        : { date: parsed.draft.date } }
    }
    if (!start) return { type: 'reply', text: '변경할 시간을 알려 주세요. 예: 그거 오후 5시로 바꿔줘' }
    // Bare follow-up hours retain the previous morning/afternoon context.
    if (!/(오전|오후|저녁|밤|\d{1,2}:\d{2})/.test(text) && item.startTime && Number(item.startTime.slice(0, 2)) >= 12 && Number(start.slice(0, 2)) < 12) start = `${Number(start.slice(0, 2)) + 12}${start.slice(2)}`
    const duration = item.duration ?? 60
    const [h, m] = start.split(':').map(Number)
    const end = h * 60 + m + duration
    if (end >= 1440) return { type: 'reply', text: '종료 시간이 자정을 넘어요. 다른 시간을 지정해 주세요.' }
    return { type: 'update', item, patch: { startTime: start, endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`, duration, allDay: false,
      ...(/(오늘|내일|모레|요일)/.test(text) && parsed.draft.date ? { date: parsed.draft.date } : {}) } }
  }
  if (/(삭제|지워)/.test(text)) return { type: 'reply', text: '아래 항목 카드의 삭제 버튼으로 삭제할 수 있어요.' }
  if (text.endsWith('?')) return { type: 'reply', text: '일정 조회, 추가, 시간 변경, 할 일 완료를 요청해 주세요.' }
  return { type: 'create', text: text.replace(/\s*(?:추가해\s*줘|추가해줘|추가|등록해줘)\s*[.!]?$/, '').trim() }
}
