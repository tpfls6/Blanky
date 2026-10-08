import type { ThemePackage } from '../../types/src/themePackage.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeThemeConfig, type BlankyTheme } from '../../types/src/theme.ts';
import type { Database, ThemeRow } from './database.generated.ts';
import { asJson } from './json.ts';
import { mapDbError } from './errors.ts';
function map(r: ThemeRow): BlankyTheme { return { id: r.id, creatorId: r.creator_id, creatorName: r.creator_name, name: r.name, description: r.description, thumbnailUrl: r.thumbnail_url, category: r.category, tags: r.tags, visibility: r.visibility === 'public' ? 'public' : 'private', pricingType: r.pricing_type === 'paid' ? 'paid' : 'free', price: r.price, config: normalizeThemeConfig(r.theme_config), themeType: r.theme_type === 'package' ? 'package' : 'basic', ...(r.theme_package ? { package: r.theme_package as unknown as ThemePackage } : {}), packageUrl: r.package_url, downloadCount: r.download_count, ratingAverage: Number(r.rating_average), ratingCount: r.rating_count, createdAt: r.created_at, updatedAt: r.updated_at }; }
export function createThemeRepository(client: SupabaseClient<Database>) {
    return {
        async getThemes() {
            const { data, error } = await client.from('themes').select('*').order('created_at', { ascending: false });
            if (error)
                throw mapDbError(error);
            return data.map(map);
        },
        async getThemeById(id: string) {
            const { data, error } = await client.from('themes').select('*').eq('id', id).maybeSingle();
            if (error)
                throw mapDbError(error);
            return data ? map(data) : null;
        },
        async getMyThemes(userId: string) {
            const { data, error } = await client.from('user_themes').select('theme_id').eq('user_id', userId);
            if (error)
                throw mapDbError(error);
            return data.map(r => r.theme_id);
        },
        async saveTheme(t: BlankyTheme) {
            const { data, error } = await client.from('themes').upsert({ id: t.id, creator_id: t.creatorId, creator_name: t.creatorName, name: t.name.trim(), description: t.description, thumbnail_url: t.thumbnailUrl, category: t.category, tags: t.tags, visibility: t.visibility, pricing_type: t.pricingType, price: t.pricingType === 'free' ? 0 : t.price, theme_config: asJson(normalizeThemeConfig(t.config)), ...(t.package ? { theme_type: 'package', format_version: t.package.manifest.formatVersion, package_version: t.package.manifest.version, manifest: asJson(t.package.manifest), custom_css: t.package.customCss, theme_package: asJson(t.package), package_url: t.packageUrl ?? '', preview_images: t.package.manifest.previews } : t.themeType === 'basic' ? { theme_type: 'basic', format_version: 1, package_version: '1.0.0', manifest: null, custom_css: '', theme_package: null, package_url: '', preview_images: [] } : {}) }).select('*').single();
            if (error)
                throw mapDbError(error);
            return map(data);
        },
        async deleteTheme(id: string) {
            const { error } = await client.from('themes').delete().eq('id', id);
            if (error)
                throw mapDbError(error);
        },
        async uninstallTheme(userId: string, id: string) {
            const { error } = await client.from('user_themes').delete().eq('user_id', userId).eq('theme_id', id);
            if (error)
                throw mapDbError(error);
        },
        async installTheme(id: string) {
            const { error } = await client.rpc('install_theme', { p_theme_id: id });
            if (error)
                throw mapDbError(error);
        },
        async getActiveTheme(userId: string) {
            const { data, error } = await client.from('user_theme_settings').select('active_theme_id').eq('user_id', userId).maybeSingle();
            if (error)
                throw mapDbError(error);
            return data?.active_theme_id ?? null;
        },
        async setActiveTheme(userId: string, id: string | null) {
            const { error } = await client.from('user_theme_settings').upsert({ user_id: userId, active_theme_id: id, updated_at: new Date().toISOString() });
            if (error)
                throw mapDbError(error);
        }
    };
}
