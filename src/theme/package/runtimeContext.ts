import { createContext, useContext } from 'react';
export const ThemeAssetsContext = createContext<Record<string, string>>({});
export function useThemeIcon(name: string) { return useContext(ThemeAssetsContext)[name]; }
