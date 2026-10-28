import { useEffect, useRef, useState } from 'react';

const PALETTE = ['#ffffff', '#f5f5f5', '#222222', '#737373', '#f6d365', '#fda085', '#f9b4c7', '#b7d8c7', '#b8c9ef', '#c9b8e8'];

function rgbOf(hex: string) {
    const n = /^#([\da-f]{6})/i.exec(hex)?.[1];
    return n ? { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) } : { r: 0, g: 0, b: 0 };
}
function hexOf(r: number, g: number, b: number) {
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const [hex, setHex] = useState(value);
    const box = useRef<HTMLDetailsElement>(null);
    const rgb = rgbOf(value);
    useEffect(() => {
        const close = (event: PointerEvent) => {
            if (box.current?.open && !box.current.contains(event.target as Node)) box.current.open = false;
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, []);
    const paint = (next: string) => { onChange(next); setHex(next); };
    const slide = (channel: 'r' | 'g' | 'b', n: number) => paint(hexOf(channel === 'r' ? n : rgb.r, channel === 'g' ? n : rgb.g, channel === 'b' ? n : rgb.b));
    return <details ref={box} className="color-choice"><summary><span className="color-circle" style={{ background: value }} /><span>{label}<small>{value.toUpperCase()}</small></span></summary><div className="color-popover"><input aria-label={label + ' 색상 선택'} type="color" value={value.slice(0, 7)} onChange={e => paint(e.target.value)} /><div className="color-rgb">{(['r', 'g', 'b'] as const).map(channel => <label key={channel}>{channel.toUpperCase()}<input type="range" min={0} max={255} value={rgb[channel]} aria-label={label + ' ' + channel.toUpperCase()} onChange={e => slide(channel, Number(e.target.value))} /><span>{rgb[channel]}</span></label>)}</div><div className="color-palette">{PALETTE.map(color => <button key={color} type="button" aria-label={label + ' ' + color} className="color-circle" style={{ background: color }} onClick={() => paint(color)} />)}</div><label>HEX<input className="field" aria-label={label + ' HEX'} key={value} defaultValue={value} onChange={e => { setHex(e.target.value); if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(e.target.value)) onChange(e.target.value); }} aria-invalid={!/^#[\da-f]{6}([\da-f]{2})?$/i.test(hex)} /></label></div></details>;
}
