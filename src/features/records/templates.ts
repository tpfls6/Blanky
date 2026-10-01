import { createBlock } from './registry.ts'
import type { Block, BlockProps, SelectOption } from './schema.ts'
import { SWATCHES } from '../../constants/swatches.ts'

function options(labels: string[]): SelectOption[] {
  return labels.map((label, index) => ({
    id: crypto.randomUUID(),
    label,
    color: SWATCHES[index % SWATCHES.length]?.hex ?? '#3A62B0',
  }))
}

function checks(labels: string[]): NonNullable<BlockProps['items']> {
  return labels.map((label) => ({ id: crypto.randomUUID(), label, checked: false }))
}

export type Starter = {
  name: string
  icon: string
  color: string
  description: string
  build: () => Block[]
}

export const STARTERS: readonly Starter[] = [
  {
    name: '운동 기록',
    icon: 'Dumbbell',
    color: '#3C8664',
    description: '오늘 한 운동과 컨디션을 남기는 페이지',
    build: () => [
      createBlock('title', { label: '운동 제목', placeholder: '운동 제목' }),
      createBlock('heading', { level: 2, text: '오늘 운동' }),
      createBlock('text', { text: '오늘의 운동 내용을 기록해주세요.' }),
      createBlock('divider'),
      createBlock('select', { label: '운동 종류', required: true, options: options(['웨이트', '유산소', '스트레칭']) }),
      createBlock('number', { label: '운동 시간', unit: '분', placeholder: '60' }),
      createBlock('checkbox', { label: '오늘 운동 완료' }),
      createBlock('toggle', { title: '추가 정보' }, [
        createBlock('select', { label: '컨디션', options: options(['좋음', '보통', '피곤']) }),
        createBlock('number', { label: '만족도', unit: '점', min: 1, max: 5 }),
        createBlock('longText', { label: '메모', placeholder: '메모' }),
      ]),
      createBlock('callout', { icon: 'Lightbulb', text: '운동 전후 스트레칭도 기록해보세요.', color: '#3C8664' }),
    ],
  },
  {
    name: '공부 기록',
    icon: 'BookOpen',
    color: '#3A62B0',
    description: '공부한 내용과 시간을 남기는 페이지',
    build: () => [
      createBlock('title', { label: '공부 내용', placeholder: '공부 내용' }),
      createBlock('heading', { level: 2, text: '오늘 공부' }),
      createBlock('date', { label: '날짜', required: true }),
      createBlock('number', { label: '공부 시간', unit: '분' }),
      createBlock('multiSelect', { label: '과목', options: options(['국어', '영어', '수학', '기타']) }),
      createBlock('longText', { label: '배운 점', placeholder: '오늘 배운 것을 적어 보세요' }),
      createBlock('toggle', { title: '추가 정보' }, [
        createBlock('textField', { label: '교재' }),
        createBlock('select', { label: '집중도', options: options(['높음', '보통', '낮음']) }),
      ]),
    ],
  },
  {
    name: '영화 기록',
    icon: 'Film',
    color: '#6B5BD0',
    description: '본 영화와 감상을 남기는 페이지',
    build: () => [
      createBlock('title', { label: '영화 제목', placeholder: '영화 제목' }),
      createBlock('text', { text: '본 영화와 짧은 감상을 남겨 보세요.' }),
      createBlock('date', { label: '본 날짜' }),
      createBlock('select', { label: '장르', options: options(['드라마', '코미디', '액션', '애니메이션']) }),
      createBlock('number', { label: '별점', unit: '점', min: 1, max: 5 }),
      createBlock('longText', { label: '감상', placeholder: '감상' }),
      createBlock('callout', { icon: 'Film', text: '기억에 남는 장면이 있다면 같이 적어 두세요.', color: '#6B5BD0' }),
    ],
  },
  {
    name: '습관 기록',
    icon: 'Leaf',
    color: '#C27832',
    description: '매일 지킨 습관을 표시하는 페이지',
    build: () => [
      createBlock('title', { label: '습관', placeholder: '오늘의 습관' }),
      createBlock('heading', { level: 2, text: '오늘' }),
      createBlock('text', { text: '오늘 지킨 습관을 표시합니다.' }),
      createBlock('date', { label: '날짜', required: true }),
      createBlock('checkbox', { label: '오늘 완료' }),
      createBlock('number', { label: '횟수', unit: '회' }),
      createBlock('checklist', { items: checks(['스트레칭', '물 마시기', '산책']) }),
    ],
  },
]
