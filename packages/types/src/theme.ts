import type { ThemePackage } from './themePackage.ts';
import { THEME_MODES, type ThemeMode } from './themeSlots.ts';
export const FONT_OPTIONS = ['system-ui', 'sans-serif', 'serif', 'monospace'] as const;
export interface ThemeConfig {
    mode: ThemeMode;
    colors: {
        background: string;
        surface: string;
        primary: string;
        accent: string;
        textPrimary: string;
        textSecondary: string;
        border: string;
    };
    calendar: {
        background: string;
        todayColor: string;
        selectedColor: string;
        weekdayColor: string;
        weekendColor: string;
        hoverColor: string;
    };
    schedule: {
        background: string;
        textColor: string;
        borderColor: string;
        borderRadius: number;
        opacity: number;
        shadow: string;
    };
    task: {
        background: string;
        checkboxColor: string;
        checkboxStyle: string;
        completedStyle: string;
        completedLineColor: string;
    };
    card: {
        background: string;
        borderColor: string;
        borderRadius: number;
        shadow: string;
        opacity: number;
    };
    sidebar: {
        background: string;
        selectedBackground: string;
        textColor: string;
        iconColor: string;
        hoverColor: string;
    };
    typography: {
        headingFont: string;
        bodyFont: string;
    };
    iconPack: string;
}
export interface BlankyTheme {
    id: string;
    creatorId: string | null;
    creatorName: string;
    name: string;
    description: string;
    thumbnailUrl: string;
    category: string;
    tags: string[];
    visibility: 'private' | 'public';
    pricingType: 'free' | 'paid';
    price: number;
    config: ThemeConfig;
    themeType?: 'basic' | 'package';
    package?: ThemePackage;
    packageUrl?: string;
    installedVersion?: string;
    downloadCount: number;
    ratingAverage: number;
    ratingCount: number;
    createdAt: string;
    updatedAt: string;
}
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
    mode: 'light',
    colors: { background: '#ffffff', surface: '#ffffff', primary: '#3a62b0', accent: '#c15e80', textPrimary: '#171717', textSecondary: '#737373', border: '#ebebeb' },
    calendar: { background: '#ffffff', todayColor: '#3a62b0', selectedColor: '#3a62b0', weekdayColor: '#171717', weekendColor: '#c15e80', hoverColor: '#f6f6f5' },
    schedule: { background: '#f1f4fb', textColor: '#171717', borderColor: '#ebebeb', borderRadius: 6, opacity: 1, shadow: 'none' },
    task: { background: '#ffffff', checkboxColor: '#3a62b0', checkboxStyle: 'square', completedStyle: 'strike', completedLineColor: '#737373' },
    card: { background: '#ffffff', borderColor: '#ebebeb', borderRadius: 8, shadow: 'none', opacity: 1 },
    sidebar: { background: '#ffffff', selectedBackground: '#f1f4fb', textColor: '#737373', iconColor: '#737373', hoverColor: '#f6f6f5' },
    typography: { headingFont: 'system-ui', bodyFont: 'system-ui' }, iconPack: 'default'
};
export function normalizeThemeConfig(value: unknown): ThemeConfig {
    const result = structuredClone(DEFAULT_THEME_CONFIG);
    if (!value || typeof value !== 'object')
        return result;
    for (const group of Object.keys(result) as (keyof ThemeConfig)[]) {
        const source = (value as Record<string, unknown>)[group];
        if (group === 'iconPack') {
            if (['default', 'rounded', 'outline', 'filled'].includes(String(source)))
                result.iconPack = String(source);
            continue;
        }
        if (group === 'mode') {
            if (THEME_MODES.includes(source as ThemeMode))
                result.mode = source as ThemeMode;
            continue;
        }
        if (!source || typeof source !== 'object')
            continue;
        const target = result[group] as unknown as Record<string, string | number>;
        for (const key of Object.keys(target)) {
            const v = (source as Record<string, unknown>)[key];
            if (typeof target[key] === 'number' && typeof v === 'number' && Number.isFinite(v))
                target[key] = key === 'opacity' ? Math.max(.3, Math.min(1, v)) : Math.max(0, Math.min(32, v));
            else if (typeof v === 'string') {
                if (typeof target[key] === 'string' && String(target[key]).startsWith('#') && /^#[0-9a-f]{6}$/i.test(v))
                    target[key] = v;
                else if (key === 'shadow' && ['none', '0 4px 16px #00000014', '0 8px 24px #00000028'].includes(v))
                    target[key] = v;
                else if (key.endsWith('Font') && FONT_OPTIONS.includes(v as typeof FONT_OPTIONS[number]))
                    target[key] = v;
                else if (key === 'checkboxStyle' && ['square', 'round', 'circle'].includes(v))
                    target[key] = v;
                else if (key === 'completedStyle' && ['strike', 'dim', 'plain'].includes(v))
                    target[key] = v;
            }
        }
    }
    return result;
}
export const BUILTIN_THEMES: BlankyTheme[] = ['Blanky Default', 'Soft Pink', 'Ocean Blue', 'Dark'].map((name, index) => {
    const config = structuredClone(DEFAULT_THEME_CONFIG);
    if (index === 1) {
        Object.assign(config.colors, { background: '#fff8fb', primary: '#c15e80', surface: '#fff4f8' });
        config.schedule.background = '#fce8f0';
        config.sidebar.selectedBackground = '#fce8f0';
    }
    if (index === 2) {
        Object.assign(config.colors, { background: '#f3faff', primary: '#167c9c', accent: '#36a5ad' });
        config.schedule.background = '#e2f3fa';
        config.sidebar.selectedBackground = '#e2f3fa';
    }
    if (index === 3) {
        Object.assign(config.colors, { background: '#141414', surface: '#1c1c1c', primary: '#8aabed', textPrimary: '#f5f5f5', textSecondary: '#a3a3a3', border: '#2e2e2e' });
        Object.assign(config.schedule, { background: '#24304a', textColor: '#f5f5f5', borderColor: '#2e2e2e' });
        config.calendar.background = '#1c1c1c';
        config.calendar.weekdayColor = '#f5f5f5';
        config.calendar.hoverColor = '#242424';
        config.task.background = '#1c1c1c';
        config.card.background = '#1c1c1c';
        config.card.borderColor = '#2e2e2e';
        Object.assign(config.sidebar, { background: '#1c1c1c', selectedBackground: '#24304a', textColor: '#a3a3a3', iconColor: '#a3a3a3', hoverColor: '#242424' });
        config.mode = 'dark';
    }
    config.calendar.todayColor = config.colors.primary;
    config.calendar.selectedColor = config.colors.primary;
    config.task.checkboxColor = config.colors.primary;
    return { id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), creatorId: null, creatorName: 'Blanky', name, description: 'Blanky 기본 제공 테마', thumbnailUrl: '', category: '기본', tags: [], visibility: 'public', pricingType: 'free', price: 0, config, downloadCount: 0, ratingAverage: 0, ratingCount: 0, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z' };
});
