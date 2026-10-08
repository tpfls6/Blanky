import { useEffect, useState, type ReactNode } from 'react';
import { BUILTIN_THEMES, type BlankyTheme } from '@blanky/types';
import { useSession } from '../state/useSession.ts';
import { installTheme, importInstalledTheme, loadThemes, setActiveTheme, type ThemeLibrary } from '../services/themes/index.ts';
import { ThemeContext } from './context.ts';
import { ThemeRuntime } from './package/ThemeRuntime.tsx';
import { clearPackageDownloadCache } from '../services/themes/packageStorage.ts';
export function ThemeProvider({ children }: {
    children: ReactNode;
}) {
    const { user } = useSession();
    return <AccountThemeProvider key={user?.id ?? 'guest'} userId={user?.id ?? null}>{children}</AccountThemeProvider>;
}
function AccountThemeProvider({ children, userId }: {
    children: ReactNode;
    userId: string | null;
}) {
    const [state, setState] = useState<ThemeLibrary>({ themes: BUILTIN_THEMES, installed: [], active: null });
    const [preview, setPreview] = useState<BlankyTheme | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(Boolean(userId));
    const refresh = async () => {
        if (!userId)
            return;
        const next = await loadThemes(userId!);
        setState(next);
        setError('');
    };
    useEffect(() => {
        let alive = true;
        if (!userId)
            return;
        loadThemes(userId!).then(next => {
            if (alive) {
                setState(next);
                setError('');
            }
        }).catch(e => {
            if (alive)
                setError(e instanceof Error ? e.message : '테마를 불러오지 못했습니다.');
        }).finally(() => {
            if (alive)
                setLoading(false);
        });
        return () => { alive = false; clearPackageDownloadCache(); };
    }, [userId]);
    const apply = async (t: BlankyTheme) => {
        if (!userId)
            throw new Error('로그인이 필요합니다.');
        if (!state.themes.some(row => row.id === t.id) && t.creatorId === userId && t.package)
            await importInstalledTheme(userId, t);
        if (t.creatorId !== userId && t.creatorId !== null && !state.installed.includes(t.id)) {
            await installTheme(userId, t);
        }
        await setActiveTheme(userId, t.id);
        await refresh();
        setPreview(null);
    };
    const current = preview ?? state.themes.find(t => t.id === state.active);
    return <ThemeContext.Provider value={{ ...state, preview, loading, error, refresh, apply, startPreview: t => { setError(''); setPreview(t); }, endPreview: () => { setPreview(null); setError(''); } }}><ThemeRuntime theme={current} onError={setError}>{error && <p data-theme-protected role="alert" className="theme-runtime-error">{error}</p>}{children}</ThemeRuntime></ThemeContext.Provider>;
}
