import { flatten, type FieldValue } from '../records/schema.ts'
import { builtinTemplates } from '../workspace/templates.ts'
import type { TemplateListing, TemplateSample, TemplateSnapshot } from './schema.ts'

const OFFICIAL = [
  {
    id: '10000000-0000-4000-8000-000000000002',
    sourceId: 'tpl-movie',
    category: 'media',
    tags: ['영화', '드라마', '리뷰'],
    language: 'ko' as const,
    guide: '보고 싶은 영화와 감상 완료한 영화를 나누고, 별점과 감상을 포스터 카드로 모아보세요. 카드에서 기록을 수정하고 검색·별점순 정렬을 사용할 수 있어요. 포스터 URL은 선택 사항입니다.',
    samples: [
      { title: '기생충', values: { '영화 제목': '기생충', 감독: '봉준호', '감상 상태': '감상 완료', 감상일: '2026-10-12', 별점: 5, 장르: ['드라마', '스릴러'], '감상한 곳': '집', 감상평: '같은 창문으로도 전혀 다른 세상을 본다는 것. 계단을 오르내리는 장면이 오래 남았다.' } },
      { title: '리틀 포레스트', values: { '영화 제목': '리틀 포레스트', 감독: '임순례', '감상 상태': '감상 완료', 감상일: '2026-10-20', 별점: 4, 장르: ['드라마'], '감상한 곳': '주말의 거실', 감상평: '바쁜 날들 사이에 잠시 멈추고 싶어졌다. 내 손으로 밥 한 끼를 해 먹는 마음을 기억하기.' } },
      { title: '인터스텔라', values: { '영화 제목': '인터스텔라', 감독: '크리스토퍼 놀란', '감상 상태': '보고 싶어요', 장르: ['SF'], 감상평: '큰 화면과 좋은 소리로, 이번에는 천천히 다시 보고 싶은 영화.' } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    sourceId: 'tpl-study',
    category: 'study',
    tags: ['공부', '플래너'],
    language: 'ko' as const,
    guide: '과목과 학습 시간을 기록하고 핵심 개념을 내 말로 정리해보세요. 복습 필요 탭에서 헷갈리는 개념을 모아보고, 월별 총 학습 시간과 학습 기록을 확인할 수 있어요.',
    samples: [
      { title: 'React 상태 관리의 기본', values: { '공부 내용': 'React 상태 관리의 기본', 과목: '개발', 날짜: '2026-10-27', 시간: 75, '학습 상태': '이해 완료', '배운 점': '화면에 필요한 최소한의 상태만 저장하고, 나머지는 상태에서 계산한다. 파생 값을 따로 저장하면 동기화할 대상만 늘어난다.', '복습할 내용': '실제 작은 화면에 적용해 보기.' } },
      { title: '영어 관계대명사 정리', values: { '공부 내용': '영어 관계대명사 정리', 과목: '영어', 날짜: '2026-10-28', 시간: 40, '학습 상태': '복습 필요', '배운 점': '두 문장을 이어 주면서 앞의 명사를 설명하는 역할. 먼저 완전한 문장인지 살펴보면 구분이 쉬워진다.', '복습할 내용': 'which와 that을 바꿔 쓸 수 없는 경우를 예문으로 다시 정리하기.' } },
      { title: '확률 분포와 기댓값', values: { '공부 내용': '확률 분포와 기댓값', 과목: '수학', 날짜: '2026-10-29', 시간: 50, '학습 상태': '학습 중', '배운 점': '기댓값은 가능한 값에 확률을 곱해 더한 값이다. 평균과의 관계를 직접 계산해 봤다.' } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000006', sourceId: 'tpl-finance', category: 'finance', tags: ['가계부', '수입', '지출'], language: 'ko' as const,
    guide: '수입과 지출을 양수 금액으로 입력하면 구분에 따라 월별 수입·지출·잔액을 계산해요. 월 이동, 검색, 분류 필터와 카테고리별 지출 비중으로 소비 흐름을 확인하세요.',
    samples: [
      { title: '10월 급여', values: { 내역: '10월 급여', 구분: '수입', 금액: 2800000, 날짜: '2026-10-25', 카테고리: '급여', '결제 수단': '계좌이체', 메모: '이번 달도 차곡차곡.' } },
      { title: '동네 마트 장보기', values: { 내역: '동네 마트 장보기', 구분: '지출', 금액: 42600, 날짜: '2026-10-26', 카테고리: '식비', '결제 수단': '카드', 메모: '채소와 과일, 일주일의 식재료.' } },
      { title: '친구와 주말 점심', values: { 내역: '친구와 주말 점심', 구분: '지출', 금액: 18500, 날짜: '2026-10-27', 카테고리: '식비', '결제 수단': '카드' } },
      { title: '카페에서 읽는 시간', values: { 내역: '카페에서 읽는 시간', 구분: '지출', 금액: 5500, 날짜: '2026-10-28', 카테고리: '카페', '결제 수단': '카드' } },
      { title: '이번 달 교통비', values: { 내역: '이번 달 교통비', 구분: '지출', 금액: 32000, 날짜: '2026-10-29', 카테고리: '교통', '결제 수단': '카드' } },
    ],
  },
  {
    id: '10000000-0000-4000-8000-000000000007', sourceId: 'tpl-travel', category: 'travel', tags: ['여행', '일정', '추억'], language: 'ko' as const,
    guide: '계획 중인 여행부터 다녀온 여행까지 한곳에 남겨보세요. 여행지·출발일·예산·일정을 정리하고, 돌아온 뒤 사진과 기억하고 싶은 순간을 더하면 나만의 여행장이 됩니다.',
    samples: [
      { title: '제주의 느린 주말', values: { '여행 이름': '제주의 느린 주말', 여행지: '제주, 대한민국', '여행 상태': '계획 중', 출발일: '2026-11-13', '돌아오는 날': '2026-11-15', '함께한 사람': '친구와 둘이', '여행 예산': 450000, '일정과 가고 싶은 곳': '첫날 · 바닷가 산책과 동네 책방\n둘째 날 · 오름을 걷고 작은 식당에서 점심\n마지막 날 · 커피 한 잔 마시고 천천히 돌아오기' } },
      { title: '걷고 머문 교토', values: { '여행 이름': '걷고 머문 교토', 여행지: '교토, 일본', '여행 상태': '다녀온 여행', 출발일: '2026-10-09', '돌아오는 날': '2026-10-12', '함께한 사람': '혼자', '여행 예산': 850000, '남기고 싶은 순간': '아침 일찍 걷던 골목에는 빵 굽는 냄새가 났다. 계획하지 않았던 작은 카페에서 오래 앉아 있던 시간이 가장 기억난다.' } },
      { title: '강릉, 바다 앞의 하루', values: { '여행 이름': '강릉, 바다 앞의 하루', 여행지: '강릉, 대한민국', '여행 상태': '다녀온 여행', 출발일: '2026-09-20', '돌아오는 날': '2026-09-21', '함께한 사람': '가족과', '여행 예산': 230000, '남기고 싶은 순간': '해 질 무렵 바닷가에 앉아 아무 말 없이 파도를 보았다. 다시 꺼내 보고 싶은 하루.' } },
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
