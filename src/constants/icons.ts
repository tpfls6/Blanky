import { createElement, type CSSProperties } from 'react'
import {
  Bike,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Clock,
  Code,
  Coffee,
  Dumbbell,
  Film,
  Flag,
  Folder,
  Gamepad2,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Leaf,
  Lightbulb,
  MapPin,
  Moon,
  Music,
  Palette,
  Pencil,
  Plane,
  ShoppingBag,
  Star,
  StickyNote,
  Tag,
  User,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/** `alias` is extra search text. Add Korean words here when a name should match them. */
export const ICONS: readonly { name: string; icon: LucideIcon; alias: string }[] = [
  { name: 'GraduationCap', icon: GraduationCap, alias: '학교 학사모 school study 공부' },
  { name: 'Dumbbell', icon: Dumbbell, alias: '운동 헬스 gym exercise' },
  { name: 'User', icon: User, alias: '사람 개인 person' },
  { name: 'Folder', icon: Folder, alias: '폴더 프로젝트 project' },
  { name: 'BookOpen', icon: BookOpen, alias: '책 공부 book study 독서' },
  { name: 'Calendar', icon: Calendar, alias: '달력 일정 calendar schedule' },
  { name: 'Heart', icon: Heart, alias: '하트 마음 heart' },
  { name: 'House', icon: House, alias: '집 홈 home house' },
  { name: 'Star', icon: Star, alias: '별 중요 star' },
  { name: 'Briefcase', icon: Briefcase, alias: '일 업무 work' },
  { name: 'Coffee', icon: Coffee, alias: '커피 coffee' },
  { name: 'Music', icon: Music, alias: '음악 music' },
  { name: 'Film', icon: Film, alias: '영화 movie film' },
  { name: 'ShoppingBag', icon: ShoppingBag, alias: '쇼핑 shopping' },
  { name: 'Utensils', icon: Utensils, alias: '식사 음식 food' },
  { name: 'Plane', icon: Plane, alias: '여행 비행 travel' },
  { name: 'Pencil', icon: Pencil, alias: '연필 메모 pencil note' },
  { name: 'Lightbulb', icon: Lightbulb, alias: '아이디어 idea' },
  { name: 'Wallet', icon: Wallet, alias: '돈 지갑 money' },
  { name: 'Bike', icon: Bike, alias: '자전거 bike' },
  { name: 'Code', icon: Code, alias: '코드 개발 code' },
  { name: 'HeartPulse', icon: HeartPulse, alias: '건강 health' },
  { name: 'Palette', icon: Palette, alias: '색 그림 art color' },
  { name: 'Flag', icon: Flag, alias: '깃발 목표 flag' },
  { name: 'MapPin', icon: MapPin, alias: '장소 위치 place pin' },
  { name: 'Camera', icon: Camera, alias: '사진 camera photo' },
  { name: 'Gamepad2', icon: Gamepad2, alias: '게임 game' },
  { name: 'Leaf', icon: Leaf, alias: '자연 leaf' },
  { name: 'Moon', icon: Moon, alias: '밤 달 moon' },
  { name: 'Clock', icon: Clock, alias: '시간 시계 time clock' },
  { name: 'StickyNote', icon: StickyNote, alias: '메모 note memo' },
  { name: 'Tag', icon: Tag, alias: '태그 tag' },
]

export function filterIcons(query: string) {
  const text = query.trim().toLowerCase()
  if (!text) return ICONS
  return ICONS.filter((item) => `${item.name} ${item.alias}`.toLowerCase().includes(text))
}

const fallback = StickyNote

export function iconByName(name: string | null | undefined): LucideIcon {
  return ICONS.find((item) => item.name === name)?.icon ?? fallback
}

export function IconView({
  name,
  className,
  style,
}: {
  name?: string | null
  className?: string
  style?: CSSProperties
}) {
  return createElement(iconByName(name), {
    className,
    style,
    strokeWidth: 1.5,
    'aria-hidden': true,
  })
}
