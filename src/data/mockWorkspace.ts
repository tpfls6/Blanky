import { addDays, formatISODate } from '@blanky/utils'
import type { WorkItem, WorkspaceCategory } from '../types/work.ts'

export const CATEGORIES: WorkspaceCategory[] = [
  { id: 'school', name: '학교', parentId: null },
  { id: 'project', name: '프로젝트', parentId: null },
  { id: 'personal', name: '개인', parentId: null },
  { id: 'ai', name: '인공지능', parentId: 'school' },
  { id: 'exam', name: '시험', parentId: 'school' },
  { id: 'study', name: '공부', parentId: 'school' },
  { id: 'blanky', name: 'Blanky', parentId: 'project' },
  { id: 'stockmate', name: 'StockMate', parentId: 'project' },
  { id: 'reading', name: '독서', parentId: 'personal' },
  { id: 'exercise', name: '운동', parentId: 'personal' },
]

function day(offset: number): string {
  return formatISODate(addDays(new Date(), offset))
}

function work(
  id: string,
  kind: WorkItem['kind'],
  title: string,
  date: string,
  extra: Partial<WorkItem> = {},
): WorkItem {
  return {
    id,
    kind,
    title,
    description: '',
    date,
    startTime: null,
    endTime: null,
    duration: null,
    categoryId: null,
    priority: 'medium',
    status: 'todo',
    dueDate: null,
    endDate: null,
    allDay: false,
    repeat: 'none',
    ...extra,
  }
}

export function createSeed(): WorkItem[] {
  const today = day(0)

  return [
    work('event-class', 'event', '수업', today, {
      description: '오전 수업',
      startTime: '09:00',
      endTime: '10:30',
      duration: 90,
      categoryId: 'study',
      priority: 'medium',
      repeat: 'weekly',
    }),
    work('event-lunch', 'event', '점심', today, {
      startTime: '13:00',
      endTime: '14:00',
      duration: 60,
      categoryId: 'personal',
      priority: 'low',
    }),
    work('event-meeting', 'event', '팀 프로젝트 회의', today, {
      description: '인공지능 프로젝트 진행 상황 공유',
      startTime: '15:00',
      endTime: '16:00',
      duration: 60,
      categoryId: 'ai',
      priority: 'high',
    }),
    work('event-exercise', 'event', '운동', today, {
      startTime: '18:00',
      endTime: '19:00',
      duration: 60,
      categoryId: 'exercise',
      priority: 'medium',
    }),
    work('task-plan', 'task', 'AI 프로젝트 기획서 작성', today, {
      description: '문제 정의, 범위, 일정 초안을 정리한다.',
      duration: 120,
      categoryId: 'ai',
      priority: 'high',
    }),
    work('task-ppt', 'task', 'StockMate 발표자료 수정', today, {
      description: '피드백 반영해서 슬라이드 순서를 다듬는다.',
      duration: 90,
      categoryId: 'stockmate',
      priority: 'high',
      dueDate: today,
    }),
    work('task-license', 'task', '컴활 문제 20개', today, {
      description: '오답 위주로 20문제.',
      duration: 40,
      categoryId: 'study',
      priority: 'medium',
    }),
    work('task-read', 'task', '책 30분 읽기', today, {
      description: '자기 전에 30분.',
      duration: 30,
      categoryId: 'reading',
      priority: 'low',
    }),
    work('task-notes', 'task', '강의 노트 정리', today, {
      description: '오늘 수업 메모를 옮겨 적는다.',
      duration: 20,
      categoryId: 'study',
      priority: 'low',
      status: 'done',
    }),
    work('event-study', 'event', '스터디', day(1), {
      startTime: '10:00',
      endTime: '11:30',
      duration: 90,
      categoryId: 'study',
      priority: 'medium',
    }),
    work('task-rehearsal', 'task', '발표 리허설', day(1), {
      description: 'StockMate 발표를 한 번 소리 내어 본다.',
      duration: 30,
      categoryId: 'stockmate',
      priority: 'medium',
    }),
    work('task-calendar', 'task', 'Calendar 화면 설계', day(3), {
      description: '일정과 할 일이 한 달력에서 구분되게 배치한다.',
      duration: 60,
      categoryId: 'blanky',
      priority: 'medium',
    }),
    work('task-input', 'task', 'AI 입력 UI 수정', day(3), {
      description: '첫 화면 입력창을 빈 문서처럼 다듬는다.',
      duration: 45,
      categoryId: 'blanky',
      priority: 'medium',
    }),
    work('task-exam', 'task', '시험 범위 정리', day(5), {
      duration: 90,
      categoryId: 'exam',
      priority: 'high',
    }),
    work('event-past-meet', 'event', '팀 회의', day(-1), {
      startTime: '14:00',
      endTime: '15:00',
      duration: 60,
      categoryId: 'stockmate',
      priority: 'medium',
    }),
    work('task-portfolio', 'task', '포트폴리오 수정', day(-1), {
      duration: 80,
      categoryId: 'blanky',
      priority: 'medium',
      status: 'done',
    }),
    work('task-license-past', 'task', '컴활 공부', day(-1), {
      duration: 50,
      categoryId: 'study',
      priority: 'medium',
      status: 'done',
    }),
    work('task-reading-note', 'task', '독서 메모', day(-1), {
      description: '어제 읽은 부분 메모. 아직 덜 씀.',
      duration: 15,
      categoryId: 'reading',
      priority: 'low',
    }),
    work('event-past-class', 'event', '수업', day(-2), {
      startTime: '09:00',
      endTime: '10:30',
      duration: 90,
      categoryId: 'study',
      priority: 'medium',
    }),
    work('task-review', 'task', '강의 복습', day(-2), {
      duration: 40,
      categoryId: 'study',
      priority: 'low',
      status: 'done',
    }),
    work('event-hack', 'event', '해커톤', day(5), {
      endDate: day(7),
      allDay: true,
      categoryId: 'blanky',
    }),
  ]
}

export function noteFromText(text: string): WorkItem {
  const trimmed = text.trim()
  const firstLine = trimmed.split('\n')[0] ?? '메모'

  return {
    id: crypto.randomUUID(),
    kind: 'task',
    title: firstLine.slice(0, 80) || '메모',
    description: trimmed,
    date: formatISODate(new Date()),
    startTime: null,
    endTime: null,
    duration: null,
    categoryId: null,
    priority: 'medium',
    status: 'todo',
    dueDate: null,
    endDate: null,
    allDay: false,
    repeat: 'none',
  }
}
