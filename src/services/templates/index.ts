import { createTemplateRepository } from '@blanky/api'
import { forkSnapshot, type InstalledTemplate } from '../../features/marketplace/install.ts'
import { officialListings } from '../../features/marketplace/official.ts'
import { cleanMeta, coerceSnapshot, packageSnapshot } from '../../features/marketplace/sanitize.ts'
import type { TemplateListing, TemplateSample } from '../../features/marketplace/schema.ts'
import type { UserPage } from '../../features/builder/schema.ts'
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts'

const key = (id: string) => 'blanky.templates.' + id

export type TemplateLibrary = {
  listings: TemplateListing[]
  installed: { listingId: string; pageId: string; requestId: string }[]
  favorites: string[]
  admin: boolean
}

function official(): TemplateListing[] {
  return officialListings()
}

function local(userId: string): TemplateLibrary {
  try {
    const raw = JSON.parse(localStorage.getItem(key(userId)) ?? '{}') as Partial<TemplateLibrary>
    const extra = Array.isArray(raw.listings) ? raw.listings.filter((item) => item.creatorId === userId) : []
    return {
      listings: [...official(), ...extra],
      installed: Array.isArray(raw.installed) ? raw.installed : [],
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      admin: true,
    }
  } catch {
    return { listings: official(), installed: [], favorites: [], admin: true }
  }
}

function saveLocal(userId: string, state: TemplateLibrary) {
  localStorage.setItem(key(userId), JSON.stringify({
    listings: state.listings.filter((item) => item.creatorId === userId),
    installed: state.installed,
    favorites: state.favorites,
  }))
}

function mapRow(row: {
  id: string
  creator_id: string | null
  creator_name: string
  name: string
  description: string
  thumbnail_url: string
  gallery?: string[]
  category: string
  tags: string[]
  language: string
  status: string
  current_version: number
  current_version_id: string | null
  install_count: number
  source_page_id?: string | null
  created_at: string
  updated_at: string
  snapshot?: unknown
}, fallback?: TemplateListing): TemplateListing | null {
  const snapshot = fallback?.snapshot ?? coerceSnapshot(row.snapshot)
  if (!snapshot) return null
  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    name: row.name,
    description: row.description,
    thumbnailUrl: row.thumbnail_url,
    gallery: row.gallery ?? [],
    category: row.category,
    tags: row.tags ?? [],
    language: row.language === 'en' ? 'en' : 'ko',
    status: (['draft', 'pending_review', 'published', 'rejected', 'unlisted', 'archived'] as const).find((item) => item === row.status) ?? 'draft',
    currentVersion: row.current_version,
    currentVersionId: row.current_version_id ?? row.id,
    installCount: row.install_count,
    snapshot: snapshot ?? fallback!.snapshot,
    sourcePageId: row.source_page_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const repo = () => createTemplateRepository(getSupabaseClient())

export async function loadTemplates(userId: string): Promise<TemplateLibrary> {
  if (!isSupabaseConfigured) return local(userId)
  const r = repo()
  const [listed, mine, installs, favorites, admin] = await Promise.all([
    r.list({ limit: 48, sort: 'featured' }),
    r.mine(userId),
    r.myInstalls(),
    r.myFavorites(),
    r.isAdmin().catch(() => false),
  ])
  const byId = new Map(official().map((item) => [item.id, item]))
  const listings = [...listed, ...mine].flatMap((row) => {
    const next = mapRow(row, byId.get(row.id))
    return next ? [next] : []
  })
  for (const item of official()) {
    if (!listings.some((row) => row.id === item.id)) listings.push(item)
  }
  return {
    listings,
    installed: installs.map((row) => ({ listingId: row.listing_id, pageId: row.page_id, requestId: row.request_id })),
    favorites: favorites.map((row) => row.listing_id),
    admin,
  }
}

export async function getTemplate(userId: string, id: string): Promise<TemplateListing | null> {
  const known = official().find((item) => item.id === id)
  if (!isSupabaseConfigured) return local(userId).listings.find((item) => item.id === id) ?? known ?? null
  const row = await repo().get(id)
  if (!row) return known ?? local(userId).listings.find((item) => item.id === id) ?? null
  return mapRow(row, known)
}

export async function searchTemplates(userId: string, input: { query?: string; category?: string; language?: string; sort?: 'new' | 'popular' | 'featured'; offset?: number }) {
  if (!isSupabaseConfigured) {
    const all = local(userId).listings.filter((item) => item.status === 'published')
    const text = input.query?.trim().toLowerCase() ?? ''
    return all.filter((item) => {
      if (input.category && item.category !== input.category) return false
      if (input.language && item.language !== input.language) return false
      if (!text) return true
      return (item.name + ' ' + item.description + ' ' + item.tags.join(' ')).toLowerCase().includes(text)
    }).sort((a, b) => input.sort === 'popular' ? b.installCount - a.installCount : b.createdAt.localeCompare(a.createdAt))
  }
  const rows = await repo().list(input)
  const byId = new Map(official().map((item) => [item.id, item]))
  return rows.flatMap((row) => {
    const next = mapRow(row, byId.get(row.id))
    return next ? [next] : []
  })
}

export async function installTemplate(userId: string, listing: TemplateListing, requestId = crypto.randomUUID()): Promise<InstalledTemplate & { requestId: string }> {
  const built = forkSnapshot(listing.snapshot)
  if (isSupabaseConfigured) {
    const result = await repo().install(listing.id, requestId, {
      page: built.page,
      collections: built.collections,
      records: built.records,
    })
    if (result.pageId && result.pageId !== built.page.id) built.page.id = result.pageId
  } else {
    const state = local(userId)
    if (state.installed.some((item) => item.requestId === requestId)) return { ...built, requestId }
    if (!state.installed.some((item) => item.listingId === listing.id)) listing.installCount += 1
    state.installed = [...state.installed, { listingId: listing.id, pageId: built.page.id, requestId }]
    state.listings = state.listings.map((item) => item.id === listing.id ? { ...item, installCount: listing.installCount } : item)
    saveLocal(userId, state)
  }
  return { ...built, requestId }
}

export async function publishTemplate(userId: string, input: {
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
  sampleIds?: string[]
}) {
  const meta = cleanMeta(input)
  const snapshot = packageSnapshot({ ...input, ...meta })
  if (isSupabaseConfigured) {
    const id = await repo().publish({
      sourcePageId: input.source.id,
      name: meta.name,
      description: meta.description,
      category: meta.category,
      tags: meta.tags,
      thumbnailUrl: meta.thumbnailUrl,
      gallery: meta.gallery,
      language: meta.language,
      guide: input.guide,
      sampleIds: input.sampleIds ?? [],
    })
    return id
  }
  const now = new Date().toISOString()
  const listing: TemplateListing = {
    id: crypto.randomUUID(),
    creatorId: userId,
    creatorName: 'Me',
    ...meta,
    status: 'published',
    currentVersion: 1,
    currentVersionId: crypto.randomUUID(),
    installCount: 0,
    snapshot,
    sourcePageId: input.source.id,
    createdAt: now,
    updatedAt: now,
  }
  const state = local(userId)
  state.listings = [...state.listings.filter((item) => item.id !== listing.id), listing]
  saveLocal(userId, state)
  return listing.id
}

export async function publishTemplateVersion(userId: string, listingId: string, source: UserPage, guide: string, samples: TemplateSample[]) {
  const snapshot = packageSnapshot({
    source,
    name: source.name,
    description: source.description,
    category: 'free',
    tags: [],
    thumbnailUrl: '',
    gallery: [],
    language: 'ko',
    guide,
    samples,
  })
  if (isSupabaseConfigured) {
    return repo().publishVersion(listingId, source.id, guide, [])
  }
  const state = local(userId)
  state.listings = state.listings.map((item) => item.id === listingId && item.creatorId === userId
    ? { ...item, snapshot, currentVersion: item.currentVersion + 1, updatedAt: new Date().toISOString() }
    : item)
  saveLocal(userId, state)
  return state.listings.find((item) => item.id === listingId)?.currentVersion ?? 1
}

export async function updateListing(userId: string, id: string, patch: Partial<Pick<TemplateListing, 'name' | 'description' | 'thumbnailUrl' | 'gallery' | 'category' | 'tags' | 'status'>>) {
  if (patch.thumbnailUrl) cleanMeta({ name: patch.name ?? 'x', description: patch.description ?? '', category: patch.category ?? 'free', tags: patch.tags ?? [], thumbnailUrl: patch.thumbnailUrl, gallery: patch.gallery ?? [], language: 'ko' })
  if (isSupabaseConfigured) {
    await repo().updateListing(id, {
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.thumbnailUrl !== undefined ? { thumbnail_url: patch.thumbnailUrl } : {}),
      ...(patch.gallery ? { gallery: patch.gallery } : {}),
      ...(patch.category ? { category: patch.category } : {}),
      ...(patch.tags ? { tags: patch.tags } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    })
    return
  }
  const state = local(userId)
  state.listings = state.listings.map((item) => item.id === id && item.creatorId === userId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)
  saveLocal(userId, state)
}

export async function toggleFavorite(userId: string, listingId: string, on: boolean) {
  if (isSupabaseConfigured) return repo().setFavorite(userId, listingId, on)
  const state = local(userId)
  state.favorites = on ? [...new Set([...state.favorites, listingId])] : state.favorites.filter((id) => id !== listingId)
  saveLocal(userId, state)
}

export async function reportTemplate(listingId: string, reason: string) {
  if (!reason.trim()) throw new Error('신고 이유를 입력해 주세요.')
  if (isSupabaseConfigured) return repo().report(listingId, reason.trim())
}

export async function reviewTemplate(listingId: string, status: 'published' | 'rejected' | 'unlisted' | 'archived', reason = '') {
  if (isSupabaseConfigured) return repo().review(listingId, status, reason)
}

export function sharePath(id: string) {
  return '/store/templates/' + id
}
