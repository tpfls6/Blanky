import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useOnboarding } from './useOnboarding.ts'
import { SpotlightTour, type TourStep } from './SpotlightTour.tsx'
import type { PageTourId } from './tourState.ts'

const TOURS: Record<PageTourId, TourStep[]> = {
  home: [
    { target: '#home-entry', title: '평소 말하듯 입력하세요', body: '날짜, 시간, 할 일을 한 문장으로 적고 Enter를 누르세요. 저장 전 분석 결과를 확인할 수 있어요.' },
    { target: '[data-tour="entry-types"]', title: '입력 종류를 골라요', body: '자동 분류를 쓰거나 일정·할 일·메모 등 원하는 종류를 직접 골라요.' },
    { target: '#home-chat-title', prepare: 'chat', title: '대화로 이어서 고쳐요', body: '오른쪽 대화 기록에서 저장 결과를 확인해요. “그거 오후 5시로 바꿔줘”처럼 입력창에서 이어서 말할 수 있어요.' },
  ],
  diary: [
    { target: '.diary-new', title: '새 기록으로 시작해요', body: '새 기록을 누르고 제목과 본문을 적으면 자동으로 저장돼요. 기분·날씨·태그도 남길 수 있어요.' },
    { target: '.diary-view-toggle', title: '날짜별로 돌아봐요', body: '달력 보기와 목록 보기를 오가며 날짜별 기록을 찾아요.' },
    { target: '.diary-tabs', title: '마음에 남는 기록을 모아요', body: '별을 누른 기록은 즐겨찾기에서 다시 볼 수 있어요.' },
  ],
  reading: [
    { target: '[data-tour="add-book"]', title: '책을 담아요', body: '책 추가 · 검색에서 읽고 싶은 책을 찾아 서재에 담아요.' },
    { target: '.reading-shelf-heading', title: '나만의 책장을 만들어요', body: '+ 버튼으로 책장을 만들고 책을 모아요. 책을 열면 읽은 페이지와 문장도 기록할 수 있어요.' },
    { target: '.reading-toolbar', title: '읽는 책을 찾아요', body: '제목·저자 검색과 독서 상태 필터로 원하는 책을 찾아요.' },
  ],
  memo: [
    { target: '[data-tour="new-memo"]', prepare: 'memo-list', title: '떠오른 생각을 바로 적어요', body: '메모 작성으로 새 메모를 열어요. 제목과 본문은 쓰는 대로 저장돼요.' },
    { target: '.memo-browse > input', title: '검색으로 찾아요', body: '제목·본문·카테고리를 함께 검색해 필요한 메모를 찾아요.' },
    { target: '.memo-folders', title: '카테고리로 모아요', body: '메모에 카테고리를 지정하면 같은 폴더에서 모아 볼 수 있어요.' },
  ],
  store: [
    { target: '[data-tour="store-tabs"]', title: '테마와 템플릿을 둘러봐요', body: '테마는 앱의 모습을, 템플릿은 페이지 구성을 바꿔요. 이 메뉴로 오갈 수 있어요.' },
    { target: '.theme-page > input', title: '원하는 스타일을 찾아요', body: '이름이나 키워드로 검색하세요. 항목을 열면 상세 화면에서 미리 보고 설치·적용할 수 있어요.' },
  ],
  custom: [
    { target: '[data-tour="new-page"]', prepare: 'templates', title: '템플릿으로 페이지를 꾸며요', body: '새 템플릿을 만들거나 기존 페이지를 골라 나만의 구성을 만들어요.' },
    { target: '.customization-themes header', prepare: 'themes', title: '테마 색상을 바꿔요', body: '새 테마에서 색상·이미지·아이콘·폰트를 고르세요. 가져오기로 .blanky 파일도 불러올 수 있어요.' },
    { target: '[data-tour="layout-controls"]', prepare: 'layout', title: '블록 배치를 조정해요', body: '페이지를 고르고 블록 간격과 배치를 조정해요. 변경한 구성은 해당 페이지에 적용돼요.' },
  ],
  settings: [
    { target: '[data-tour="settings-nav"]', title: '계정과 캘린더 연동', body: '설정 메뉴에서 계정, 캘린더, 입력·일정 설정을 골라요. 모바일에서는 위쪽 탭을 눌러 이동해요.' },
    { target: '[data-tour="settings-body"] select, [data-tour="settings-body"] button', title: '테마와 앱 설정', body: '현재 메뉴의 설정을 여기서 바꿔요. 일반 메뉴에서는 언어와 화면 테마를 고를 수 있어요.' },
  ],
}

export function Onboarding() { return <PageTour page="home" /> }

export function PageTour({ page }: { page: PageTourId; className?: string }) {
  const { open, close } = useOnboarding(page)
  const [, setParams] = useSearchParams()
  const prepare = useCallback((action: string) => {
    if (action === 'memo-list') {
      const back = document.querySelector<HTMLButtonElement>('[data-tour="memo-back"]')
      if (back?.getClientRects().length) back.click()
      return
    }
    if (action === 'chat') {
      const trigger = document.querySelector<HTMLButtonElement>('[aria-controls="home-chat-panel"]')
      const wasOpen = trigger?.getAttribute('aria-expanded') === 'true'
      if (!wasOpen) trigger?.click()
      return () => { if (!wasOpen && trigger?.isConnected && trigger.getAttribute('aria-expanded') === 'true') trigger.click() }
    }
    setParams(current => { const next = new URLSearchParams(current); next.set('tab', action); return next }, { replace: true })
  }, [setParams])
  return open ? <SpotlightTour key={page} steps={TOURS[page]} onClose={close} prepare={prepare} /> : null
}

