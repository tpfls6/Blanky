import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DailyBoard } from '../Schedule/SchedulePage.tsx'
import { DiaryPage } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingPage } from '../Reading/ReadingPage.tsx'
import { RecordSection } from '../Settings/RecordSection.tsx'
import { BLOCK_LABEL, PAGE_IDS, isUserLayout, type PageId } from '../../features/pages/layout.ts'
import { useLibrary } from '../../state/useLibrary.ts'

const LABELS: Record<PageId, string> = {
  schedule: 'Schedule',
  diary: 'Diary',
  reading: 'Reading',
  memo: 'Memo',
}

export function CustomPage() {
  const [params, setParams] = useSearchParams()
  const panel = params.get('panel') === 'records' ? 'records' : 'pages'
  const requested = params.get('page')
  const page: PageId = PAGE_IDS.includes(requested as PageId) ? (requested as PageId) : 'schedule'
  const { pageLayouts, resetPageLayout } = useLibrary()
  const [notice, setNotice] = useState('')
  const custom = isUserLayout(pageLayouts[page])

  const select = (next: PageId) => {
    setNotice('')
    setParams({ panel: 'pages', page: next })
  }

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <nav aria-label="커스텀" className="flex gap-1 overflow-x-auto border-b border-line px-4 py-3 lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-r lg:border-b-0 lg:px-3 lg:py-5">
        <p className="hidden px-2 pb-2 text-sm font-medium lg:block">Custom</p>
        {PAGE_IDS.map((id) => (
          <button key={id} type="button" onClick={() => select(id)} className={panel === 'pages' && page === id ? 'nav-link shrink-0' : 'nav-link shrink-0'} aria-current={panel === 'pages' && page === id ? 'page' : undefined}>
            {LABELS[id]}
          </button>
        ))}
        <button
          type="button"
          className="nav-link mt-0 shrink-0 lg:mt-4"
          aria-current={panel === 'records' ? 'page' : undefined}
          onClick={() => setParams({ panel: 'records' })}
        >
          Records
        </button>
      </nav>
      <div className="min-w-0 flex-1">
        {panel === 'records' ? (
          <div className="px-4 py-5 md:px-6">
            <h1 className="text-lg font-medium">Custom Records</h1>
            <p className="mt-1 text-sm text-neutral-500">기록 페이지의 블록을 만들고 순서를 바꿉니다.</p>
            <div className="mt-6">
              <RecordSection />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:px-6">
              <div className="min-w-0">
                <h1 className="text-base font-medium">{LABELS[page]} 편집</h1>
                <p className="text-xs text-neutral-400">
                  {custom ? '사용자 템플릿' : `${page}.default`} · 블록을 끌어 배치합니다. 저장은 바로 반영됩니다.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost ml-auto"
                onClick={() => {
                  resetPageLayout(page)
                  setNotice('기본 레이아웃으로 되돌렸습니다.')
                }}
              >
                기본 화면으로 초기화
              </button>
            </div>
            {notice ? <p className="px-4 pt-3 text-sm text-neutral-500 md:px-6" role="status">{notice}</p> : null}
            <p className="px-4 pt-3 text-xs text-neutral-400 md:px-6">
              너비 1·2·3은 3칸 그리드에서의 폭입니다. {BLOCK_LABEL.timeline}, {BLOCK_LABEL['task-list']}, {BLOCK_LABEL.calendar}를 숨기거나 다시 넣을 수 있습니다.
            </p>
            {page === 'schedule' ? <DailyBoard editing /> : null}
            {page === 'diary' ? <DiaryPage editing /> : null}
            {page === 'reading' ? <ReadingPage editing /> : null}
            {page === 'memo' ? <MemoPage editing /> : null}
          </div>
        )}
      </div>
    </div>
  )
}
