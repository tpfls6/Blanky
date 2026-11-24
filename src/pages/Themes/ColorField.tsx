import { useState, type PointerEvent as ReactPointer } from 'react';
import { useI18n } from '../../i18n/useI18n.ts';

// Eight suggestions per field: strong tones for accents and text, soft tones for backgrounds and cards.
const PALETTES = {
    strong: ['#2f5d86', '#3a62b0', '#0f766e', '#15803d', '#b0754b', '#d9466b', '#7c3aed', '#262626'],
    soft: ['#ffffff', '#f5f5f5', '#f4efe8', '#eef3f7', '#fdf2f4', '#f1f8f4', '#f3f0fb', '#1d1d1f'],
};

function rgbOf(hex: string) {
    const n = /^#([\da-f]{6})/i.exec(hex)?.[1];
    return n ? { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) } : { r: 0, g: 0, b: 0 };
}
function hexOf(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}
function hsvOf(r: number, g: number, b: number, fallbackH: number) {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
    const h = d ? (max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60 : fallbackH;
    return { h, s: max ? d / max : 0, v: max };
}
function hsvHex(h: number, s: number, v: number) {
    const f = (n: number) => {
        const k = (n + h / 60) % 6;
        return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    };
    return hexOf(Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255));
}
function clamp(n: number, max = 1) {
    return Math.min(max, Math.max(0, n));
}
function drag(el: HTMLElement, event: ReactPointer, move: (x: number, y: number, rect: DOMRect) => void) {
    const run = (x: number, y: number) => move(x, y, el.getBoundingClientRect());
    run(event.clientX, event.clientY);
    const onMove = (next: PointerEvent) => run(next.clientX, next.clientY);
    const stop = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
}

// The picker body shown in the color sheet: saturation/value box, hue bar, RGB fields, suggestions and HEX.
export function ColorPicker({ label, value, soft = false, onChange }: { label: string; value: string; soft?: boolean; onChange: (value: string) => void }) {
    const { t } = useI18n();
    const [hex, setHex] = useState(value);
    const [hue, setHue] = useState(0);
    const rgb = rgbOf(value);
    const hsv = hsvOf(rgb.r, rgb.g, rgb.b, hue);
    if (hsv.h !== hue) setHue(hsv.h);
    const paint = (next: string) => { onChange(next); setHex(next); };
    const setHsv = (h: number, s: number, v: number) => { setHue(h); paint(hsvHex(h, s, v)); };
    const channel = (key: 'r' | 'g' | 'b', n: number) => paint(hexOf(key === 'r' ? n : rgb.r, key === 'g' ? n : rgb.g, key === 'b' ? n : rgb.b));
    return (
        <div className="color-picker">
            <div className="color-sv" role="slider" aria-label={label + ' 채도 명도'} style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))` }} onPointerDown={event => { event.preventDefault(); drag(event.currentTarget, event, (x, y, rect) => setHsv(hsv.h, clamp((x - rect.left) / rect.width), clamp(1 - (y - rect.top) / rect.height))); }}>
                <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
            </div>
            <div className="color-hue" role="slider" aria-label={label + ' 색조'} onPointerDown={event => { event.preventDefault(); drag(event.currentTarget, event, (x, _y, rect) => setHsv(clamp((x - rect.left) / rect.width) * 360, hsv.s, hsv.v)); }}>
                <i style={{ left: `${hsv.h / 360 * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
            </div>
            <div className="color-rgb">{(['r', 'g', 'b'] as const).map(key => (
                <label key={key}>{key.toUpperCase()}<input inputMode="numeric" aria-label={label + ' ' + key.toUpperCase()} value={rgb[key]} onChange={event => channel(key, clamp(Number(event.target.value) || 0, 255))} /></label>
            ))}</div>
            <p className="more-label">{t('themes.suggested')}</p>
            <div className="color-palette">{PALETTES[soft ? 'soft' : 'strong'].map(color => <button key={color} type="button" aria-label={label + ' ' + color} aria-pressed={value.toLowerCase() === color} className="color-swatch-btn" onClick={() => paint(color)}><span className="color-circle" style={{ background: color }} /></button>)}</div>
            <label className="color-hex"><span className="sr-only">HEX</span><input className="field" aria-label={label + ' HEX'} key={value} defaultValue={value} spellCheck={false} autoCapitalize="off" onChange={e => { setHex(e.target.value); if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(e.target.value)) onChange(e.target.value); }} aria-invalid={!/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)} /></label>
        </div>
    );
}
