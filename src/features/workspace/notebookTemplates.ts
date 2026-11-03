import { createBlock } from '../builder/schema.ts'
import { createBlock as field } from '../records/registry.ts'
import type { Block, BlockType, BlockProps } from '../records/schema.ts'
import type { StarterTemplate } from './templates.ts'
import type { NotebookKind } from './notebookModel.ts'
import { NOTEBOOKS } from './notebookModel.ts'

const choices = (labels: string[]) => labels.map((label, index) => ({ id: crypto.randomUUID(), label, color: ['#3C8664', '#6B5BD0', '#C27832', '#3A62B0'][index % 4] }))
const f = (type: BlockType, role: string, label: string, props: Partial<BlockProps> = {}) => field(type, { role, label, ...props })
const pick = (role: string, label: string, labels: string[]) => f('select', role, label, { options: choices(labels), required: true })

function notebook(kind: NotebookKind, id: string, icon: string, color: string, fields: Block[]): StarterTemplate {
  const config = NOTEBOOKS[kind], now = new Date().toISOString()
  const collection = { id: crypto.randomUUID(), name: config.title, icon, color, description: config.tagline, schemaVersion: 1, version: 1, blocks: fields, createdAt: now, updatedAt: now }
  return { id, name: config.title, icon, description: config.tagline, collections: [collection], blocks: [createBlock('collection', { collectionId: collection.id, recordLayout: kind, view: 'card', text: config.title, span: 3 })] }
}

export function notebookTemplates(): StarterTemplate[] {
  return [
    notebook('movie', 'tpl-movie', 'Film', '#6B5BD0', [
      f('title', 'title', '영화 제목', { placeholder: '오래 기억하고 싶은 영화', required: true }),
      pick('status', '감상 상태', ['보고 싶어요', '감상 완료']),
      f('textField', 'director', '감독', { placeholder: '감독 이름' }),
      f('date', 'date', '감상일'),
      f('rating', 'rating', '별점'),
      f('multiSelect', 'genre', '장르', { options: choices(['드라마', '코미디', '로맨스', '스릴러', 'SF', '다큐멘터리', '애니메이션']) }),
      f('textField', 'place', '감상한 곳', { placeholder: '영화관, OTT, 집…' }),
      f('image', 'image', '포스터', { placeholder: '포스터 이미지 URL (선택)' }),
      f('longText', 'note', '감상평', { placeholder: '어떤 장면이 오래 남았나요? 나만의 감상을 남겨보세요.' }),
    ]),
    notebook('finance', 'tpl-finance', 'Wallet', '#3C8664', [
      f('title', 'title', '내역', { placeholder: '무엇에 쓴 돈인가요?', required: true }),
      pick('kind', '구분', ['지출', '수입']),
      f('number', 'amount', '금액', { required: true, min: 1, unit: '원', placeholder: '0' }),
      f('date', 'date', '날짜', { required: true }),
      pick('category', '카테고리', ['식비', '카페', '교통', '쇼핑', '주거·생활', '문화·여가', '건강', '급여', '용돈', '기타']),
      pick('payment', '결제 수단', ['카드', '현금', '계좌이체', '기타']),
      f('longText', 'note', '메모', { placeholder: '필요한 메모나 소비에 대한 생각을 남겨보세요.' }),
    ]),
    notebook('travel', 'tpl-travel', 'MapPin', '#C27832', [
      f('title', 'title', '여행 이름', { placeholder: '제주의 느린 주말', required: true }),
      f('textField', 'destination', '여행지', { required: true, placeholder: '도시 또는 나라' }),
      pick('status', '여행 상태', ['계획 중', '여행 중', '다녀온 여행']),
      f('date', 'startDate', '출발일', { required: true }),
      f('date', 'endDate', '돌아오는 날'),
      f('textField', 'companion', '함께한 사람', { placeholder: '혼자, 친구와, 가족과…' }),
      f('number', 'budget', '여행 예산', { min: 0, unit: '원' }),
      f('image', 'image', '여행 사진', { placeholder: '기억하고 싶은 사진 URL (선택)' }),
      f('longText', 'itinerary', '일정과 가고 싶은 곳', { placeholder: '방문할 곳과 하루의 흐름을 적어보세요.' }),
      f('longText', 'note', '남기고 싶은 순간', { placeholder: '좋았던 풍경, 맛있던 음식, 잊고 싶지 않은 순간.' }),
    ]),
    notebook('study', 'tpl-study', 'BookOpen', '#3A62B0', [
      f('title', 'title', '공부 내용', { placeholder: '오늘 무엇을 배웠나요?', required: true }),
      pick('subject', '과목', ['국어', '영어', '수학', '개발', '자격증', '기타']),
      f('date', 'date', '날짜', { required: true }),
      f('number', 'minutes', '시간', { required: true, min: 1, unit: '분' }),
      pick('status', '학습 상태', ['학습 중', '복습 필요', '이해 완료']),
      f('longText', 'note', '배운 점', { placeholder: '핵심 개념을 내 말로 정리해 보세요.' }),
      f('longText', 'review', '복습할 내용', { placeholder: '아직 헷갈리는 부분이나 다음에 다시 볼 내용을 적어보세요.' }),
      f('url', 'link', '참고 링크', { placeholder: '강의, 문서 또는 참고 자료 URL (선택)' }),
    ]),
  ]
}
