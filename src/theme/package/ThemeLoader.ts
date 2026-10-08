import type { BlankyTheme } from '../../../packages/types/src/theme.ts';
import type { ThemePackage } from '../../../packages/types/src/themePackage.ts';
import { LIMITS, decoder, encoder, fromBase64, packageError } from './limits.ts';
import { readZip, writeZip } from './zip.ts';
import { validateAsset, validateManifest, validateConfig, validatePackage } from './ThemeValidator.ts';
export async function importThemePackage(file: Blob): Promise<ThemePackage> {
    if (file.size > LIMITS.package)
        packageError('전체 테마 패키지는 최대 20MB입니다.');
    const files = await readZip(new Uint8Array(await file.arrayBuffer()));
    const json = (p: string) => { if (!files[p] || files[p].length > LIMITS.json)
        packageError('필수 JSON 파일이 없거나 너무 큽니다: ' + p); try {
        return JSON.parse(decoder.decode(files[p]));
    }
    catch {
        packageError('JSON 파싱에 실패했습니다: ' + p);
    } };
    const manifest = validateManifest(json('manifest.json'));
    const config = validateConfig(json(manifest.entry.theme));
    const customCss = manifest.entry.stylesheet ? (() => { const b = files[manifest.entry.stylesheet!]; if (!b || b.length > LIMITS.css)
        packageError('stylesheet가 없거나 너무 큽니다.'); return decoder.decode(b); })() : '';
    const assetFiles: ThemePackage['files'] = {};
    for (const [p, b] of Object.entries(files)) {
        if (p === 'manifest.json' || p === manifest.entry.theme || p === manifest.entry.stylesheet)
            continue;
        if (!p.startsWith('assets/') && !p.startsWith('preview/'))
            packageError('허용되지 않은 패키지 파일입니다: ' + p);
        assetFiles[p] = validateAsset(p, b, Object.values(manifest.iconPack).includes(p));
    }
    return validatePackage({ manifest, config, customCss, files: assetFiles });
}
export function packageFromTheme(t: BlankyTheme): ThemePackage { return t.package ? validatePackage({ ...t.package, config: t.config, manifest: {...t.package.manifest,name:t.name,description:t.description} }, true) : { manifest: { formatVersion: 1, id: t.id, name: t.name, description: t.description, author: t.creatorName, version: '1.0.0', entry: { theme: 'theme.json', stylesheet: 'style.css' }, assets: {}, iconPack: {}, previews: [] }, config: t.config, customCss: '', files: {} }; }
export async function exportThemePackage(pkg: ThemePackage, readStorage?: (p: string) => Promise<Uint8Array>): Promise<Blob> {
    const hydrated: ThemePackage = { ...pkg, files: {} };
    for (const [p, f] of Object.entries(pkg.files)) {
        if (f.data)
            hydrated.files[p] = f;
        else if (f.storagePath && readStorage)
            hydrated.files[p] = validateAsset(p, await readStorage(f.storagePath));
        else
            packageError('내보낼 asset을 읽을 수 없습니다.');
    }
    const safe = validatePackage(hydrated);
    const files: Record<string, Uint8Array> = { 'manifest.json': encoder.encode(JSON.stringify(safe.manifest, null, 2)), [safe.manifest.entry.theme]: encoder.encode(JSON.stringify(safe.config, null, 2)) };
    if (safe.manifest.entry.stylesheet)
        files[safe.manifest.entry.stylesheet] = encoder.encode(safe.customCss);
    for (const [p, f] of Object.entries(safe.files))
        files[p] = fromBase64(f.data!);
    return new Blob([writeZip(files) as BlobPart], { type: 'application/octet-stream' });
}
export function downloadTheme(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name.replace(/[^a-zA-Z0-9가-힣_-]/g, '-') + '.blanky-theme'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
