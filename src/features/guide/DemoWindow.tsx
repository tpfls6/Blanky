import type { CSSProperties } from 'react'
import { BookOpen, CalendarDays, Clapperboard, House, Library, NotebookPen, StickyNote, type LucideIcon } from 'lucide-react'
import { BrandLogo } from '../../components/common/BrandLogo.tsx'
import { ScheduleTimeline } from '../../components/schedule/ScheduleTimeline.tsx'
import { TaskCheckbox } from '../../components/tasks/TaskCheckbox.tsx'
import type { WorkItem, WorkspaceCategory } from '../../types/work.ts'

export type WindowView = 'schedule' | 'movie' | 'study'

const pad = (value: number) => String(value).padStart(2, '0')
const now = new Date()
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
const TODAY_LABEL = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
const HOURS = Array.from({ length: 10 }, (_, index) => `${pad(index + 9)}:00`)

const CATEGORIES: WorkspaceCategory[] = [
  { id: 'study', name: '공부', parentId: null, color: '#3a62b0' },
  { id: 'life', name: '생활', parentId: null, color: '#2f7d5b' },
  { id: 'work', name: '프로젝트', parentId: null, color: '#7c5cc4' },
  { id: 'health', name: '운동', parentId: null, color: '#c27832' },
]

const event = (id: string, title: string, startTime: string, endTime: string, categoryId: string): WorkItem => ({
  id, kind: 'event', title, description: '', date: TODAY, startTime, endTime, duration: null, categoryId, priority: 'medium',
  status: 'todo', dueDate: null, endDate: null, allDay: false, repeat: 'none',
})

const EVENTS = [
  event('class', '영어 스터디', '09:00', '10:30', 'study'),
  event('lunch', '점심 약속', '12:30', '13:30', 'life'),
  event('meeting', '팀 프로젝트 회의', '15:00', '16:00', 'work'),
  event('run', '저녁 러닝', '17:30', '18:30', 'health'),
]

const TASKS = [
  { title: '발표자료 완성하기', meta: '금요일 마감', done: false },
  { title: '독서 모임 책 읽기', meta: '오늘', done: false },
  { title: '장보기 목록 정리', meta: '오늘', done: true },
]

const MOVIES = [
  { title: '리틀 포레스트', meta: '임순례 · ★★★★', note: '내 손으로 밥 한 끼를 해 먹는 마음을 기억하기.' },
  { title: '기생충', meta: '봉준호 · ★★★★★', note: '계단을 오르내리는 장면이 오래 남았다.' },
  { title: '인터스텔라', meta: '크리스토퍼 놀란', note: '보고 싶어요' },
]

const STUDY = [
  { title: 'React 상태 관리의 기본', subject: '개발', time: '75분', state: '이해 완료' },
  { title: '영어 관계대명사 정리', subject: '영어', time: '40분', state: '복습 필요' },
  { title: '확률 분포와 기댓값', subject: '수학', time: '50분', state: '학습 중' },
]

const NAV: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: '홈', icon: House },
  { id: 'schedule', label: '일정', icon: CalendarDays },
  { id: 'diary', label: '일기', icon: BookOpen },
  { id: 'reading', label: '독서', icon: Library },
  { id: 'memo', label: '메모', icon: StickyNote },
]

const PAGES: Record<Exclude<WindowView, 'schedule'>, { label: string; icon: LucideIcon }> = {
  movie: { label: '영화 기록', icon: Clapperboard },
  study: { label: '공부 관리', icon: NotebookPen },
}

const noop = () => undefined

function ScheduleView() {
  return (
    <>
      <div className="demo-window-bar">
        <p className="text-sm font-medium">{TODAY_LABEL}</p>
        <div className="demo-window-input"><span>일정이나 할 일을 입력하세요</span><span className="demo-window-send">전송</span></div>
      </div>
      <div className="demo-window-board">
        <section className="demo-window-panel">
          <p className="demo-window-label">일정</p>
          <ScheduleTimeline items={EVENTS} categories={CATEGORIES} day={TODAY} hours={HOURS} hourHeight={38} editing={false} onOpen={noop} onToggle={noop} onDropHour={noop} onResize={noop} />
        </section>
        <section className="demo-window-panel demo-window-tasks">
          <p className="demo-window-label">할 일</p>
          <ul>
            {TASKS.map(task => (
              <li key={task.title}>
                <TaskCheckbox checked={task.done} label={task.title} onChange={noop} />
                <span className="min-w-0">
                  <span className={`block truncate text-[13px] ${task.done ? 'line-through opacity-60' : ''}`}>{task.title}</span>
                  <span className="block text-[11px] text-[var(--muted)]">{task.meta}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

function MovieView() {
  return (
    <div className="demo-window-page">
      <p className="text-lg font-medium">영화 기록</p>
      <ul className="demo-window-posters">
        {MOVIES.map(movie => (
          <li key={movie.title}>
            <span className="demo-window-poster">{movie.title}</span>
            <span className="mt-2 block truncate text-[13px] font-medium">{movie.title}</span>
            <span className="block text-[11px] text-[var(--muted)]">{movie.meta}</span>
            <span className="mt-1 line-clamp-2 block text-[11px] text-[var(--muted)]">{movie.note}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StudyView() {
  return (
    <div className="demo-window-page">
      <p className="text-lg font-medium">공부 관리</p>
      <table className="demo-window-table">
        <thead><tr><th>공부 내용</th><th>과목</th><th>시간</th><th>상태</th></tr></thead>
        <tbody>
          {STUDY.map(row => <tr key={row.title}><td>{row.title}</td><td>{row.subject}</td><td>{row.time}</td><td><span className="demo-window-tag">{row.state}</span></td></tr>)}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A static picture of the signed-in workspace, built from the app's own timeline and task
 * components. Inert: it shows the app rather than being one.
 */
export function DemoWindow({ view = 'schedule', className = '', style }: { view?: WindowView; className?: string; style?: CSSProperties }) {
  const page = view === 'schedule' ? null : PAGES[view]
  const current = page ? view : 'schedule'
  return (
    <div className={`demo-window ${className}`} style={style} inert aria-hidden="true">
      <aside className="demo-window-side theme-sidebar">
        <BrandLogo className="px-2" />
        <nav className="mt-6 flex flex-col gap-0.5">
          {NAV.map(item => <span key={item.id} className="nav-link" aria-current={item.id === current ? 'page' : undefined}><item.icon strokeWidth={1.5} />{item.label}</span>)}
          {page ? <>
            <span className="mt-5 px-2 pb-1 text-[11px] text-[var(--muted)]">내 페이지</span>
            <span className="nav-link" aria-current="page"><page.icon strokeWidth={1.5} />{page.label}</span>
          </> : null}
        </nav>
      </aside>
      <div className="demo-window-main">
        {view === 'movie' ? <MovieView /> : view === 'study' ? <StudyView /> : <ScheduleView />}
      </div>
    </div>
  )
}
