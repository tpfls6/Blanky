import type { BuilderBlock, UserPage } from '../builder/schema.ts'
import type { CustomRecordType, FieldValue } from '../records/schema.ts'

export const LISTING_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'unlisted', 'archived'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const TEMPLATE_CATEGORIES = [
  'fitness',
  'media',
  'links',
  'study',
  'project',
  'habit',
  'finance',
  'travel',
  'reading',
  'free',
] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const SNAPSHOT_LIMITS = {
  maxBlocks: 80,
  maxCollections: 12,
  maxFields: 40,
  maxSamples: 20,
  maxBytes: 200_000,
  maxNest: 6,
  maxName: 80,
  maxDescription: 2000,
  maxGuide: 4000,
  maxTags: 12,
  maxTag: 24,
  maxGallery: 6,
}

export type TemplateSample = {
  collectionId: string
  title: string
  values: Record<string, FieldValue>
}

export type TemplateSnapshot = {
  version: number
  title: string
  icon: string
  description: string
  blocks: BuilderBlock[]
  collections: CustomRecordType[]
  samples: TemplateSample[]
  guide: string
}

export type TemplateListing = {
  id: string
  creatorId: string | null
  creatorName: string
  name: string
  description: string
  thumbnailUrl: string
  gallery: string[]
  category: TemplateCategory | string
  tags: string[]
  language: 'ko' | 'en'
  status: ListingStatus
  currentVersion: number
  currentVersionId: string
  installCount: number
  snapshot: TemplateSnapshot
  sourcePageId: string | null
  createdAt: string
  updatedAt: string
}

export type TemplateInstall = {
  listingId: string
  versionId: string
  pageId: string
  requestId: string
  createdAt: string
}

export type TemplateFavorite = {
  listingId: string
  createdAt: string
}

export type TemplateReport = {
  id: string
  listingId: string
  reason: string
  status: 'open' | 'reviewed' | 'dismissed'
  createdAt: string
}

export type PublishInput = {
  source: UserPage
  name: string
  description: string
  category: string
  tags: string[]
  thumbnailUrl: string
  gallery: string[]
  language: 'ko' | 'en'
  guide: string
  samples: TemplateSample[]
}

export function isListingStatus(value: unknown): value is ListingStatus {
  return typeof value === 'string' && (LISTING_STATUSES as readonly string[]).includes(value)
}

export function isPublicStatus(status: ListingStatus): boolean {
  return status === 'published'
}

export function isLinkVisible(status: ListingStatus): boolean {
  return status === 'published' || status === 'unlisted'
}

export function canCreatorEdit(status: ListingStatus): boolean {
  return status !== 'archived'
}
