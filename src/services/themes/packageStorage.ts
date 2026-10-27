import type { ThemePackage } from '../../../packages/types/src/themePackage.ts';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client.ts';
import { validatePackage, validateAsset } from '../../theme/package/ThemeValidator.ts';
import { exportThemePackage } from '../../theme/package/ThemeLoader.ts';
import { fromBase64, LIMITS } from '../../theme/package/limits.ts';
const remoteCache = new Map<string, Promise<Uint8Array>>();
const sizes = new Map<string, number>();
export function clearPackageDownloadCache() { remoteCache.clear(); sizes.clear(); }
export async function readThemeStorage(path: string): Promise<Uint8Array> {
    let cached = remoteCache.get(path);
    if (!cached) {
        cached = (async () => { const { data, error } = await getSupabaseClient().storage.from('theme-assets').download(path); if (error || !data)
            throw new Error('테마 asset을 불러오지 못했습니다.'); if (data.size > LIMITS.image)
            throw new Error('asset 크기 제한을 초과했습니다.'); const bytes = new Uint8Array(await data.arrayBuffer()); sizes.set(path, bytes.length); let total = [...sizes.values()].reduce((a, b) => a + b, 0); for (const [old, size] of sizes) {
            if (total <= 32 * 1024 * 1024)
                break;
            if (old !== path) {
                sizes.delete(old);
                remoteCache.delete(old);
                total -= size;
            }
        } return bytes; })();
        remoteCache.set(path, cached);
        cached.catch(() => remoteCache.delete(path));
    }
    return cached;
}
export async function hydrateThemePackage(pkg: ThemePackage): Promise<ThemePackage> {
    const safe = validatePackage(pkg, true);
    const files: ThemePackage['files'] = {};
    for (const [p, f] of Object.entries(safe.files)) {
        files[p] = f.data ? f : validateAsset(p, await readThemeStorage(f.storagePath!), Object.values(safe.manifest.iconPack).includes(p));
    }
    return validatePackage({ ...safe, files });
}
export async function uploadThemePackage(userId: string, themeId: string, pkg: ThemePackage): Promise<{
    package: ThemePackage;
    packageUrl: string;
    rollback: () => Promise<void>;
}> {
    const hydrated = await hydrateThemePackage(pkg);
    if (!isSupabaseConfigured)
        return { package: hydrated, packageUrl: '', rollback: async () => { } };
    const client = getSupabaseClient();
    const prefix = userId + '/' + themeId + '/' + hydrated.manifest.version + '-' + crypto.randomUUID();
    const files: ThemePackage['files'] = {};
    const uploaded: {
        bucket: string;
        path: string;
    }[] = [];
    const rollback = async () => { for (const bucket of ['theme-assets', 'theme-previews', 'theme-packages']) {
        const paths = uploaded.filter(f => f.bucket === bucket).map(f => f.path);
        if (paths.length)
            await client.storage.from(bucket).remove(paths);
    } };
    try {
        for (const [p, f] of Object.entries(hydrated.files)) {
            const storagePath = prefix + '/assets/' + p.replaceAll('/', '_');
            const { error } = await client.storage.from('theme-assets').upload(storagePath, fromBase64(f.data!), { contentType: f.mime, cacheControl: '31536000', upsert: false });
            if (error)
                throw error;
            uploaded.push({ bucket: 'theme-assets', path: storagePath });
            files[p] = { mime: f.mime, storagePath };
        }
        for (const p of hydrated.manifest.previews) {
            const f = hydrated.files[p], storagePath = prefix + '/preview/' + p.replaceAll('/', '_');
            const { error } = await client.storage.from('theme-previews').upload(storagePath, fromBase64(f.data!), { contentType: f.mime, cacheControl: '31536000', upsert: false });
            if (error)
                throw error;
            uploaded.push({ bucket: 'theme-previews', path: storagePath });
        }
        const blob = await exportThemePackage(hydrated);
        const packagePath = prefix + '/theme.blankytheme';
        const { error } = await client.storage.from('theme-packages').upload(packagePath, blob, { contentType: 'application/octet-stream', cacheControl: '31536000', upsert: false });
        if (error)
            throw error;
        uploaded.push({ bucket: 'theme-packages', path: packagePath });
        return { package: { ...hydrated, files }, packageUrl: packagePath, rollback };
    }
    catch (e) {
        await rollback();
        throw e;
    }
}
