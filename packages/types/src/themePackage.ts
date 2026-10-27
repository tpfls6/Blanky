import type { ThemeConfig } from './theme.ts';
import type { ThemeKind } from './themeSlots.ts';
export const THEME_FORMAT_VERSION = 1;
export const THEME_PACKAGE_EXTENSION = '.blankytheme';
export const THEME_PACKAGE_IMPORT_EXTS = ['.blankytheme', '.blanky-theme', '.zip', '.json'] as const;
export const THEME_ASSET_KEYS = ['wallpaper', 'background', 'sidebar', 'pageBackground', 'calendarBackground', 'scheduleBackground', 'taskBackground', 'checkbox', 'buttonBackground', 'emptyState', 'diaryBackground', 'pattern', 'cardBackground', 'character', 'sidebarTop', 'sidebarBottom', 'pageHeader', 'cardCorner'] as const;
export const THEME_ICON_KEYS = ['home', 'today', 'calendar', 'task', 'diary', 'memo', 'store', 'custom', 'settings', 'search', 'add', 'favorite', 'delete', 'edit'] as const;
export const THEME_SLOTS = ['app', 'sidebar', 'sidebar-item', 'sidebar-icon', 'page', 'page-header', 'calendar', 'calendar-header', 'calendar-day', 'calendar-today', 'calendar-selected', 'schedule-card', 'schedule-time', 'schedule-title', 'task-card', 'task-checkbox', 'diary-page', 'diary-list', 'diary-entry', 'card', 'button', 'button-primary', 'button-secondary', 'input', 'modal', 'empty-state', 'reading-page', 'reading-sidebar', 'reading-shelf', 'reading-book-grid', 'reading-book-card', 'reading-book-cover', 'reading-detail', 'reading-highlight', 'reading-note'] as const;
export type ThemeIconKey = typeof THEME_ICON_KEYS[number];
export interface ThemeManifest {
    formatVersion: 1;
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    entry: {
        theme: string;
        stylesheet?: string;
    };
    assets: Record<string, string>;
    iconPack: Partial<Record<ThemeIconKey, string>>;
    previews: string[];
    kind?: ThemeKind;
    imageSettings?: Record<string, { size: number; x: number; y: number; opacity: number; fit: 'cover' | 'contain' | 'repeat'; fileName?: string; visible?: boolean }>;
    fonts?: {
        body?: string;
        heading?: string;
    };
}
export interface ThemeFile {
    mime: string;
    data?: string;
    storagePath?: string;
}
export interface ThemePackage {
    manifest: ThemeManifest;
    config: ThemeConfig;
    customCss: string;
    files: Record<string, ThemeFile>;
}
