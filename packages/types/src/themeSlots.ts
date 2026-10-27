export const THEME_KINDS = ['color', 'pattern', 'character'] as const;
export type ThemeKind = (typeof THEME_KINDS)[number];
export const THEME_MODES = ['light', 'dark'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];
export const THEME_DECORATION_SLOTS = ['wallpaper', 'pattern', 'sidebarTop', 'sidebarBottom', 'pageHeader', 'cardCorner', 'emptyState'] as const;
export type ThemeDecorationSlot = (typeof THEME_DECORATION_SLOTS)[number];
export const THEME_SLOT_ALIASES: Record<string, ThemeDecorationSlot> = {
    background: 'wallpaper',
    pageBackground: 'wallpaper',
};
export const PATTERN_SLOTS: ThemeDecorationSlot[] = ['wallpaper', 'pattern'];
export const CHARACTER_SLOTS: ThemeDecorationSlot[] = ['sidebarTop', 'sidebarBottom', 'pageHeader', 'cardCorner', 'emptyState'];
export interface ThemeSlotSpec {
    key: ThemeDecorationSlot;
    label: string;
    kinds: ThemeKind[];
    accept: string;
    transparent: boolean;
    width: number;
    height: number;
    ratio: string;
    maxKb: number;
    placement: string;
}
export const THEME_SLOT_SPECS: ThemeSlotSpec[] = [
    { key: 'wallpaper', label: '전체 배경', kinds: ['pattern', 'character'], accept: '.png,.webp,.jpg,.jpeg,.svg', transparent: false, width: 1440, height: 900, ratio: '16:10', maxKb: 5120, placement: '앱 전체 배경' },
    { key: 'pattern', label: '반복 패턴', kinds: ['pattern', 'character'], accept: '.png,.webp,.svg', transparent: true, width: 256, height: 256, ratio: '1:1', maxKb: 512, placement: '배경 위 타일' },
    { key: 'sidebarTop', label: '사이드바 상단', kinds: ['character'], accept: '.png,.webp,.svg', transparent: true, width: 208, height: 120, ratio: '16:9', maxKb: 1024, placement: '사이드바 맨 위, 메뉴 위' },
    { key: 'sidebarBottom', label: '사이드바 하단', kinds: ['character'], accept: '.png,.webp,.svg', transparent: true, width: 208, height: 160, ratio: '4:3', maxKb: 1024, placement: '사이드바 맨 아래, 설정 아래' },
    { key: 'pageHeader', label: '페이지 헤더', kinds: ['character'], accept: '.png,.webp,.svg', transparent: true, width: 320, height: 96, ratio: '10:3', maxKb: 1024, placement: '페이지 제목 오른쪽' },
    { key: 'cardCorner', label: '카드 모서리', kinds: ['character'], accept: '.png,.webp,.svg', transparent: true, width: 96, height: 96, ratio: '1:1', maxKb: 512, placement: '카드 오른쪽 위' },
    { key: 'emptyState', label: '빈 화면', kinds: ['character'], accept: '.png,.webp,.svg', transparent: true, width: 480, height: 320, ratio: '3:2', maxKb: 2048, placement: '빈 목록 일러스트' },
];
export function slotsForKind(kind: ThemeKind): ThemeDecorationSlot[] {
    if (kind === 'color')
        return [];
    if (kind === 'pattern')
        return PATTERN_SLOTS;
    return [...PATTERN_SLOTS, ...CHARACTER_SLOTS];
}
export function inferThemeKind(assets: Record<string, string> | undefined, stored?: string): ThemeKind {
    if (stored && THEME_KINDS.includes(stored as ThemeKind))
        return stored as ThemeKind;
    const keys = new Set<string>(Object.keys(assets ?? {}).map(k => THEME_SLOT_ALIASES[k] ?? k));
    if (CHARACTER_SLOTS.some(k => keys.has(k)) || keys.has('character'))
        return 'character';
    if (PATTERN_SLOTS.some(k => keys.has(k)))
        return 'pattern';
    return 'color';
}
export function canonicalizeSlot(key: string): string {
    return THEME_SLOT_ALIASES[key] ?? key;
}
