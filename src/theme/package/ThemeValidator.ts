import { normalizeThemeConfig, type ThemeConfig } from '../../../packages/types/src/theme.ts';
import { THEME_KINDS, type ThemeKind } from '../../../packages/types/src/themeSlots.ts';
import { THEME_ICON_KEYS, type ThemeManifest, type ThemePackage, type ThemeFile } from '../../../packages/types/src/themePackage.ts';
import { LIMITS, decoder, encoder, safePath, toBase64, fromBase64, packageError } from './limits.ts';
import { sanitizeSvg, sanitizeCss } from './ThemeSanitizer.ts';
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function text(v: unknown, max: number): string { if (typeof v !== 'string' || v.length > max)
    packageError('manifest 텍스트 형식이 올바르지 않습니다.'); return v; }
function mapping(v: unknown): Record<string, string> { if (v === undefined)
    return {}; if (!record(v) || Object.keys(v).length > 64)
    packageError('잘못된 asset mapping입니다.'); const out: Record<string, string> = {}; for (const [k, p] of Object.entries(v)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(k))
        packageError('잘못된 asset 이름입니다.');
    out[k] = safePath(text(p, 200));
} return out; }
export function validateManifest(v: unknown): ThemeManifest {
    if (!record(v))
        packageError('manifest가 필요합니다.');
    if (v.formatVersion !== 1)
        packageError('이 테마는 현재 Blanky 버전에서 지원하지 않는 형식입니다. 테마 형식: ' + String(v.formatVersion) + ' / 현재 지원: 1');
    const id = text(v.id, 100), version = text(v.version, 50), name = text(v.name, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version) || !name.trim())
        packageError('manifest ID, 이름 또는 버전이 올바르지 않습니다.');
    if (!record(v.entry))
        packageError('theme entry가 필요합니다.');
    const theme = safePath(text(v.entry.theme, 200));
    const stylesheet = v.entry.stylesheet === undefined ? undefined : safePath(text(v.entry.stylesheet, 200));
    if (theme === 'manifest.json' || !theme.endsWith('.json') || (stylesheet && !stylesheet.endsWith('.css')))
        packageError('entry 파일 형식이 올바르지 않습니다.');
    const assets = mapping(v.assets), icons = mapping(v.iconPack);
    for (const [k, p] of Object.entries(icons)) {
        if (!THEME_ICON_KEYS.includes(k as typeof THEME_ICON_KEYS[number]) || !/\.(svg|png|jpe?g|webp)$/.test(p))
            packageError('아이콘은 지원되는 이름의 SVG, PNG, JPG, WebP만 사용할 수 있습니다.');
    }
    const imageSettings: NonNullable<ThemeManifest['imageSettings']> = {};
    if (v.imageSettings !== undefined) {
        if (!record(v.imageSettings) || Object.keys(v.imageSettings).length > 64) packageError('Invalid image settings');
        for (const [key, settings] of Object.entries(v.imageSettings)) {
            if (!Object.hasOwn(assets, key) || !record(settings)) packageError('Invalid image settings');
            for (const field of ['size', 'x', 'y', 'opacity']) {
                const n = settings[field];
                if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > (field === 'size' ? 200 : 100)) packageError('Invalid image setting range');
            }
            if (!['cover', 'contain', 'repeat'].includes(String(settings.fit))) packageError('Invalid image fit');
            if (settings.visible !== undefined && typeof settings.visible !== 'boolean') packageError('Invalid image visibility');
            imageSettings[key] = { size: settings.size as number, x: settings.x as number, y: settings.y as number, opacity: settings.opacity as number, fit: settings.fit as 'cover' | 'contain' | 'repeat', ...(settings.fileName ? { fileName: text(settings.fileName, 255) } : {}), ...(settings.visible === false ? { visible: false } : {}) };
        }
    }
    const previews = v.previews ?? [];
    if (!Array.isArray(previews) || previews.length > 8)
        packageError('preview는 최대 8개입니다.');
    const fonts = mapping(v.fonts);
    if (Object.keys(fonts).some(k => !['body', 'heading'].includes(k)))
        packageError('폰트 mapping이 올바르지 않습니다.');
    const kind = v.kind === undefined ? undefined : THEME_KINDS.includes(v.kind as ThemeKind) ? v.kind as ThemeKind : packageError('잘못된 테마 유형입니다.');
    return { formatVersion: 1, id, name, description: text(v.description ?? '', 2000), author: text(v.author, 100), version, entry: { theme, ...(stylesheet ? { stylesheet } : {}) }, assets, ...(kind ? { kind } : {}), ...(Object.keys(imageSettings).length ? { imageSettings } : {}), iconPack: icons, previews: previews.map(p => safePath(text(p, 200))), ...(Object.keys(fonts).length ? { fonts } : {}) };
}
export function validateConfig(v: unknown): ThemeConfig {
    if (!record(v) || !record(v.colors))
        packageError('theme config의 colors가 필요합니다.');
    const normalized = normalizeThemeConfig(v);
    for (const [group, target] of Object.entries(normalized)) {
        const source = v[group];
        if (group === 'iconPack' || group === 'mode') {
            if (source !== undefined && source !== target)
                packageError(group === 'mode' ? '잘못된 테마 모드입니다.' : '잘못된 기본 아이콘 스타일입니다.');
            continue;
        }
        if (source !== undefined && !record(source))
            packageError('잘못된 theme config입니다.');
        if (record(source))
            for (const [k, value] of Object.entries(source))
                if (Object.hasOwn(target, k) && ((target as Record<string, unknown>)[k] !== value))
                    packageError('잘못된 theme config 값: ' + group + '.' + k);
    }
    return normalized;
}
export function validateAsset(p: string, bytes: Uint8Array, icon = false): ThemeFile {
    safePath(p);
    const ext = p.split('.').at(-1)?.toLowerCase();
    let mime = '';
    let limit = LIMITS.image;
    const starts = (a: number[]) => a.every((v, i) => bytes[i] === v);
    const dimensions = (width: number, height: number) => { if (!width || !height || width * height > 32 * 1024 * 1024)
        packageError('이미지는 최대 32메가픽셀입니다.'); };
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (ext === 'png' && starts([137, 80, 78, 71, 13, 10, 26, 10])) {
        if (bytes.length < 33 || decoder.decode(bytes.slice(12, 16)) !== 'IHDR')
            packageError('손상된 PNG입니다.');
        dimensions(view.getUint32(16), view.getUint32(20));
        mime = 'image/png';
    }
    else if (['jpg', 'jpeg'].includes(ext ?? '') && starts([255, 216, 255])) {
        let offset = 2, found = false;
        while (offset + 4 < bytes.length) {
            if (bytes[offset++] !== 255)
                break;
            while (bytes[offset] === 255)
                offset++;
            const marker = bytes[offset++];
            if (marker === 0xd9 || marker === 0xda)
                break;
            if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7)
                continue;
            if (offset + 2 > bytes.length)
                break;
            const size = view.getUint16(offset);
            if (size < 2 || offset + size > bytes.length)
                break;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && size >= 8) {
                dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
                found = true;
                break;
            }
            offset += size;
        }
        if (!found)
            packageError('손상된 JPEG입니다.');
        mime = 'image/jpeg';
    }
    else if (ext === 'webp' && decoder.decode(bytes.slice(0, 4)) === 'RIFF' && decoder.decode(bytes.slice(8, 12)) === 'WEBP') {
        if (bytes.length < 30 || view.getUint32(4, true) + 8 !== bytes.length)
            packageError('손상된 WebP입니다.');
        const kind = decoder.decode(bytes.slice(12, 16));
        if (kind === 'VP8X')
            dimensions(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
        else if (kind === 'VP8L' && bytes[20] === 47) {
            const packed = view.getUint32(21, true);
            dimensions((packed & 16383) + 1, ((packed >>> 14) & 16383) + 1);
        }
        else if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42)
            dimensions(view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383);
        else
            packageError('지원하지 않는 WebP 이미지입니다.');
        mime = 'image/webp';
    }
    else if (ext === 'svg') {
        mime = 'image/svg+xml';
        limit = LIMITS.icon;
        bytes = encoder.encode(sanitizeSvg(decoder.decode(bytes)));
    }
    else if (ext === 'woff2' && starts([119, 79, 70, 50])) {
        if (bytes.length < 48 || view.getUint32(8) !== bytes.length || view.getUint32(16) > LIMITS.package || !view.getUint16(12))
            packageError('손상되었거나 너무 큰 WOFF2 폰트입니다.');
        mime = 'font/woff2';
        limit = LIMITS.font;
    }
    else
        packageError('허용되지 않거나 파일 내용과 확장자가 다른 asset입니다: ' + p);
    if (icon && !mime.startsWith('image/'))
        packageError('아이콘은 이미지 파일만 지원합니다.');
    if (!bytes.length || bytes.length > limit)
        packageError('asset 파일 크기 제한을 초과했습니다.');
    return { mime, data: toBase64(bytes) };
}
export function validatePackage(input: unknown, allowStorage = false): ThemePackage {
    if (!record(input))
        packageError('테마 패키지가 올바르지 않습니다.');
    const manifest = validateManifest(input.manifest), config = validateConfig(input.config);
    if (!record(input.files) || Object.keys(input.files).length > LIMITS.files)
        packageError('패키지 파일 목록이 올바르지 않습니다.');
    const files: Record<string, ThemeFile> = {};
    let total = 0;
    for (const [p, f] of Object.entries(input.files)) {
        safePath(p);
        if (!p.startsWith('assets/') && !p.startsWith('preview/'))
            packageError('asset은 assets/ 또는 preview/ 안에 있어야 합니다.');
        if (!record(f))
            packageError('asset 파일이 올바르지 않습니다.');
        if (typeof f.data === 'string') {
            const bytes = fromBase64(f.data);
            total += bytes.length;
            files[p] = validateAsset(p, bytes, Object.values(manifest.iconPack).includes(p));
        }
        else if (allowStorage && typeof f.storagePath === 'string') {
            safePath(f.storagePath);
            if (!/^[-a-zA-Z0-9_]+\/[-a-zA-Z0-9_]+\/[a-zA-Z0-9_.-]+\/assets\//.test(f.storagePath))
                packageError('잘못된 Storage asset 경로입니다.');
            const ext = p.split('.').at(-1);
            const mimes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', woff2: 'font/woff2' };
            if (!ext || mimes[ext] !== f.mime)
                packageError('잘못된 Storage asset 형식입니다.');
            files[p] = { mime: f.mime as string, storagePath: f.storagePath };
        }
        else
            packageError('asset 데이터가 없습니다.');
    }
    if (total > LIMITS.package)
        packageError('패키지는 최대 20MB입니다.');
    for (const p of [...Object.values(manifest.assets), ...Object.values(manifest.iconPack), ...manifest.previews, ...Object.values(manifest.fonts ?? {})])
        if (p && !Object.hasOwn(files, p))
            packageError('asset을 찾을 수 없습니다: ' + p);
    for (const p of Object.values(manifest.assets))
        if (!files[p].mime.startsWith('image/'))
            packageError('이미지 asset이 필요합니다.');
    if (manifest.assets.checkbox && files[manifest.assets.checkbox].mime !== 'image/svg+xml')
        packageError('체크박스는 SVG만 지원합니다.');
    for (const p of manifest.previews)
        if (!files[p].mime.startsWith('image/'))
            packageError('preview는 이미지여야 합니다.');
    for (const p of Object.values(manifest.fonts ?? {}))
        if (p && files[p].mime !== 'font/woff2')
            packageError('폰트는 WOFF2만 지원합니다.');
    const customCss = sanitizeCss(text(input.customCss ?? '', LIMITS.css), manifest.assets);
    if (customCss && !manifest.entry.stylesheet) manifest.entry.stylesheet = 'style.css';
    return { manifest, config, customCss, files };
}
