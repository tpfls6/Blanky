import { createContext, useContext, type ReactNode } from 'react'
import type { CustomRecordType } from '../records/schema.ts'
import type { CustomRecord } from '../../types/records.ts'
import type { TemplateSnapshot } from './schema.ts'

type Preview = { collections: CustomRecordType[]; records: CustomRecord[] }

const PreviewContext = createContext<Preview | null>(null)

export function TemplatePreviewProvider({ snapshot, children }: { snapshot: Pick<TemplateSnapshot, 'samples' | 'collections'>; children: ReactNode }) {
  const records: CustomRecord[] = snapshot.samples.map((sample, index) => ({
    id: 'preview-' + index,
    typeId: sample.collectionId,
    title: sample.title,
    values: sample.values,
    templateVersion: 1,
    createdAt: '',
    updatedAt: '',
  }))
  return <PreviewContext.Provider value={{ collections: snapshot.collections, records }}>{children}</PreviewContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- helper shared with callers; fast refresh only
export function useTemplatePreview() {
  return useContext(PreviewContext)
}
