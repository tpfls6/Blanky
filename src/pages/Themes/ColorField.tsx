import { useEffect, useRef, useState, type PointerEvent as ReactPointer } from 'react';

const PALETTE = ['#ffffff', '#f5f5f5', '#222222', '#737373', '#f6d365', '#fda085', '#f9b4c7', '#b7d8c7', '#b8c9ef', '#c9b8e8'];

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

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const [hex, setHex] = useState(value);
    const box = useRef<HTMLDetailsElement>(null);
    const hue = useRef(0);
    const rgb = rgbOf(value);
    const hsv = hsvOf(rgb.r, rgb.g, rgb.b, hue.current);
    hue.current = hsv.h;
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (box.current?.open && !box.current.contains(event.target as Node)) box.current.open = false;
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, []);
    const paint = (next: string) => { onChange(next); setHex(next); };
    const setHsv = (h: number, s: number, v: number) => { hue.current = h; paint(hsvHex(h, s, v)); };
    const channel = (key: 'r' | 'g' | 'b', n: number) => paint(hexOf(key === 'r' ? n : rgb.r, key === 'g' ? n : rgb.g, key === 'b' ? n : rgb.b));
    return (
        <details ref={box} className="color-choice">
            <summary><span className="color-circle" style={{ background: value }} /><span>{label}<small>{value.toUpperCase()}</small></span></summary>
            <div className="color-popover">
                <div className="color-sv" role="slider" aria-label={label + ' 채도 명도'} style={{ background: `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${hsv.h} 100% 50%))` }} onPointerDown={event => { event.preventDefault(); drag(event.currentTarget, event, (x, y, rect) => setHsv(hsv.h, clamp((x - rect.left) / rect.width), clamp(1 - (y - rect.top) / rect.height))); }}>
                    <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
                </div>
                <div className="color-hue" role="slider" aria-label={label + ' 색조'} onPointerDown={event => { event.preventDefault(); drag(event.currentTarget, event, (x, _y, rect) => setHsv(clamp((x - rect.left) / rect.width) * 360, hsv.s, hsv.v)); }}>
                    <i style={{ left: `${hsv.h / 360 * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
                </div>
                <div className="color-rgb">{(['r', 'g', 'b'] as const).map(key => (
                    <label key={key}>{key.toUpperCase()}<input inputMode="numeric" aria-label={label + ' ' + key.toUpperCase()} value={rgb[key]} onChange={event => channel(key, clamp(Number(event.target.value) || 0, 255))} /></label>
                ))}</div>
                <div className="color-palette">{PALETTE.map(color => <button key={color} type="button" aria-label={label + ' ' + color} className="color-circle" style={{ background: color }} onClick={() => paint(color)} />)}</div>
                <label>HEX<input className="field" aria-label={label + ' HEX'} key={value} defaultValue={value} onChange={e => { setHex(e.target.value); if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(e.target.value)) onChange(e.target.value); }} aria-invalid={!/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)} /></label>
            </div>
        </details>
    );
}
