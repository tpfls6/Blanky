import type { ThemePackage } from '../../../packages/types/src/themePackage.ts';
import { fromBase64 } from './limits.ts';
export interface ResolvedAssets {
    assets: Record<string, string>;
    icons: Record<string, string>;
    previews: string[];
    fonts: Record<string, string>;
    dispose: () => void;
}
const cache = new Map<string, {
    url: string;
    refs: number;
}>();
export function resolveThemeAssets(pkg: ThemePackage, storageUrl?: (p: string) => string): ResolvedAssets {
    const held: string[] = [];
    const paths: Record<string, string> = {};
    try {
        for (const [p, f] of Object.entries(pkg.files)) {
            if (f.storagePath) {
                if (!storageUrl)
                    throw new Error('Storage를 사용할 수 없습니다.');
                paths[p] = storageUrl(f.storagePath);
                continue;
            }
            const key = pkg.manifest.id + '@' + pkg.manifest.version + ':' + p + ':' + f.data;
            let entry = cache.get(key);
            if (!entry) {
                entry = { url: URL.createObjectURL(new Blob([fromBase64(f.data!) as BlobPart], { type: f.mime })), refs: 0 };
                cache.set(key, entry);
            }
            entry.refs++;
            held.push(key);
            paths[p] = entry.url;
        }
    }
    catch (e) {
        release(held);
        throw e;
    }
    const map = (m: Record<string, string | undefined>) => Object.fromEntries(Object.entries(m).filter(([, p]) => p).map(([k, p]) => [k, paths[p!]]));
    let disposed = false;
    return { assets: map(pkg.manifest.assets), icons: map(pkg.manifest.iconPack), previews: pkg.manifest.previews.map(p => paths[p]), fonts: map(pkg.manifest.fonts ?? {}), dispose: () => { if (!disposed) {
            disposed = true;
            release(held);
        } } };
}
function release(keys: string[]) { for (const k of keys) {
    const e = cache.get(k);
    if (e && --e.refs === 0) {
        URL.revokeObjectURL(e.url);
        cache.delete(k);
    }
} }
export function themeAssetCacheSize() { return cache.size; }
