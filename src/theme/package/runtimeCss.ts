import type { BlankyTheme } from '../../../packages/types/src/theme.ts';
import type { ResolvedAssets } from './ThemeAssetResolver.ts';
import { validateCss } from './ThemeSanitizer.ts';
export function runtimeCss(scope: string, theme: BlankyTheme, resolved: ResolvedAssets): string {
    const root = '[data-theme-scope="' + scope + '"]';
    const selector = (slot: string) => ':is(' + root + '[data-theme-slot="' + slot + '"],' + root + ' [data-theme-slot="' + slot + '"])' + ':not(' + root + ' [data-theme-scope] *):not(' + root + ' [data-theme-scope]):not([data-theme-protected]):not(' + root + ' [data-theme-protected] *)';
    const rules: string[] = [];
    const url = (u: string) => 'url("' + u + '")';
    const slots: Record<string, string> = { background: 'app', sidebar: 'sidebar', pageBackground: 'page', calendarBackground: 'calendar', scheduleBackground: 'schedule-card', taskBackground: 'task-card', checkbox: 'task-checkbox', buttonBackground: 'button', diaryBackground: 'diary-page', pattern: 'app', cardBackground: 'card' };
    for (const [key, u] of Object.entries(resolved.assets)) {
        const slot = slots[key];
        const settings = theme.package?.manifest.imageSettings?.[key];
        if (slot && settings) {
            const group: Record<string, string> = { app: 'colors', page: 'colors', sidebar: 'sidebar', calendar: 'calendar', 'schedule-card': 'schedule', 'task-card': 'task', card: 'card' };
            const overlay = 'color-mix(in srgb,var(--blanky-' + (group[slot] ?? 'colors') + '-background) ' + (100-settings.opacity) + '%,transparent)';
            rules.push(selector(slot) + '{background-image:linear-gradient(' + overlay + ',' + overlay + '),' + url(u) + ';background-size:' + (settings.size === 100 && settings.fit !== 'repeat' ? settings.fit : settings.size + '% auto') + ';background-position:' + settings.x + '% ' + settings.y + '%;background-repeat:' + (settings.fit === 'repeat' ? 'repeat' : 'no-repeat') + ';}');
        } else if (slot)
            rules.push(selector(slot) + '{background-image:' + url(u) + ';background-size:' + (key === 'pattern' ? '64px 64px' : 'cover') + ';background-position:center;}');
    }
    if (resolved.assets.character) {
        const s = theme.package?.manifest.imageSettings?.character;
        rules.push(root + '::after{content:"";display:block;grid-column:1/-1;pointer-events:none;height:clamp(30px,' + 15 * (s?.size ?? 100)/100 + 'vw,' + 140 * (s?.size ?? 100)/100 + 'px);background-image:' + url(resolved.assets.character) + ';background-repeat:' + (s?.fit === 'repeat' ? 'repeat' : 'no-repeat') + ';background-size:' + (s?.fit === 'repeat' ? '64px 64px' : s?.fit ?? 'contain') + ';background-position:' + (s?.x ?? 100) + '% ' + (s?.y ?? 100) + '%;opacity:' + (s?.opacity ?? 100)/100 + ';width:' + Math.min(s?.size ?? 100,100) + '%;justify-self:end;}');
    }
    if (resolved.assets.buttonBackground)
        for (const slot of ['button-primary', 'button-secondary'])
            rules.push(selector(slot) + '{background-image:' + url(resolved.assets.buttonBackground) + ';background-size:cover;}');
    if (resolved.assets.checkbox)
        rules.push(selector('task-checkbox') + '{border:0;background-size:contain;background-repeat:no-repeat;}');
    if (resolved.assets.emptyState)
        rules.push(selector('empty-state') + '{background-image:' + url(resolved.assets.emptyState) + ';background-size:contain;background-position:center;background-repeat:no-repeat;min-height:120px;}');
    if (theme.package)
        for (const r of validateCss(theme.package.customCss, theme.package.manifest.assets))
            rules.push(selector(r.slot) + '{' + r.declarations.map(([p, v]) => p + ':' + (p === 'font-family' && /^blanky-(body|heading)$/.test(v) ? '"blanky-' + scope + '-' + v.slice(7) + '"' : v).replace(/url\("asset:\/\/([a-zA-Z][a-zA-Z0-9_-]*)"\)/g, (_, k: string) => url(resolved.assets[k])) + ';').join('') + '}');
    for (const [name, u] of Object.entries(resolved.fonts)) {
        const family = 'blanky-' + scope + '-' + name;
        rules.unshift('@font-face{font-family:"' + family + '";src:' + url(u) + ' format("woff2");font-display:swap;}');
        rules.push(root + (name === 'heading' ? ' :is(h1,h2,h3):not('+root+' [data-theme-scope] *):not('+root+' [data-theme-protected] *)' : '') + '{font-family:"' + family + '",system-ui,sans-serif;}');
    }
    return rules.join('\n');
}
