import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TemplateListingRow } from './database.generated.ts'
import { mapDbError } from './errors.ts'
import { asJson } from './json.ts'

export type TemplateListingRowView = TemplateListingRow & { snapshot?: Json }

export type TemplateQuery = {
  query?: string
  category?: string
  language?: string
  sort?: 'new' | 'popular' | 'featured'
  mine?: boolean
  installed?: boolean
  favorites?: boolean
  offset?: number
  limit?: number
}

function mapListing(row: TemplateListingRow, snapshot?: Json): TemplateListingRowView {
  return { ...row, snapshot }
}

export function createTemplateRepository(client: SupabaseClient<Database>) {
  return {
    async list(input: TemplateQuery = {}) {
      const limit = Math.min(Math.max(input.limit ?? 24, 1), 60)
      const offset = Math.max(input.offset ?? 0, 0)
      let q = client.from('template_listings').select('*')
      if (input.mine) q = q
      else q = q.eq('status', 'published')
      if (input.category) q = q.eq('category', input.category)
      if (input.language) q = q.eq('language', input.language)
      if (input.query?.trim()) {
        const text = input.query.trim().replace(/[%_,.()]/g, ' ').slice(0, 80)
        q = q.or(`name.ilike.%${text}%,description.ilike.%${text}%`)
      }
      if (input.sort === 'popular') q = q.order('install_count', { ascending: false }).order('created_at', { ascending: false })
      else q = q.order('created_at', { ascending: false })
      const { data, error } = await q.range(offset, offset + limit - 1)
      if (error) throw mapDbError(error)
      return (data ?? []).map((row) => mapListing(row))
    },

    async get(id: string) {
      const { data, error } = await client.from('template_listings').select('*').eq('id', id).maybeSingle()
      if (error) throw mapDbError(error)
      if (!data) return null
      const version = data.current_version_id
        ? await client.from('template_versions').select('snapshot').eq('id', data.current_version_id).maybeSingle()
        : await client.from('template_versions').select('snapshot').eq('listing_id', id).order('version', { ascending: false }).limit(1).maybeSingle()
      if (version.error) throw mapDbError(version.error)
      return mapListing(data, version.data?.snapshot)
    },

    async myInstalls() {
      const { data, error } = await client.from('template_installs').select('listing_id, version_id, page_id, request_id, created_at')
      if (error) throw mapDbError(error)
      return data ?? []
    },

    async myFavorites() {
      const { data, error } = await client.from('template_favorites').select('listing_id, created_at')
      if (error) throw mapDbError(error)
      return data ?? []
    },

    async setFavorite(userId: string, listingId: string, on: boolean) {
      if (on) {
        const { error } = await client.from('template_favorites').upsert({ listing_id: listingId, user_id: userId })
        if (error) throw mapDbError(error)
        return
      }
      const { error } = await client.from('template_favorites').delete().eq('listing_id', listingId)
      if (error) throw mapDbError(error)
    },

    async mine(userId: string) {
      const { data, error } = await client.from('template_listings').select('*').eq('creator_id', userId).order('updated_at', { ascending: false })
      if (error) throw mapDbError(error)
      return (data ?? []).map((row) => mapListing(row))
    },

    async publish(input: {
      sourcePageId: string
      name: string
      description: string
      category: string
      tags: string[]
      thumbnailUrl: string
      gallery: string[]
      language: string
      guide: string
      sampleIds: string[]
    }) {
      const { data, error } = await client.rpc('publish_template', {
        p_source_page_id: input.sourcePageId,
        p_name: input.name,
        p_description: input.description,
        p_category: input.category,
        p_tags: input.tags,
        p_thumbnail_url: input.thumbnailUrl,
        p_gallery: input.gallery,
        p_language: input.language,
        p_guide: input.guide,
        p_sample_ids: input.sampleIds,
      })
      if (error) throw mapDbError(error)
      return data
    },

    async publishVersion(listingId: string, sourcePageId: string, guide: string, sampleIds: string[]) {
      const { data, error } = await client.rpc('publish_template_version', {
        p_listing_id: listingId,
        p_source_page_id: sourcePageId,
        p_guide: guide,
        p_sample_ids: sampleIds,
      })
      if (error) throw mapDbError(error)
      return data
    },

    async updateListing(id: string, patch: { name?: string; description?: string; thumbnail_url?: string; gallery?: string[]; category?: string; tags?: string[]; status?: string }) {
      const { error } = await client.from('template_listings').update(patch).eq('id', id)
      if (error) throw mapDbError(error)
    },

    async install(listingId: string, requestId: string, payload: unknown) {
      const { data, error } = await client.rpc('install_template', {
        p_listing_id: listingId,
        p_request_id: requestId,
        p_payload: asJson(payload),
      })
      if (error) throw mapDbError(error)
      const row = data && typeof data === 'object' ? data as { pageId?: string; replayed?: boolean } : {}
      return { pageId: String(row.pageId ?? ''), replayed: row.replayed === true }
    },

    async report(listingId: string, reason: string) {
      const { error } = await client.rpc('report_template', { p_listing_id: listingId, p_reason: reason })
      if (error) throw mapDbError(error)
    },

    async review(listingId: string, status: string, reason = '') {
      const { error } = await client.rpc('review_template', { p_listing_id: listingId, p_status: status, p_reason: reason })
      if (error) throw mapDbError(error)
    },

    async isAdmin() {
      const { data, error } = await client.rpc('is_blanky_admin')
      if (error) throw mapDbError(error)
      return data === true
    },
  }
}
