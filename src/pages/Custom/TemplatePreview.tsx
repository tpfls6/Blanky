import { DEFAULT_FIELD_LABELS, type PageTemplateKind } from '../../features/pages/templates.ts'
import type { PageReadingItem } from '../../features/pages/pageRecords.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { DiaryWorkspace } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingCatalog } from '../Reading/ReadingCatalog.tsx'
import type { DiaryEntry, Memo } from '../../types/records.ts'

const noopSave = async (entry: DiaryEntry) => entry
const noopRemove = async () => undefined
const noopReading = async () => undefined

function sampleDiary(): DiaryEntry {
  const now = new Date().toISOString()
  return {
    id: 'preview-diary',
    title: '첫 기록',
    body: '오늘 있었던 일을 남겨 두는 화면입니다.',
    date: now.slice(0, 10),
    tags: ['일상'],
    mood: 'good',
    weather: 'sunny',
    createdAt: now,
    updatedAt: now,
  }
}

function sampleMemo(): Memo {
  const now = new Date().toISOString()
  return {
    id: 'preview-memo',
    title: '짧은 메모',
    body: '제목과 본문만 있는 기록입니다.',
    categoryId: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

function sampleReading(): PageReadingItem {
  const now = new Date().toISOString()
  return {
    id: 'preview-reading',
    title: '읽고 있는 책',
    author: '작가 이름',
    rating: 4,
    note: '감상과 별점을 남기는 화면입니다.',
    image: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function TemplatePreview({ kind }: { kind: PageTemplateKind }) {
  const { t } = useI18n()
  const heading = t(`custom.kind.${kind}`)
  return (
    <div className="template-preview" aria-hidden="true">
      <div className="template-preview-inner pointer-events-none">
        {kind === 'diary' ? (
          <DiaryWorkspace
            userId="preview"
            pageKey="preview"
            canvas={false}
            heading={heading}
            tagline=""
            labels={DEFAULT_FIELD_LABELS.diary}
            entries={[sampleDiary()]}
            loading={false}
            error=""
            save={noopSave}
            remove={noopRemove}
          />
        ) : null}
        {kind === 'reading' ? (
          <ReadingCatalog
            heading={heading}
            labels={DEFAULT_FIELD_LABELS.reading}
            items={[sampleReading()]}
            busy={false}
            error=""
            onSave={noopReading}
            onDelete={noopReading}
          />
        ) : null}
        {kind === 'memo' ? (
          <MemoPage
            source={{
              heading,
              labels: DEFAULT_FIELD_LABELS.memo,
              memos: [sampleMemo()],
              add: () => 'preview-memo',
              save: () => undefined,
              remove: () => undefined,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
