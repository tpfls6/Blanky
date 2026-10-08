import { createContext, useContext } from 'react';
import type { BlankyTheme } from '@blanky/types';
import type { ThemeLibrary } from '../services/themes/index.ts';
export interface ThemeState extends ThemeLibrary {
    loading: boolean;
    error: string;
    preview: BlankyTheme | null;
    refresh: () => Promise<void>;
    apply: (t: BlankyTheme) => Promise<void>;
    startPreview: (t: BlankyTheme) => void;
    endPreview: () => void;
}
export const ThemeContext = createContext<ThemeState | null>(null);
export function useTheme() { const v = useContext(ThemeContext); if (!v)
    throw new Error('ThemeProvider missing'); return v; }
