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
export function defaultImageSettings(slot: string, fileName?: string): NonNullable<ThemeManifest['imageSettings']>[string] {
    const fit = slot === 'pattern' ? 'repeat' : slot === 'wallpaper' || slot === 'background' ? 'cover' : 'contain';
    return { size: slot === 'pattern' ? 24 : 100, x: slot === 'cardCorner' || slot === 'pageHeader' ? 100 : 50, y: slot === 'sidebarBottom' ? 100 : slot === 'cardCorner' || slot === 'sidebarTop' ? 0 : 50, opacity: 100, fit, visible: true, ...(fileName ? { fileName } : {}) };
}
export { slotsForKind };
