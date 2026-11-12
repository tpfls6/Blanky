import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageBuilder } from '../../features/builder/PageBuilder.tsx'
import type { UserPage as UserPageModel } from '../../features/builder/schema.ts'
import { packDiary, packMemo, recordsForPage, unpackDiary, unpackMemo } from '../../features/pages/pageRecords.ts'
import { createPageReadingRepository } from '../../features/pages/readingPageRepository.ts'
import { readingService } from '../../services/reading/index.ts'
import { initialFieldLabels, shownFieldLabels, type PageTemplateKind } from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useLibrary, type LibraryValue } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { DiaryWorkspace } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingWorkspace } from '../Reading/ReadingPage.tsx'
import { ROUTES } from '../../constants/routes.ts'
import { isSupabaseConfigured } from '../../services/supabase/client.ts'
import type { DiaryEntry, Memo } from '../../types/records.ts'

function DiaryHost({ page }: { page: UserPageModel }) {
  const { user } = useSession()
  const { records, commitCollectionRecord, eraseCollectionRecord } = useLibrary()
  const entries = recordsForPage(records, page.id).map(unpackDiary)
  const save = async (entry: DiaryEntry) => {
    const packed = packDiary(entry)
    await commitCollectionRecord(page.id, entry.id, packed)
    return { ...entry, updatedAt: new Date().toISOString() }
  }
  const remove = async (id: string) => {
    await eraseCollectionRecord(id)
  }
  return (
    <DiaryWorkspace
      key={page.id + (user?.id ?? 'guest')}
      userId={user?.id ?? ''}
      pageKey={page.id}
      canvas={false}
      heading={page.name}
      tagline=""
      labels={page.fieldLabels}
      entries={entries}
      loading={false}
      error=""
      save={save}
      remove={remove}
    />
  )
}

function MemoHost({ page }: { page: UserPageModel }) {
  const { records, commitCollectionRecord, eraseCollectionRecord } = useLibrary()
  const memos = recordsForPage(records, page.id).map(unpackMemo)
  return (
    <MemoPage
      source={{
        heading: page.name,
        labels: page.fieldLabels,
        memos,
        add: async (input) => {
          const now = new Date().toISOString()
          const memo: Memo = { id: crypto.randomUUID(), title: input.title, body: input.body, categoryId: input.categoryId ?? null, tags: [], createdAt: now, updatedAt: now }
          await commitCollectionRecord(page.id, memo.id, packMemo(memo))
          return memo.id
        },
        save: async (id, patch) => {
          const current = memos.find((item) => item.id === id)
          if (!current) return
          await commitCollectionRecord(page.id, id, packMemo({ ...current, ...patch, updatedAt: new Date().toISOString() }))
        },
        remove: eraseCollectionRecord,
      }}
    />
  )
}

function readingController(userId: string, pageId: string) {
  let library: LibraryValue
  let rows: LibraryValue['records'] = []
  const repo = createPageReadingRepository(userId, pageId, {
    records: () => rows,
    put: async (id, input) => {
      const recordId = id ?? crypto.randomUUID()
      await library.commitCollectionRecord(pageId, recordId, input)
      const old = rows.find(row => row.id === recordId)
      const now = new Date().toISOString()
      rows = [{ id: recordId, typeId: pageId, ...input, templateVersion: 1, createdAt: old?.createdAt ?? now, updatedAt: now }, ...rows.filter(row => row.id !== recordId)]
    },
    remove: async id => {
      await library.eraseCollectionRecord(id)
      rows = rows.filter(row => row.id !== id)
    },
  })
  if (isSupabaseConfigured) repo.searchBooks = query => readingService(userId).searchBooks(query)
  return { repo, sync: (next: LibraryValue) => { library = next; rows = next.records } }
}

function ReadingHost({ page }: { page: UserPageModel }) {
  const library = useLibrary()
  const { user } = useSession()
  const { locale } = useI18n()
  const userId = user?.id ?? 'guest'
  const controller = useMemo(() => readingController(userId, page.id), [userId, page.id])
  useLayoutEffect(() => { controller.sync(library) }, [controller, library])
  const labels = useMemo(() => shownFieldLabels(page.template, page.fieldLabels, locale), [page.template, page.fieldLabels, locale])
  const { trashReadingBook } = library
  // A book deleted here goes to the trash with its quotes, notes and shelves, like on the reading page.
  const trashBook = useCallback((id: string) => trashReadingBook(id, page.id), [trashReadingBook, page.id])
  return <ReadingWorkspace key={page.id + userId} userId={userId} repository={controller.repo} trashBook={trashBook} heading={page.name} labels={labels} basePath={ROUTES.page(page.id)} />
}

function Body({ page }: { page: UserPageModel }) {
  const { t, locale } = useI18n()
  const { updateUserPage } = useLibrary()
  const [pick, setPick] = useState(!page.template && page.blocks.length === 0)
  if (page.blocks.length && !page.template) {
    return <PageBuilder blocks={page.blocks} editing={false} onChange={(blocks) => updateUserPage(page.id, { blocks })} />
  }
  if (!page.template && pick) {
    return (
      <div className="rounded-md border border-line bg-surface p-4">
        <p className="text-sm">{t('custom.legacyPick')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['diary', 'reading', 'memo'] as PageTemplateKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className="chip"
              onClick={() => {
                updateUserPage(page.id, { template: kind, fieldLabels: initialFieldLabels(kind, locale) })
                setPick(false)
              }}
            >
              {t(`custom.kind.${kind}`)}
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (page.template === 'diary') return <DiaryHost page={page} />
  if (page.template === 'reading') return <ReadingHost page={page} />
  if (page.template === 'memo') return <MemoHost page={page} />
  return <p className="text-sm text-neutral-400">{t('builder.missing')}</p>
}

export function UserPage() {
  const { pageId } = useParams()
  const { t } = useI18n()
  const { customPages } = useLibrary()
  const page = customPages.find((item) => item.id === pageId)
  if (!page) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-neutral-500">{t('builder.missing')}</p>
      </div>
    )
  }

  return (
    <div className="custom-user-page min-w-0 w-full px-4 py-6 md:px-6">
      <Body key={page.id} page={page} />
    </div>
  )
}
