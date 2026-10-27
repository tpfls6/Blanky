import { createContext, useContext, type ReactNode } from 'react'
import type { CustomRecordType } from '../records/schema.ts'
import type { CustomRecord } from '../../types/records.ts'
import type { TemplateSnapshot } from './schema.ts'

type Preview = { collections: CustomRecordType[]; records: CustomRecord[] }

const PreviewContext = createContext<Preview | null>(null)

export function TemplatePreviewProvider({ snapshot, children }: { snapshot: TemplateSnapshot; children: ReactNode }) {
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

export function useTemplatePreview() {
  return useContext(PreviewContext)
}
