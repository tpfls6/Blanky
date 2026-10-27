import { createBlock } from '../builder/schema.ts'
import { createBlock as createField } from '../records/registry.ts'
import { SWATCHES } from '../../constants/swatches.ts'
import type { CustomRecordType } from '../records/schema.ts'
import type { BuilderBlock } from '../builder/schema.ts'

function options(labels: string[]) {
  return labels.map((label, index) => ({
    id: crypto.randomUUID(),
    label,
    color: SWATCHES[index % SWATCHES.length]?.hex ?? '#3A62B0',
  }))
}

function typeOf(name: string, icon: string, color: string, description: string, blocks: CustomRecordType['blocks']): CustomRecordType {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name, icon, color, description, schemaVersion: 1, version: 1, blocks, createdAt: now, updatedAt: now }
}

export type StarterTemplate = {
  id: string
  name: string
  icon: string
  description: string
  collections: CustomRecordType[]
  blocks: BuilderBlock[]
}

export function builtinTemplates(): StarterTemplate[] {
  const workout = typeOf('운동 기록', 'Dumbbell', '#3C8664', '운동명, 무게, 횟수를 남기는 기록', [
    createField('title', { label: '운동명', placeholder: '스쿼트' }),
    createField('date', { label: '날짜', required: true }),
    createField('number', { label: '무게', unit: 'kg' }),
    createField('number', { label: '횟수', unit: '회' }),
    createField('number', { label: '세트', unit: '세트' }),
    createField('checkbox', { label: '완료' }),
  ])
  const movie = typeOf('영화 기록', 'Film', '#6B5BD0', '본 영화와 감상', [
    createField('title', { label: '영화 제목' }),
    createField('image', { label: '포스터' }),
    createField('date', { label: '감상일' }),
    createField('rating', { label: '별점' }),
    createField('longText', { label: '감상평' }),
    createField('multiSelect', { label: '장르', options: options(['드라마', '코미디', '액션', '애니메이션']) }),
  ])
  const links = typeOf('링크 모음', 'Tag', '#3A62B0', '사이트와 주소를 모아 둡니다', [
    createField('title', { label: '사이트 이름' }),
    createField('url', { label: 'URL' }),
    createField('select', { label: '카테고리', options: options(['업무', '공부', '취미']) }),
    createField('textField', { label: '설명' }),
    createField('checkbox', { label: '즐겨찾기' }),
  ])
  const study = typeOf('공부 관리', 'BookOpen', '#3A62B0', '공부한 내용과 시간', [
    createField('title', { label: '공부 내용' }),
    createField('date', { label: '날짜' }),
    createField('number', { label: '시간', unit: '분' }),
    createField('multiSelect', { label: '과목', options: options(['국어', '영어', '수학', '기타']) }),
    createField('longText', { label: '배운 점' }),
  ])
  const project = typeOf('프로젝트', 'Folder', '#C27832', '할 일과 상태', [
    createField('title', { label: '작업' }),
    createField('select', { label: '상태', options: options(['할 일', '진행 중', '완료']) }),
    createField('date', { label: '마감' }),
    createField('longText', { label: '메모' }),
  ])

  return [
    { id: 'tpl-empty', name: '빈 페이지', icon: 'StickyNote', description: '블록을 직접 조합합니다', collections: [], blocks: [createBlock('text')] },
    {
      id: 'tpl-workout',
      name: '운동 관리',
      icon: 'Dumbbell',
      description: '운동 기록 테이블과 카드',
      collections: [workout],
      blocks: [
        createBlock('heading', { level: 1, text: '운동 관리', span: 3 }),
        createBlock('text', { text: '오늘 한 운동을 남기고 테이블과 카드로 보세요.', span: 3 }),
        createBlock('collection', { collectionId: workout.id, view: 'table', text: '운동 기록', span: 3 }),
        createBlock('widget-calendar', {}, undefined),
      ],
    },
    {
      id: 'tpl-movie',
      name: '영화 기록',
      icon: 'Film',
      description: '본 영화와 감상',
      collections: [movie],
      blocks: [
        createBlock('heading', { level: 1, text: '영화 기록', span: 3 }),
        createBlock('collection', { collectionId: movie.id, view: 'card', text: '영화', span: 3 }),
      ],
    },
    {
      id: 'tpl-links',
      name: '링크 모음',
      icon: 'Tag',
      description: '자주 여는 사이트',
      collections: [links],
      blocks: [
        createBlock('heading', { level: 1, text: '링크 모음', span: 3 }),
        createBlock('collection', { collectionId: links.id, view: 'table', text: '링크', span: 3 }),
      ],
    },
    {
      id: 'tpl-study',
      name: '공부 관리',
      icon: 'BookOpen',
      description: '공부 시간과 내용',
      collections: [study],
      blocks: [
        createBlock('heading', { level: 1, text: '공부 관리', span: 3 }),
        createBlock('collection', { collectionId: study.id, view: 'table', text: '공부 기록', span: 3 }),
        createBlock('widget-memos'),
      ],
    },
    {
      id: 'tpl-project',
      name: '프로젝트 관리',
      icon: 'Folder',
      description: '상태별 작업',
      collections: [project],
      blocks: [
        createBlock('heading', { level: 1, text: '프로젝트', span: 3 }),
        createBlock('collection', { collectionId: project.id, view: 'kanban', text: '작업', span: 3 }),
        createBlock('widget-tasks'),
      ],
    },
  ]
}

export function remapCollections(blocks: BuilderBlock[], fromTo: Map<string, string>): BuilderBlock[] {
  return blocks.map((block) => {
    if (block.type !== 'collection' || !block.props.collectionId) return block
    const next = fromTo.get(block.props.collectionId)
    return next ? { ...block, props: { ...block.props, collectionId: next } } : block
  })
}
