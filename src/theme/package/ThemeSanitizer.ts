import { THEME_SLOTS } from '../../../packages/types/src/themePackage.ts';
import { LIMITS, encoder, packageError } from './limits.ts';
const svgTags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc']);
const svgAttrs = new Set(['xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'fx', 'fy', 'clip-path']);
// A deliberately small SVG dialect; unknown elements/attributes are rejected, never inserted as HTML.
export function sanitizeSvg(source: string): string {
    if (encoder.encode(source).length > LIMITS.icon)
        packageError('SVG는 500KB 이하만 지원합니다.');
    source = source.replace(/^\s*<\?xml[^?]*\?>/, '').trim();
    if ([...source].some(c => c.charCodeAt(0) < 9) || /<!|<\?|&/.test(source))
        packageError('SVG 선언, 엔티티, 주석은 지원하지 않습니다.');
    const stack: string[] = [];
    let root = false;
    let ended = false;
    let out = '';
    let cursor = 0;
    const tokens = source.match(/<[^>]*>|[^<]+/g) ?? [];
    for (const token of tokens) {
        cursor += token.length;
        if (!token.startsWith('<')) {
            if (token.trim() && !['title', 'desc'].includes(stack.at(-1) ?? ''))
                packageError('잘못된 SVG 텍스트입니다.');
            out += token;
            continue;
        }
        const close = token.match(/^<\/([a-zA-Z]+)\s*>$/);
        if (close) {
            if (stack.pop() !== close[1])
                packageError('SVG 태그가 올바르지 않습니다.');
            if (!stack.length)
                ended = true;
            out += token;
            continue;
        }
        const start = token.match(/^<([a-zA-Z]+)([\s\S]*?)(\/?)>$/);
        if (!start || !svgTags.has(start[1]) || ended)
            packageError('위험하거나 지원하지 않는 SVG 요소입니다.');
        if (!root) {
            if (start[1] !== 'svg')
                packageError('SVG 루트가 필요합니다.');
            root = true;
        }
        else if (start[1] === 'svg')
            packageError('중첩 SVG는 지원하지 않습니다.');
        let attrs = start[2];
        const seen = new Set<string>();
        let cleaned = '';
        while (attrs.trim()) {
            const attr = attrs.match(/^\s+([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(["'])([^"'<>]*)\2/);
            if (!attr)
                packageError('잘못된 SVG 속성입니다.');
            const [, name, , value] = attr;
            if (!svgAttrs.has(name) || seen.has(name) || (name !== 'xmlns' && /\\|javascript:|data:|https?:|url\((?!#[a-zA-Z0-9_-]+\))/i.test(value)))
                packageError('위험한 SVG 속성입니다.');
            if (name === 'xmlns' && value !== 'http://www.w3.org/2000/svg')
                packageError('SVG namespace가 올바르지 않습니다.');
            if (/url\(/i.test(value) && !/^url\(#[a-zA-Z0-9_-]+\)$/.test(value))
                packageError('SVG 외부 참조는 허용되지 않습니다.');
            seen.add(name);
            cleaned += ' ' + name + '="' + value + '"';
            attrs = attrs.slice(attr[0].length);
        }
        out += '<' + start[1] + cleaned + (start[3] ? '/' : '') + '>';
        if (!start[3])
            stack.push(start[1]);
        else if (start[1] === 'svg')
            ended = true;
    }
    if (!root || stack.length || cursor !== source.length)
        packageError('손상된 SVG입니다.');
    return out;
}
const properties = new Set(['background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'color', 'border', 'border-color', 'border-width', 'border-style', 'border-radius', 'box-shadow', 'opacity', 'font-family', 'font-size', 'font-weight', 'line-height', 'padding', 'margin', 'transform', 'filter', 'backdrop-filter']);
function validValue(property: string, value: string): boolean {
    if (/[\\<>@!]|(?:expression|var|attr|image-set|paint|env)\s*\(|javascript:|data:|https?:|\/\*/i.test(value))
        return false;
    if (property === 'color' && value === 'transparent')
        return false;
    const color = '(?:#[0-9a-fA-F]{3,8}|transparent|currentColor)';
    if (['color', 'background-color', 'border-color'].includes(property))
        return new RegExp('^' + color + '$').test(value);
    if (property === 'background-image')
        return /^(none|url\("asset:\/\/[a-zA-Z][a-zA-Z0-9_-]*"\))$/.test(value);
    if (property === 'background')
        return new RegExp('^' + color + '$').test(value) || validValue('background-image', value);
    if (['padding', 'margin', 'border-radius', 'border-width'].includes(property)) {
        const max = property === 'border-width' ? 4 : 32;
        return value.split(/\s+/).length <= 4 && value.split(/\s+/).every(v => /^(0|\d+(?:\.\d+)?px)$/.test(v) && parseFloat(v) <= max);
    }
    if (property === 'opacity')
        return /^0?\.\d+$|^1$/.test(value) && Number(value) >= .65 && Number(value) <= 1;
    if (property === 'font-size')
        return /^\d+(?:\.\d+)?px$/.test(value) && parseFloat(value) >= 12 && parseFloat(value) <= 32;
    if (property === 'line-height')
        return /^\d+(?:\.\d+)?$/.test(value) && Number(value) >= 1 && Number(value) <= 2;
    if (property === 'font-weight')
        return /^(normal|bold|[4-8]00)$/.test(value);
    if (property === 'font-family')
        return /^(system-ui|sans-serif|serif|monospace|blanky-body|blanky-heading)$/.test(value);
    if (property === 'border-style')
        return /^(solid|dashed|dotted|double)$/.test(value);
    if (property === 'border')
        return new RegExp('^[0-4]px (solid|dashed|dotted|double) ' + color + '$').test(value);
    if (property === 'background-size')
        return /^(cover|contain|auto|[1-9]\d?px(?: [1-9]\d?px)?)$/.test(value);
    if (property === 'background-position')
        return /^(center|top|bottom|left|right)( (center|top|bottom|left|right))?$/.test(value);
    if (property === 'background-repeat')
        return /^(repeat|no-repeat|repeat-x|repeat-y)$/.test(value);
    if (property === 'filter')
        return value === 'none';
    if (property === 'backdrop-filter')
        return /^(none|blur\(([0-9]|1[0-2])px\))$/.test(value);
    if (property === 'transform')
        return /^(none|translateY\(-?[0-4]px\)|scale\((0\.9[5-9]|1|1\.0[0-5])\))$/.test(value);
    if (property === 'box-shadow')
        return value === 'none' || /^(?:inset )?(?:0|-?\d{1,2}px) (?:0|-?\d{1,2}px) \d{1,2}px(?: \d{1,2}px)? #[0-9a-fA-F]{6,8}$/.test(value);
    return false;
}
export interface CssRule {
    slot: string;
    declarations: [
        string,
        string
    ][];
}
export function validateCss(css: string, assets: Record<string, string>): CssRule[] {
    if (encoder.encode(css).length > LIMITS.css)
        packageError('Custom CSS는 100KB 이하만 지원합니다.');
    if (css.includes('/*') || css.includes('\\') || css.includes('@'))
        packageError('CSS 주석, escape, at-rule은 허용하지 않습니다.');
    const rules: CssRule[] = [];
    let rest = css.trim();
    while (rest) {
        const m = rest.match(/^\[data-theme-slot=["']([a-z-]+)["']\]\s*\{([^{}]*)\}/);
        if (!m || !THEME_SLOTS.includes(m[1] as typeof THEME_SLOTS[number]))
            packageError('CSS는 허용된 Theme Slot 선택자만 사용할 수 있습니다.');
        const declarations: [
            string,
            string
        ][] = [];
        for (const part of m[2].split(';').filter(p => p.trim())) {
            const i = part.indexOf(':');
            if (i < 0)
                packageError('잘못된 CSS 선언입니다.');
            const property = part.slice(0, i).trim().toLowerCase();
            let value = part.slice(i + 1).trim();
            value = value.replace(/url\(\s*['"]?(asset:\/\/[a-zA-Z][a-zA-Z0-9_-]*)['"]?\s*\)/g, 'url("$1")');
            if (!properties.has(property) || !validValue(property, value))
                packageError('허용되지 않은 CSS 속성 또는 값: ' + property);
            for (const a of value.matchAll(/asset:\/\/([a-zA-Z][a-zA-Z0-9_-]*)/g))
                if (!Object.hasOwn(assets, a[1]))
                    packageError('CSS asset을 찾을 수 없습니다: ' + a[1]);
            if (['app', 'page', 'sidebar', 'modal'].includes(m[1]) && (['filter', 'transform'].includes(property) && value !== 'none' || property === 'opacity' && value !== '1'))
                packageError('앱 구조와 복구 UI에 영향을 주는 효과는 허용되지 않습니다.');
            declarations.push([property, value]);
        }
        rules.push({ slot: m[1], declarations });
        rest = rest.slice(m[0].length).trim();
        if (rules.length > 128)
            packageError('CSS 규칙은 최대 128개입니다.');
    }
    return rules;
}
export function sanitizeCss(css: string, assets: Record<string, string>): string { return validateCss(css, assets).map(r => '[data-theme-slot="' + r.slot + '"] { ' + r.declarations.map(([p, v]) => p + ': ' + v + ';').join(' ') + ' }').join('\n'); }
