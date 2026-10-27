import { flatten, type FieldValue } from '../records/schema.ts'
import { builtinTemplates } from '../workspace/templates.ts'
import type { TemplateListing, TemplateSample, TemplateSnapshot } from './schema.ts'

const OFFICIAL = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    sourceId: 'tpl-workout',
    category: 'fitness',
    tags: ['운동', '습관', '기록'],
    language: 'ko' as const,
    guide: '운동명, 무게, 횟수, 세트를 남긴 뒤 테이블이나 카드에서 조회하세요.',
    samples: [
      { title: '스쿼트', values: { 운동명: '스쿼트', 날짜: '2026-10-20', 무게: 60, 횟수: 10, 세트: 3, 완료: true } },
      { title: '벤치프레스', values: { 운동명: '벤치프레스', 날짜: '2026-10-21', 무게: 40, 횟수: 8, 세트: 3, 완료: false } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    sourceId: 'tpl-movie',
    category: 'media',
    tags: ['영화', '드라마', '리뷰'],
    language: 'ko' as const,
    guide: '영화 제목, 별점, 감상일, 감상평을 추가한 뒤 갤러리나 테이블에서 보세요.',
    samples: [
      { title: '기생충', values: { '영화 제목': '기생충', 감상일: '2026-10-01', 별점: 5, 감상평: '계급을 유머와 긴장으로 담아낸 작품.' } },
      { title: '위플래쉬', values: { '영화 제목': '위플래쉬', 감상일: '2026-10-12', 별점: 4, 감상평: '연주와 집착이 겹치는 리듬.' } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    sourceId: 'tpl-links',
    category: 'links',
    tags: ['북마크', '링크'],
    language: 'ko' as const,
    guide: '사이트 이름과 HTTPS 주소를 모아 두고 카테고리로 나누세요.',
    samples: [
      { title: 'Blanky', values: { '사이트 이름': 'Blanky', URL: 'https://blanky.app', 설명: '하루를 기록하는 공간' } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    sourceId: 'tpl-study',
    category: 'study',
    tags: ['공부', '플래너'],
    language: 'ko' as const,
    guide: '공부한 내용과 시간을 남기고 과목별로 모아 보세요.',
    samples: [
      { title: '영어 단어', values: { '공부 내용': '영어 단어 40개', 날짜: '2026-10-22', 시간: 40, '배운 점': '어근으로 묶으면 외우기 쉽다.' } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    sourceId: 'tpl-project',
    category: 'project',
    tags: ['프로젝트', '칸반'],
    language: 'ko' as const,
    guide: '작업을 상태별로 옮기며 마감과 메모를 함께 두세요.',
    samples: [
      { title: '마켓플레이스 설계', values: { 작업: '마켓플레이스 설계', 상태: '진행 중', 마감: '2026-10-30', 메모: '컬렉션 스키마만으로 유형을 구성' } },
    ],
  },
] as const

function valuesByLabel(collectionId: string, title: string, labels: Record<string, FieldValue>, types: TemplateSnapshot['collections']): TemplateSample {
  const type = types.find((item) => item.id === collectionId)
  const values: Record<string, FieldValue> = {}
  if (type) {
    for (const block of flatten(type.blocks)) {
      const label = block.props.label
      const raw = label ? labels[label] : undefined
      if (!block.fieldKey || raw === undefined) continue
      if ((block.type === 'select' || block.type === 'multiSelect') && block.props.options) {
        const names = Array.isArray(raw) ? raw : [raw]
        const ids = names.flatMap((name) => {
          const option = block.props.options?.find((item) => item.label === name)
          return option ? [option.id] : []
        })
        values[block.fieldKey] = block.type === 'multiSelect' ? ids : (ids[0] ?? '')
        continue
      }
      values[block.fieldKey] = raw
    }
  }
  return { collectionId, title, values }
}

export function officialListings(now = '2026-10-27T00:00:00.000Z'): TemplateListing[] {
  const starters = builtinTemplates()
  return OFFICIAL.flatMap((item) => {
    const starter = starters.find((row) => row.id === item.sourceId)
    if (!starter) return []
    const collections = starter.collections
    const collectionId = collections[0]?.id ?? ''
    const snapshot: TemplateSnapshot = {
      version: 1,
      title: starter.name,
      icon: starter.icon,
      description: starter.description,
      blocks: starter.blocks,
      collections,
      samples: item.samples.map((sample) => valuesByLabel(collectionId, sample.title, sample.values as Record<string, FieldValue>, collections)),
      guide: item.guide,
    }
    return [{
      id: item.id,
      creatorId: null,
      creatorName: 'Blanky',
      name: starter.name,
      description: starter.description,
      thumbnailUrl: '',
      gallery: [],
      category: item.category,
      tags: [...item.tags],
      language: item.language,
      status: 'published',
      currentVersion: 1,
      currentVersionId: item.id,
      installCount: 0,
      snapshot,
      sourcePageId: null,
      createdAt: now,
      updatedAt: now,
    }]
  })
}

export const OFFICIAL_IDS = OFFICIAL.map((item) => item.id)
