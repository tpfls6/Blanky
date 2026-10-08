import { validatePackage } from '../../theme/package/ThemeValidator.ts';
import { uploadThemePackage, clearPackageDownloadCache } from './packageStorage.ts';
import { getLocalPackage, putLocalPackage, deleteLocalPackage } from './localPackages.ts';
import { createThemeRepository } from '@blanky/api';
import { BUILTIN_THEMES, normalizeThemeConfig, type BlankyTheme } from '@blanky/types';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts';
export type ThemeLibrary = {
    themes: BlankyTheme[];
    installed: string[];
    active: string | null;
};
const key = (id: string) => 'blanky.themes.' + id;
function local(id: string): ThemeLibrary {
    try {
        const raw = JSON.parse(localStorage.getItem(key(id)) ?? '{}');
        return { themes: [...BUILTIN_THEMES, ...(Array.isArray(raw.themes) ? raw.themes.filter((t: BlankyTheme) => t.creatorId === id).map((t: BlankyTheme) => ({ ...t, config: normalizeThemeConfig(t.config) })) : [])], installed: Array.isArray(raw.installed) ? raw.installed : [], active: typeof raw.active === 'string' ? raw.active : null };
    }
    catch {
        return { themes: BUILTIN_THEMES, installed: [], active: null };
    }
}
const repo = () => createThemeRepository(getSupabaseClient());
export async function loadThemes(id: string): Promise<ThemeLibrary> {
    if (!isSupabaseConfigured)
        return { ...local(id), themes: await Promise.all(local(id).themes.map(async (t) => t.package ? ({ ...t, package: await getLocalPackage(id, t.id).catch(()=>undefined) ?? t.package }) : t)) };
    const r = repo();
    const [themes, installed, active] = await Promise.all([r.getThemes(), r.getMyThemes(id), r.getActiveTheme(id)]);
    return { themes: [...BUILTIN_THEMES.filter(t => !themes.some(r => r.id === t.id)), ...themes], installed, active };
}
export async function saveTheme(id: string, t: BlankyTheme) {
    if (t.creatorId !== id || !t.name.trim() || t.name.length > 100 || !Number.isSafeInteger(t.price) || t.price < 0 || t.price > 2147483647 || (t.pricingType === 'paid' && t.price === 0))
        throw new Error('테마 이름과 가격을 확인해 주세요.');
    if (t.thumbnailUrl && !/^https:\/\//i.test(t.thumbnailUrl))
        throw new Error('대표 이미지는 HTTPS URL을 사용해 주세요.');
    const validated = t.package ? validatePackage({ ...t.package, config: t.config, manifest: { ...t.package.manifest, name: t.name, description: t.description } }, true) : undefined;
    const next = { ...t, ...(validated ? { themeType: 'package' as const, package: validated } : { themeType: 'basic' as const }), config: normalizeThemeConfig(t.config), price: t.pricingType === 'free' ? 0 : t.price, updatedAt: new Date().toISOString() };
    if (isSupabaseConfigured) {
        if (!next.package)
            return repo().saveTheme(next);
        const uploaded = await uploadThemePackage(id, next.id, next.package);
        try {
            return await repo().saveTheme({ ...next, package: uploaded.package, packageUrl: uploaded.packageUrl });
        }
        catch (e) {
            await uploaded.rollback();
            throw e;
        }
    }
    const state = local(id);
    if (next.package)
        await putLocalPackage(id, next.id, next.package);
    else
        await deleteLocalPackage(id, next.id);
    state.themes = [...state.themes.filter(r => r.id !== t.id), next.package ? { ...next, package: { ...next.package, files: {} } } : next];
    localStorage.setItem(key(id), JSON.stringify(state));
    return next;
}
export async function installTheme(id: string, t: BlankyTheme) {
    if (t.pricingType === 'paid')
        throw new Error('결제 기능은 추후 지원 예정입니다.');
    if (isSupabaseConfigured)
        return repo().installTheme(t.id);
    const state = local(id);
    if (!state.themes.some(row => row.id === t.id && row.visibility === 'public'))
        throw new Error('공개된 테마만 설치할 수 있습니다.');
    state.installed = [...new Set([...state.installed, t.id])];
    localStorage.setItem(key(id), JSON.stringify(state));
}
export async function setActiveTheme(id: string, themeId: string | null) {
    if (isSupabaseConfigured)
        return repo().setActiveTheme(id, themeId);
    const state = local(id);
    if (themeId && !state.themes.some(t => t.id === themeId && (!t.creatorId || t.creatorId === id || state.installed.includes(t.id))))
        throw new Error('보유한 테마만 적용할 수 있습니다.');
    state.active = themeId;
    localStorage.setItem(key(id), JSON.stringify(state));
}
export async function removeTheme(id: string, t: BlankyTheme) {
    if (!t.creatorId)
        throw new Error('기본 테마는 삭제할 수 없습니다.');
    clearPackageDownloadCache();
    await deleteLocalPackage(id, t.id);
    if (isSupabaseConfigured) {
        if (t.creatorId === id)
            await repo().deleteTheme(t.id);
        else
            await repo().uninstallTheme(id, t.id);
        return;
    }
    const state = local(id);
    state.installed = state.installed.filter(v => v !== t.id);
    if (state.active === t.id)
        state.active = null;
    if (t.creatorId === id)
        state.themes = state.themes.filter(v => v.id !== t.id);
    localStorage.setItem(key(id), JSON.stringify(state));
}
export async function importInstalledTheme(userId: string, theme: BlankyTheme) { const saved = await saveTheme(userId, theme); if (!isSupabaseConfigured) {
    const state = local(userId);
    state.installed = [...new Set([...state.installed, saved.id])];
    localStorage.setItem(key(userId), JSON.stringify(state));
} return saved; }
