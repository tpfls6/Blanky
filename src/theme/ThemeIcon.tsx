import { useState } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { useThemeIcon } from './package/runtimeContext.ts';
export function ThemeIcon({ name, fallback: Fallback, ...props }: {
    name: string;
    fallback: LucideIcon;
} & LucideProps) {
    const url = useThemeIcon(name === 'schedule' ? 'calendar' : name);
    const [failed, setFailed] = useState<string>();
    return url && failed !== url ? <img data-theme-slot="sidebar-icon" src={url} alt="" aria-hidden="true" className={props.className ?? 'size-4'} style={{ width: props.size ?? '1em', height: props.size ?? '1em', objectFit: 'contain', ...props.style }} onError={() => setFailed(url)}/> : <Fallback data-theme-slot="sidebar-icon" {...props}/>;
}
