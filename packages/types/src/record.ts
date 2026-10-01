export type CustomRecordType = {
  id: string
  userId: string
  name: string
  description: string
  icon: string
  color: string
  schemaVersion: number
  version: number
  blocks: unknown[]
  createdAt: string
  updatedAt: string
}

export type CustomRecord = {
  id: string
  userId: string
  recordTypeId: string
  title: string
  values: Record<string, unknown>
  templateVersion: number
  createdAt: string
  updatedAt: string
}
