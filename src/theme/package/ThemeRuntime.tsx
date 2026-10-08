import { useEffect, useId, useState, type ReactNode, type CSSProperties } from 'react';
import type { BlankyTheme } from '../../../packages/types/src/theme.ts';
import { BUILTIN_THEMES } from '../../../packages/types/src/theme.ts';
import { themeVariables } from '../variables.ts';
import { ThemeAssetsContext } from './runtimeContext.ts';
import { runtimeCss } from './runtimeCss.ts';
import { resolveThemeAssets, type ResolvedAssets } from './ThemeAssetResolver.ts';
import { hydrateThemePackage } from '../../services/themes/packageStorage.ts';
async function verifyImages(resolved: ResolvedAssets) {
    if (typeof Image === 'undefined')
        return;
    const urls = new Set([...Object.values(resolved.assets), ...Object.values(resolved.icons), ...resolved.previews]);
    for (const url of urls) {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 32 * 1024 * 1024)
            throw new Error('이미지 크기가 올바르지 않습니다.');
    }
}
export function ThemeRuntime({ theme, children, className = '', onError }: {
    theme?: BlankyTheme | null;
    children: ReactNode;
    className?: string;
    onError?: (message: string) => void;
}) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const [loaded, setLoaded] = useState<{
        theme: BlankyTheme;
        assets: ResolvedAssets;
        css: string;
    } | null>(null);
    const [failed, setFailed] = useState<BlankyTheme | null>(null);
    useEffect(() => {
        if (!theme?.package) {
            let alive = true;
            queueMicrotask(() => { if (alive) {
                setLoaded(null);
                setFailed(null);
            } });
            return () => { alive = false; };
        }
        let resolved: ResolvedAssets | undefined;
        let alive = true;
        void hydrateThemePackage({ ...theme.package, config: theme.config }).then(async (safe) => { if (!alive)
            return; resolved = resolveThemeAssets(safe); await verifyImages(resolved); if (!alive)
            return; const current = { ...theme, config: safe.config, package: safe }; const css = runtimeCss(id, current, resolved); setLoaded({ theme, assets: resolved, css }); }).catch(() => { resolved?.dispose(); if (alive) {
            setFailed(theme);
            onError?.('테마를 정상적으로 불러오지 못했습니다. 기본 테마로 복구했습니다.');
        } });
        return () => { alive = false; resolved?.dispose(); };
    }, [theme, id, onError]);
    const current = theme && failed === theme ? BUILTIN_THEMES[0] : theme;
    const ready = loaded?.theme === theme && failed !== theme;
    const style: CSSProperties | undefined = current ? themeVariables(current.config) : undefined;
    return <ThemeAssetsContext.Provider value={ready && loaded ? loaded.assets.icons : {}}><div className={(current ? 'blanky-themed ' : '') + className} data-theme-scope={id} data-theme-slot="app" data-icon-pack={current?.config.iconPack} style={style}>{ready && loaded && <style>{loaded.css}</style>}{children}</div></ThemeAssetsContext.Provider>;
}
