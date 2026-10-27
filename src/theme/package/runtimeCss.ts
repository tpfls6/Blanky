import type { BlankyTheme } from '../../../packages/types/src/theme.ts';
import type { ResolvedAssets } from './ThemeAssetResolver.ts';
import { validateCss } from './ThemeSanitizer.ts';
import { assetVisible } from './slots.ts';
const FILL: Record<string, string> = {
    background: 'app',
    wallpaper: 'app',
    sidebar: 'sidebar',
    pageBackground: 'page',
    calendarBackground: 'calendar',
    scheduleBackground: 'schedule-card',
    taskBackground: 'task-card',
    checkbox: 'task-checkbox',
    buttonBackground: 'button',
    diaryBackground: 'diary-page',
    cardBackground: 'card',
};
const DECORATIONS: Record<string, { slot: string; extra?: string[]; pseudo: 'before' | 'after'; size: string; pos: string }> = {
    sidebarTop: { slot: 'sidebar', pseudo: 'before', size: 'min(100%, 208px) 72px', pos: 'center top' },
    sidebarBottom: { slot: 'sidebar', pseudo: 'after', size: 'min(100%, 208px) 96px', pos: 'center bottom' },
    pageHeader: { slot: 'page-header', extra: ['page'], pseudo: 'after', size: '160px 56px', pos: 'right center' },
    cardCorner: { slot: 'card', extra: ['schedule-card', 'task-card'], pseudo: 'after', size: '56px 56px', pos: 'right top' },
};
function overlay(slot: string, opacity: number) {
    const group: Record<string, string> = { app: 'colors', page: 'colors', sidebar: 'sidebar', calendar: 'calendar', 'schedule-card': 'schedule', 'task-card': 'task', card: 'card' };
    const mix = 'color-mix(in srgb,var(--blanky-' + (group[slot] ?? 'colors') + '-background) ' + (100 - opacity) + '%,transparent)';
    return 'linear-gradient(' + mix + ',' + mix + ')';
}
export function runtimeCss(scope: string, theme: BlankyTheme, resolved: ResolvedAssets): string {
    const root = '[data-theme-scope="' + scope + '"]';
    const selector = (slot: string) => ':is(' + root + '[data-theme-slot="' + slot + '"],' + root + ' [data-theme-slot="' + slot + '"])' + ':not(' + root + ' [data-theme-scope] *):not(' + root + ' [data-theme-scope]):not([data-theme-protected]):not(' + root + ' [data-theme-protected] *)';
    const rules: string[] = [];
    const url = (u: string) => 'url("' + u + '")';
    const settingsOf = (key: string) => theme.package?.manifest.imageSettings?.[key];
    const wallpaper = resolved.assets.wallpaper ?? resolved.assets.background;
    const wallpaperKey = resolved.assets.wallpaper ? 'wallpaper' : 'background';
    const pattern = resolved.assets.pattern;
    if ((wallpaper && assetVisible(settingsOf(wallpaperKey))) || (pattern && assetVisible(settingsOf('pattern')))) {
        const wall = settingsOf(wallpaperKey);
        const tile = settingsOf('pattern');
        const images: string[] = [];
        const sizes: string[] = [];
        const positions: string[] = [];
        const repeats: string[] = [];
        if (wallpaper && assetVisible(wall)) {
            if (wall) {
                images.push(overlay('app', wall.opacity));
                sizes.push('auto');
                positions.push('center');
                repeats.push('no-repeat');
            }
            images.push(url(wallpaper));
            sizes.push(wall?.size === 100 && wall.fit !== 'repeat' ? wall.fit : (wall?.size ?? 100) + '% auto');
            positions.push((wall?.x ?? 50) + '% ' + (wall?.y ?? 50) + '%');
            repeats.push(wall?.fit === 'repeat' ? 'repeat' : 'no-repeat');
        }
        if (pattern && assetVisible(tile)) {
            images.push(url(pattern));
            sizes.push((tile?.size ?? 24) + 'px ' + (tile?.size ?? 24) + 'px');
            positions.push((tile?.x ?? 0) + '% ' + (tile?.y ?? 0) + '%');
            repeats.push('repeat');
        }
        rules.push(selector('app') + '{background-image:' + images.join(',') + ';background-size:' + sizes.join(',') + ';background-position:' + positions.join(',') + ';background-repeat:' + repeats.join(',') + ';}');
    }
    for (const [key, u] of Object.entries(resolved.assets)) {
        if (key === 'wallpaper' || key === 'background' || key === 'pattern')
            continue;
        const settings = settingsOf(key);
        if (settings && !assetVisible(settings))
            continue;
        const slot = FILL[key];
        if (slot && settings)
            rules.push(selector(slot) + '{background-image:' + overlay(slot, settings.opacity) + ',' + url(u) + ';background-size:' + (settings.size === 100 && settings.fit !== 'repeat' ? settings.fit : settings.size + '% auto') + ';background-position:' + settings.x + '% ' + settings.y + '%;background-repeat:' + (settings.fit === 'repeat' ? 'repeat' : 'no-repeat') + ';}');
        else if (slot)
            rules.push(selector(slot) + '{background-image:' + url(u) + ';background-size:cover;background-position:center;}');
        const deco = DECORATIONS[key];
        if (deco) {
            const size = ((settings?.size ?? 100) / 100);
            const hosts = [deco.slot, ...(deco.extra ?? [])];
            for (const host of hosts) {
                rules.push(selector(host) + '{position:relative;}');
                rules.push(selector(host) + '::' + deco.pseudo + '{content:"";pointer-events:none;display:block;background-image:' + url(u) + ';background-repeat:no-repeat;background-size:contain;background-position:' + deco.pos + ';opacity:' + (settings?.opacity ?? 100) / 100 + ';width:' + deco.size.split(' ')[0] + ';height:calc(' + deco.size.split(' ')[1] + ' * ' + size + ');flex:0 0 auto;}');
                if (host !== 'sidebar')
                    rules.push(selector(host) + '::' + deco.pseudo + '{position:absolute;z-index:0;inset:auto;top:' + (deco.pos.includes('top') ? '0' : 'auto') + ';bottom:' + (deco.pos.includes('bottom') ? '0' : 'auto') + ';right:' + (deco.pos.includes('right') ? '0' : 'auto') + ';left:' + (deco.pos.includes('left') ? '0' : deco.pos.includes('right') ? 'auto' : '50%') + ';}');
            }
        }
    }
    if (resolved.assets.character && assetVisible(settingsOf('character'))) {
        const s = settingsOf('character');
        rules.push(root + '::after{content:"";display:block;grid-column:1/-1;pointer-events:none;height:clamp(30px,' + 15 * (s?.size ?? 100) / 100 + 'vw,' + 140 * (s?.size ?? 100) / 100 + 'px);background-image:' + url(resolved.assets.character) + ';background-repeat:' + (s?.fit === 'repeat' ? 'repeat' : 'no-repeat') + ';background-size:' + (s?.fit === 'repeat' ? '64px 64px' : s?.fit ?? 'contain') + ';background-position:' + (s?.x ?? 100) + '% ' + (s?.y ?? 100) + '%;opacity:' + (s?.opacity ?? 100) / 100 + ';width:' + Math.min(s?.size ?? 100, 100) + '%;justify-self:end;}');
    }
    if (resolved.assets.buttonBackground)
        for (const slot of ['button-primary', 'button-secondary'])
            rules.push(selector(slot) + '{background-image:' + url(resolved.assets.buttonBackground) + ';background-size:cover;}');
    if (resolved.assets.checkbox)
        rules.push(selector('task-checkbox') + '{border:0;background-size:contain;background-repeat:no-repeat;}');
    if (resolved.assets.emptyState && assetVisible(settingsOf('emptyState')))
        rules.push(selector('empty-state') + '{background-image:' + url(resolved.assets.emptyState) + ';background-size:contain;background-position:center;background-repeat:no-repeat;min-height:160px;padding-top:96px;}');
    if (theme.package)
        for (const r of validateCss(theme.package.customCss, theme.package.manifest.assets))
            rules.push(selector(r.slot) + '{' + r.declarations.map(([p, v]) => p + ':' + (p === 'font-family' && /^blanky-(body|heading)$/.test(v) ? '"blanky-' + scope + '-' + v.slice(7) + '"' : v).replace(/url\("asset:\/\/([a-zA-Z][a-zA-Z0-9_-]*)"\)/g, (_, k: string) => url(resolved.assets[k])) + ';').join('') + '}');
    for (const [name, u] of Object.entries(resolved.fonts)) {
        const family = 'blanky-' + scope + '-' + name;
        rules.unshift('@font-face{font-family:"' + family + '";src:' + url(u) + ' format("woff2");font-display:swap;}');
        rules.push(root + (name === 'heading' ? ' :is(h1,h2,h3):not(' + root + ' [data-theme-scope] *):not(' + root + ' [data-theme-protected] *)' : '') + '{font-family:"' + family + '",system-ui,sans-serif;}');
    }
    return rules.join('\n');
}
