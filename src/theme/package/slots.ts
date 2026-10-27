import { CHARACTER_SLOTS, inferThemeKind, slotsForKind, type ThemeKind } from '../../../packages/types/src/themeSlots.ts';
import type { ThemeManifest, ThemePackage } from '../../../packages/types/src/themePackage.ts';
import type { BlankyTheme } from '../../../packages/types/src/theme.ts';
export function themeKindOf(theme: BlankyTheme): ThemeKind {
    return inferThemeKind(theme.package?.manifest.assets, theme.package?.manifest.kind);
}
export function assetVisible(settings?: { visible?: boolean }): boolean {
    return settings?.visible !== false;
}
export function prunePackageForKind(pkg: ThemePackage, kind: ThemeKind): ThemePackage {
    const next = structuredClone(pkg);
    next.manifest.kind = kind;
    const drop = kind === 'color' ? Object.keys(next.manifest.assets) : kind === 'pattern' ? [...CHARACTER_SLOTS, 'character'] : [];
    for (const key of drop)
        delete next.manifest.assets[key];
    if (next.manifest.imageSettings) {
        for (const key of Object.keys(next.manifest.imageSettings)) {
            if (!Object.hasOwn(next.manifest.assets, key))
                delete next.manifest.imageSettings[key];
        }
    }
    const used = new Set([...Object.values(next.manifest.assets), ...Object.values(next.manifest.iconPack), ...Object.values(next.manifest.fonts ?? {}), ...next.manifest.previews]);
    next.files = Object.fromEntries(Object.entries(next.files).filter(([path]) => used.has(path)));
    return next;
}
const ASSET_FOLDERS: Record<string, string> = {
    wallpaper: 'assets/backgrounds/',
    background: 'assets/backgrounds/',
    pageBackground: 'assets/backgrounds/',
    pattern: 'assets/patterns/',
    sidebar: 'assets/components/',
    calendarBackground: 'assets/components/',
    scheduleBackground: 'assets/components/',
    taskBackground: 'assets/components/',
    cardBackground: 'assets/components/',
    buttonBackground: 'assets/components/',
    checkbox: 'assets/components/',
    diaryBackground: 'assets/components/',
    character: 'assets/characters/',
    sidebarTop: 'assets/characters/',
    sidebarBottom: 'assets/characters/',
    pageHeader: 'assets/characters/',
    cardCorner: 'assets/characters/',
    emptyState: 'assets/characters/',
};
export function themeAssetPath(group: 'assets' | 'iconPack' | 'fonts' | 'previews', name: string, ext: string): string {
    const file = name + '-' + crypto.randomUUID() + '.' + ext;
    if (group === 'previews')
        return 'preview/' + file;
    if (group === 'iconPack')
        return 'assets/icons/' + file;
    if (group === 'fonts')
        return 'assets/fonts/' + file;
    return (ASSET_FOLDERS[name] ?? 'assets/') + file;
}
export function defaultImageSettings(slot: string, fileName?: string): NonNullable<ThemeManifest['imageSettings']>[string] {
    const fit = slot === 'pattern' ? 'repeat' : slot === 'wallpaper' || slot === 'background' ? 'cover' : 'contain';
    return { size: slot === 'pattern' ? 24 : 100, x: slot === 'cardCorner' || slot === 'pageHeader' ? 100 : 50, y: slot === 'sidebarBottom' ? 100 : slot === 'cardCorner' || slot === 'sidebarTop' ? 0 : 50, opacity: 100, fit, visible: true, ...(fileName ? { fileName } : {}) };
}
export { slotsForKind };
