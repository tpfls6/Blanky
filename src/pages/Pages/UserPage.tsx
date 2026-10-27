import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconPicker } from '../../components/common/IconPicker.tsx'
import { ROUTES } from '../../constants/routes.ts'
import type { UserPage as UserPageModel } from '../../features/builder/schema.ts'
import { packDiary, packMemo, packReading, recordsForPage, unpackDiary, unpackMemo, unpackReading } from '../../features/pages/pageRecords.ts'
import { DEFAULT_FIELD_LABELS, FIELD_KEYS, fieldLabel, type PageTemplateKind } from '../../features/pages/templates.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useConfirm } from '../../state/useConfirm.ts'
import { useLibrary } from '../../state/useLibrary.ts'
import { useSession } from '../../state/useSession.ts'
import { DiaryWorkspace } from '../Diary/DiaryPage.tsx'
import { MemoPage } from '../Memo/MemoPage.tsx'
import { ReadingCatalog } from '../Reading/ReadingCatalog.tsx'
import type { DiaryEntry, Memo } from '../../types/records.ts'

function PageSettings({ page }: { page: UserPageModel }) {
  const { t } = useI18n()
  const { updateUserPage } = useLibrary()
  const template = page.template
  if (!template) return null
  return (
    <details className="mb-6 rounded-md border border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">{t('custom.pageSettings')}</summary>
      <div className="mt-3 flex items-start gap-3">
        <IconPicker value={page.icon} onChange={(icon) => updateUserPage(page.id, { icon })} />
        <input
          value={page.name}
          onChange={(event) => updateUserPage(page.id, { name: event.target.value })}
          className="field min-w-0 flex-1"
          aria-label={t('custom.pageName')}
        />
      </div>
      <div className="mt-4 grid gap-3">
        {FIELD_KEYS[template].map((key) => (
          <label key={key} className="block text-sm">
            <span className="text-neutral-400">{DEFAULT_FIELD_LABELS[template][key as keyof (typeof DEFAULT_FIELD_LABELS)[typeof template]]}</span>
            <input
              value={page.fieldLabels[key] ?? ''}
              onChange={(event) => updateUserPage(page.id, { fieldLabels: { ...page.fieldLabels, [key]: event.target.value } })}
              placeholder={fieldLabel(template, key)}
              className="field mt-1 w-full"
            />
          </label>
        ))}
      </div>
    </details>
  )
}

function DiaryHost({ page }: { page: UserPageModel }) {
  const { user } = useSession()
  const { records, addRecord, updateRecord, removeRecord } = useLibrary()
  const entries = recordsForPage(records, page.id).map(unpackDiary)
  const save = async (entry: DiaryEntry) => {
    const packed = packDiary(entry)
    if (records.some((item) => item.id === entry.id)) updateRecord(entry.id, packed)
    else addRecord(page.id, { id: entry.id, ...packed })
    return { ...entry, updatedAt: new Date().toISOString() }
  }
  const remove = async (id: string) => {
    removeRecord(id)
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
  const { records, addRecord, updateRecord, removeRecord } = useLibrary()
  const memos = recordsForPage(records, page.id).map(unpackMemo)
  return (
    <MemoPage
      source={{
        heading: page.name,
        labels: page.fieldLabels,
        memos,
        add: (input) => {
          const now = new Date().toISOString()
          const memo: Memo = { id: crypto.randomUUID(), title: input.title, body: input.body, categoryId: null, tags: [], createdAt: now, updatedAt: now }
          return addRecord(page.id, { id: memo.id, ...packMemo(memo) })
        },
        save: (id, patch) => {
          const current = memos.find((item) => item.id === id)
          if (!current) return
          updateRecord(id, packMemo({ ...current, ...patch, updatedAt: new Date().toISOString() }))
        },
        remove: (id) => removeRecord(id),
      }}
    />
  )
}

function ReadingHost({ page }: { page: UserPageModel }) {
  const { t } = useI18n()
  const { records, addRecord, updateRecord, removeRecord } = useLibrary()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const items = recordsForPage(records, page.id).map(unpackReading)
  const run = async (work: () => void) => {
    setBusy(true)
    setError('')
    try {
      work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('custom.saveFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <ReadingCatalog
      heading={page.name}
      labels={page.fieldLabels}
      items={items}
      busy={busy}
      error={error}
      onSave={async (item) => {
        await run(() => {
          const packed = packReading(item)
          if (records.some((row) => row.id === item.id)) updateRecord(item.id, packed)
          else addRecord(page.id, { id: item.id, ...packed })
        })
      }}
      onDelete={async (id) => {
        await run(() => removeRecord(id))
      }}
    />
  )
}

function Body({ page }: { page: UserPageModel }) {
  const { t } = useI18n()
  const { updateUserPage } = useLibrary()
  const [pick, setPick] = useState(!page.template)
  if (!page.template && pick) {
    return (
      <div className="rounded-md border border-line p-4">
        <p className="text-sm">{t('custom.legacyPick')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['diary', 'reading', 'memo'] as PageTemplateKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              className="chip"
              onClick={() => {
                updateUserPage(page.id, { template: kind, fieldLabels: { ...DEFAULT_FIELD_LABELS[kind] } })
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
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { t } = useI18n()
  const { customPages, removeUserPage } = useLibrary()
  const page = customPages.find((item) => item.id === pageId)
  const ready = useMemo(() => page, [page])
  if (!ready) {
    return (
      <div className="px-6 py-10">
        <p className="text-sm text-neutral-500">{t('builder.missing')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="text-xs text-neutral-400">{ready.template ? t(`custom.kind.${ready.template}`) : t('custom.legacy')}</p>
        <button
          type="button"
          className="chip ml-auto"
          onClick={async () => {
            if (await confirm(t('builder.deleteAsk', { name: ready.name }))) {
              removeUserPage(ready.id)
              navigate(ROUTES.home)
            }
          }}
        >
          {t('delete')}
        </button>
      </div>
      <PageSettings page={ready} />
      <Body page={ready} />
    </div>
  )
}
