import { FAMILY_TERMS, resolveClock, type IntentExtraction, type RoutineFamily, type UserIntent } from '../../../packages/parse/src/intents.ts'
import { isGoogleOriginWork } from '../../services/calendarSync/origin.ts'
import { occursOn } from '../../utils/calendarMonth.ts'
import type { WorkItem, WorkPatch } from '../../types/work.ts'
import { applySeriesChangeLocally, groupSeries, isRecurring, nextOccurrence, planGroupDelete, planGroupPatch, seriesKey, shiftISO, type SeriesChange } from '../schedule/seriesEdit.ts'
import { saveConflicts, type AutoSaveInput } from './autoSave.ts'

/**
 * Turns extracted intents into concrete changes against the user's saved schedules.
 * A change to an existing item is always a SeriesChange, so a recurring series changed for one
 * day is cut around that day (the rule itself stays) exactly like the 반복 일정 editor does.
 */
export type IntentAction =
  | { op: 'create'; intentId: string; input: AutoSaveInput; label: string }
  | { op: 'change'; intentId: string; target: WorkItem; changes: SeriesChange[]; label: string; recurring: boolean; removes: boolean }
  | { op: 'record'; intentId: string; type: 'memo' | 'diary'; text: string; label: string }

export type IntentPlan = {
  actions: IntentAction[]
  /** Information only the user can give; nothing was invented in its place. */
  questions: string[]
  /** Why the plan waits for 실행: recurring edits, deletes, conflicts, guesses. */
  confirm: string[]
  mode: 'auto' | 'preview'
  source: 'rule' | 'ai'
}

export type IntentPlanOptions = { today: string; lastId?: string | null; makeId?: () => string }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const FAMILY_LABEL: Record<RoutineFamily, string> = { work: '근무', school: '수업' }

/** "1/5(화)"; a day in another year than `today` carries its year ("2027/1/5(화)") so it is never mistaken for this year's. */
export function dayLabel(iso: string, today: Date = new Date()): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${year !== today.getFullYear() ? `${year}/` : ''}${month}/${day}(${WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()]})`
}

/** Korean particle after a quoted title: '근로'를, '회의'를, '수업'을. */
function josa(word: string, pair: '을를' | '은는' | '이가' | '과와'): string {
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00
  const final = code >= 0 && code <= 11171 ? code % 28 !== 0 : /[0136781lmnr]$/i.test(word.trim())
  return `'${word}'${final ? pair[0] : pair[1]}`
}

function minutes(clock: string): number {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5))
}

function clock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function endOf(item: Pick<WorkItem, 'startTime' | 'endTime' | 'duration'>): string | null {
  if (item.endTime) return item.endTime
  if (!item.startTime) return null
  const end = minutes(item.startTime) + (item.duration ?? 60)
  return end < 1440 ? clock(end) : null
}

/** Spacing and case never decide a match: "도현 오빠" is "도현오빠". */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '')
}

function familyMatches(title: string, family: RoutineFamily): boolean {
  const name = normalizeTitle(title)
  return FAMILY_TERMS[family].some(term => name === term || (term.length >= 2 && name.includes(term)))
}

function termMatches(title: string, term: string): boolean {
  const name = normalizeTitle(title)
  const word = normalizeTitle(term)
  return !!word && (name.includes(word) || (name.length >= 2 && word.includes(name)))
}

function score(item: WorkItem, intent: UserIntent): number {
  const terms = intent.targetTerms.filter(term => term !== '@last')
  const hits = terms.filter(term => termMatches(item.title, term)).length
  return hits * 2 + (intent.family && familyMatches(item.title, intent.family) ? 1 : 0)
}

/** Saved items the intent points at; the date narrows them to the occurrence that day. */
export function findTargets(intent: UserIntent, items: readonly WorkItem[], options: IntentPlanOptions): WorkItem[] {
  if (intent.targetTerms[0] === '@last') {
    const last = items.find(item => item.id === options.lastId)
    if (last) return [last]
  }
  let candidates = items.map(item => ({ item, points: score(item, intent) })).filter(row => row.points > 0)
  if (intent.date) candidates = candidates.filter(row => occursOn(row.item, intent.date!) || row.item.date === intent.date)
  else candidates = candidates.filter(row => isRecurring(row.item) || (row.item.dueDate ?? row.item.endDate ?? row.item.date) >= options.today)
  if (intent.kind === 'modify' || intent.kind === 'cancel') candidates = candidates.filter(row => row.item.status !== 'done' || row.item.kind === 'event')
  const best = Math.max(0, ...candidates.map(row => row.points))
  return candidates.filter(row => row.points === best).map(row => row.item)
}

function targetName(intent: UserIntent): string {
  const words = intent.targetTerms.filter(term => term !== '@last')
  return words.join(' ') || (intent.family ? FAMILY_LABEL[intent.family] : '그 일정')
}

type Occurrence = { date: string; start: string | null; end: string | null; title: string }

/** The occurrence of `item` on `date` after the planned changes so far. */
function occurrenceOn(rows: readonly WorkItem[], seriesOf: string, date: string): Occurrence | null {
  const row = rows.find(entry => seriesKey(entry) === seriesOf && !isRecurring(entry) && occursOn(entry, date))
    ?? rows.find(entry => seriesKey(entry) === seriesOf && occursOn(entry, date))
  return row ? { date, start: row.startTime, end: endOf(row), title: row.title } : null
}

function overlaps(rows: readonly WorkItem[], date: string, start: string | null, end: string | null, ignore: string): string[] {
  if (!start) return []
  const from = minutes(start)
  const to = end ? minutes(end) : from + 60
  return rows.filter(row => row.kind === 'event' && seriesKey(row) !== ignore && row.startTime && occursOn(row, date))
    .filter(row => from < minutes(endOf(row) ?? clock(Math.min(1439, minutes(row.startTime!) + 60))) && minutes(row.startTime!) < to)
    .map(row => `'${row.title}'(${row.startTime}${row.endTime ? '–' + row.endTime : ''}) 일정과 시간이 겹쳐요.`)
}

function scopeLabel(scope: UserIntent['scope'], date: string): string {
  return scope === 'all' ? '전체 반복' : scope === 'future' ? `${dayLabel(date)}부터` : `${dayLabel(date)} 하루만`
}

/** A one-off copy of a series occurrence moved to another day; it stays linked to the series. */
function movedOccurrence(item: WorkItem, patch: WorkPatch, date: string, id: string): WorkItem {
  const copy: WorkItem = { ...item, ...patch, id, date, endDate: null, repeat: 'none', repeatDays: [], repeatUntil: null, seriesId: seriesKey(item) }
  delete copy.changeSource
  return copy
}

export function planIntents(extraction: IntentExtraction, items: readonly WorkItem[], options: IntentPlanOptions): IntentPlan {
  const makeId = options.makeId ?? (() => crypto.randomUUID())
  const actions: IntentAction[] = []
  const questions: string[] = []
  const confirm: string[] = []
  let world: WorkItem[] = [...items]
  const settled = new Map<string, Occurrence>()

  for (const intent of extraction.intents) {
    if (intent.kind === 'memo' || intent.kind === 'diary') {
      actions.push({ op: 'record', intentId: intent.id, type: intent.kind, text: intent.title ?? intent.clause, label: `${intent.kind === 'memo' ? '메모' : '일기'}: ${intent.title ?? intent.clause}` })
      continue
    }

    if (intent.kind === 'create_event' || intent.kind === 'create_task') {
      const title = intent.title?.trim()
      if (!title) { questions.push(`'${intent.clause}'에서 무엇을 추가할지 알려 주세요.`); continue }
      const event = intent.kind === 'create_event'
      if (!intent.date && event) { questions.push(`${josa(title, '은는')} 언제인가요? 날짜를 알려 주세요.`); continue }
      // A to-do with no day or deadline is saved undated; today is only the stored day, never a guess shown on the calendar.
      const undated = !intent.date
      const day = intent.date ?? options.today
      const anchor = intent.afterId ? settled.get(intent.afterId) : undefined
      const after = anchor?.date === intent.date ? anchor : undefined
      let start: string | null = null
      let end: string | null = null
      if (event && intent.start) {
        const read = resolveClock(intent.start, { after: after?.end ? clock(minutes(after.end) - 1) : null })
        start = read.time
        if (read.guessed) confirm.push(`'${title}' ${intent.start.hour}시를 ${start}로 이해했어요. 오전이라면 고쳐 주세요.`)
        if (intent.end) end = resolveClock(intent.end, { after: start }).time
      }
      const deadline = !event && !undated && /까지|마감|전까지/.test(intent.clause)
      const dueTime = deadline && intent.end ? resolveClock(intent.end).time : null
      const note = after?.end ? `${after.title} 끝난 뒤 ${after.end} 이후` : ''
      const input: AutoSaveInput = {
        id: makeId(), kind: event ? 'event' : 'task', title, date: day, ...(undated ? { undated: true } : {}),
        startTime: start, endTime: end, duration: start && end && end > start ? minutes(end) - minutes(start) : null,
        dueDate: deadline ? day : null, dueTime, allDay: event && !start,
        description: [note, intent.note].filter(Boolean).join('\n'), priority: 'medium', status: 'todo', repeat: 'none', categoryId: null,
      }
      if (event && !start) {
        questions.push(`${josa(title, '은는')} 몇 시인가요?${note ? ` (${note})` : ''} 알려 주시면 시간을 넣을게요. 지금은 시간 없이 저장해요.`)
        confirm.push(`'${title}' 시간이 정해지지 않았어요.`)
      }
      confirm.push(...saveConflicts(input, world))
      const when = [undated ? '날짜 없음' : dayLabel(day), start ? (end ? `${start}–${end}` : start) : event ? '시간 미정' : deadline ? '까지' : ''].filter(Boolean).join(' ')
      actions.push({ op: 'create', intentId: intent.id, input, label: `새 ${event ? '일정' : '할 일'}: ${title} · ${when}${note ? ` (${note})` : ''}` })
      settled.set(intent.id, { date: day, start, end, title })
      continue
    }

    // modify, cancel and anchor all point at something already saved.
    const matches = findTargets(intent, world, options)
    const name = targetName(intent)
    const where = intent.date ? `${dayLabel(intent.date)} ` : ''
    if (!matches.length) {
      if (intent.kind !== 'anchor') questions.push(`${where}'${name}' 일정을 찾지 못했어요. 저장된 일정의 제목을 알려 주세요.`)
      continue
    }
    if (matches.length > 1) {
      if (intent.kind !== 'anchor') questions.push(`${where}'${name}'에 해당하는 일정이 여러 개예요: ${matches.slice(0, 4).map(item => `${item.title}${item.startTime ? ` ${item.startTime}` : ''}`).join(', ')}. 어느 것인지 알려 주세요.`)
      continue
    }
    const target = matches[0]
    const recurring = isRecurring(target)
    let date = intent.date ?? (recurring ? null : target.date)
    if (recurring && !date && intent.scope === 'this') {
      if (intent.kind !== 'anchor') questions.push(`반복 일정 '${target.title}'의 어느 날짜를 ${intent.kind === 'cancel' ? '취소할까요' : '바꿀까요'}? 앞으로 전부라면 '앞으로'라고 말해 주세요.`)
      continue
    }
    if (recurring && date && !occursOn(target, date)) date = nextOccurrence(target, shiftISO(date, -1))
    if (!date) date = target.date
    const key = seriesKey(target)
    const current = occurrenceOn(world, key, date) ?? { date, start: target.startTime, end: endOf(target), title: target.title }

    if (intent.kind === 'anchor') { settled.set(intent.id, current); continue }

    const group = recurring ? groupSeries(world).find(entry => entry.key === key) : undefined
    let changes: SeriesChange[]
    let label: string

    if (intent.kind === 'cancel') {
      if (isGoogleOriginWork(target)) { questions.push(`${josa(target.title, '은는')} Google 캘린더에서 가져온 일정이라 여기서 지우지 않았어요.`); continue }
      changes = group ? planGroupDelete(group, date, intent.scope) : [{ remove: target }]
      label = `취소: ${target.title} · ${recurring ? `${scopeLabel(intent.scope, date)} (반복 규칙은 유지)` : dayLabel(date)}`
      confirm.push(`'${target.title}' ${recurring ? '반복 일정의 일부를' : '일정을'} 삭제해요. 휴지통에서 복구할 수 있어요.`)
    } else {
      let start = current.start
      let end = current.end
      let newDate = intent.newDate
      const length = start && end ? minutes(end) - minutes(start) : target.duration ?? 60
      if (intent.start && intent.end) {
        start = resolveClock(intent.start, { near: current.start }).time
        end = resolveClock(intent.end, { after: start }).time
      } else if (intent.boundary === 'end' && intent.end) {
        end = resolveClock(intent.end, { after: current.start }).time
      } else if (intent.boundary === 'start' && intent.start) {
        start = resolveClock(intent.start, { near: current.start }).time
      } else if (intent.start) {
        start = resolveClock(intent.start, { near: current.start }).time
        end = minutes(start) + length < 1440 ? clock(minutes(start) + length) : null
      }
      if (intent.shiftMinutes) {
        if (Math.abs(intent.shiftMinutes) >= 1440) newDate = shiftISO(date, Math.round(intent.shiftMinutes / 1440))
        else if (!start) { questions.push(`${josa(target.title, '은는')} 시간이 없는 일정이라 몇 시로 바꿀지 알려 주세요.`); continue }
        else {
          const moved = minutes(start) + intent.shiftMinutes
          const movedEnd = (end ? minutes(end) : moved + length) + (end ? intent.shiftMinutes : 0)
          if (moved < 0 || movedEnd >= 1440) { questions.push(`${josa(target.title, '이가')} 자정을 넘어가요. 날짜와 시간을 직접 알려 주세요.`); continue }
          start = clock(moved)
          end = clock(movedEnd)
        }
      }
      if (start && end && minutes(end) <= minutes(start)) { questions.push(`'${target.title}'의 종료 시간이 시작보다 빨라요. 시간을 다시 알려 주세요.`); continue }
      const patch: WorkPatch = {}
      if (start !== current.start) Object.assign(patch, { startTime: start, allDay: !start })
      if (end !== current.end) patch.endTime = end
      if (patch.startTime !== undefined || patch.endTime !== undefined) patch.duration = start && end ? minutes(end) - minutes(start) : target.duration
      const moving = newDate && newDate !== date
      if (!Object.keys(patch).length && !moving) { questions.push(`${josa(target.title, '을를')} 어떻게 바꿀지(날짜나 시간) 알려 주세요.`); continue }
      if (moving && group && intent.scope === 'this') changes = [...planGroupDelete(group, date, 'this'), { create: [movedOccurrence(target, patch, newDate!, makeId())] }]
      else if (group) changes = planGroupPatch(group, date, intent.scope, moving ? { ...patch, date: newDate! } : patch)
      else changes = [{ update: { item: target, patch: moving ? { ...patch, date: newDate! } : patch } }]
      const before = current.start ? `${current.start}${current.end ? '–' + current.end : ''}` : '시간 없음'
      const after = start ? `${start}${end ? '–' + end : ''}` : '시간 없음'
      const what = moving ? `${dayLabel(date)} → ${dayLabel(newDate!)}${before !== after ? ` ${after}` : ''}` : `${before} → ${after}`
      label = `변경: ${target.title} · ${recurring ? scopeLabel(intent.scope, date) + ' ' : moving ? '' : dayLabel(date) + ' '}${what}${recurring ? ' (반복 규칙은 유지)' : ''}`
      if (recurring) confirm.push(`반복 일정 ${josa(target.title, '을를')} ${intent.scope === 'this' ? `${dayLabel(date)} 하루만` : intent.scope === 'future' ? `${dayLabel(date)}부터` : '전체'} 바꿔요.`)
      const landing = moving ? newDate! : date
      confirm.push(...overlaps(world, landing, start, end, key))
    }
    world = applySeriesChangeLocally(world, changes)
    const after = intent.kind === 'cancel' ? null : occurrenceOn(world, key, intent.newDate ?? date) ?? occurrenceOn(world, key, date)
    if (after) settled.set(intent.id, after)
    actions.push({ op: 'change', intentId: intent.id, target, changes, label, recurring, removes: changes.some(change => change.remove) || intent.kind === 'cancel' })
  }

  const unique = (rows: string[]) => [...new Set(rows)]
  const confirmations = unique(confirm)
  if (extraction.source === 'ai' && actions.length) confirmations.push('AI가 분석한 내용이에요. 맞는지 확인해 주세요.')
  const risky = confirmations.length > 0 || questions.length > 0 || actions.some(action => action.op === 'change' && (action.recurring || action.removes))
  return { actions, questions: unique(questions), confirm: confirmations, mode: risky ? 'preview' : 'auto', source: extraction.source }
}

export function describeIntentPlan(plan: IntentPlan, done = false): string {
  const lines: string[] = []
  if (!plan.actions.length) lines.push(plan.questions.length ? '확인이 필요해요. 아무것도 저장하지 않았어요.' : '처리할 내용을 찾지 못했어요.')
  else lines.push(done ? '이렇게 처리했어요.' : plan.mode === 'preview' ? '이렇게 처리할게요. 확인 후 실행해 주세요.' : '이렇게 처리할게요.')
  for (const action of plan.actions) lines.push(`- ${action.label}`)
  if (!done) for (const reason of plan.confirm) lines.push(`· ${reason}`)
  for (const question of plan.questions) lines.push(`? ${question}`)
  return lines.join('\n')
}

export type IntentRunResult = {
  saved: WorkItem[]
  failed: { label: string; reason: string }[]
  records: number
  /** Only the actions that did not land and may be retried: a retry neither repeats saved work nor drops failed work. */
  remaining: IntentPlan | null
}

/**
 * Runs each action on its own: one failure never undoes the others, and a target edited or deleted
 * since the preview is skipped rather than overwritten.
 */
export async function runIntentPlan(plan: IntentPlan, deps: {
  items: readonly WorkItem[]
  commitChange: (changes: SeriesChange[]) => Promise<{ updated: WorkItem[]; created: WorkItem[] }>
  createBatch: (inputs: AutoSaveInput[]) => Promise<WorkItem[]>
  saveRecord: (text: string, type: 'memo' | 'diary') => void
}): Promise<IntentRunResult> {
  const result: IntentRunResult = { saved: [], failed: [], records: 0, remaining: null }
  const retry = new Set<IntentAction>()
  const fail = (action: IntentAction, error: unknown) => {
    retry.add(action)
    result.failed.push({ label: action.label, reason: error instanceof Error ? error.message : '저장하지 못했어요.' })
  }
  const live = new Map(deps.items.map(item => [item.id, item]))
  const creates = plan.actions.filter((action): action is Extract<IntentAction, { op: 'create' }> => action.op === 'create')
  for (const action of plan.actions) {
    try {
      if (action.op === 'record') { deps.saveRecord(action.text, action.type); result.records++; continue }
      if (action.op !== 'change') continue
      const touched = action.changes.flatMap(change => [change.remove, change.update?.item].filter((row): row is WorkItem => !!row))
      if (touched.some(row => JSON.stringify(live.get(row.id)) !== JSON.stringify(row))) {
        result.failed.push({ label: action.label, reason: '미리보기 이후 일정이 바뀌어 건너뛰었어요. 다시 요청해 주세요.' })
        continue
      }
      const saved = await deps.commitChange(action.changes)
      result.saved.push(...saved.created, ...saved.updated)
    } catch (error) {
      fail(action, error)
    }
  }
  if (creates.length) {
    try { result.saved.push(...await deps.createBatch(creates.map(action => action.input))) }
    catch (error) {
      // The batch is one insert, so one bad item fails all. Each item is then tried alone so the good ones land;
      // ids are fixed, so an item already written is matched rather than copied.
      if (creates.length === 1) fail(creates[0], error)
      else for (const action of creates) {
        try { result.saved.push(...await deps.createBatch([action.input])) } catch (single) { fail(action, single) }
      }
    }
  }
  // A change skipped because its target moved since the preview is not retried: the plan no longer fits it.
  if (retry.size) result.remaining = { ...plan, actions: plan.actions.filter(action => retry.has(action)) }
  return result
}

/** Text for the chat after running: what landed, what did not, and what is still open. */
export function describeIntentRun(plan: IntentPlan, run: IntentRunResult): string {
  const failedLabels = new Set(run.failed.map(row => row.label))
  const lines = [run.failed.length ? '일부만 처리했어요.' : '처리했어요.']
  for (const action of plan.actions) if (!failedLabels.has(action.label)) lines.push(`- ${action.label}`)
  for (const row of run.failed) lines.push(`! ${row.label}: ${row.reason}`)
  for (const question of plan.questions) lines.push(`? ${question}`)
  return lines.join('\n')
}
