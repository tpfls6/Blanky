import { packageFeatures } from '../../theme/package/features.ts';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { THEME_ASSET_KEYS, THEME_ICON_KEYS, type BlankyTheme, type ThemePackage } from '@blanky/types';
import { packageFromTheme, importThemePackage, exportThemePackage, downloadTheme } from '../../theme/package/ThemeLoader.ts';
import { validateAsset } from '../../theme/package/ThemeValidator.ts';
import { sanitizeCss } from '../../theme/package/ThemeSanitizer.ts';
import { hydrateThemePackage, readThemeStorage } from '../../services/themes/packageStorage.ts';
import { importInstalledTheme } from '../../services/themes/index.ts';
import { useSession } from '../../state/useSession.ts';
import { useTheme } from '../../theme/context.ts';
import { ThemePreview } from './ThemePreview.tsx';
import { assetLabels } from '../../theme/package/features.ts';
export function ThemeExportButton({ theme }: {
    theme: BlankyTheme;
}) { const [error, setError] = useState(''); const [busy, setBusy] = useState(false); return <><button className="btn btn-line" disabled={busy} onClick={async () => { setBusy(true); try {
    const pkg = packageFromTheme(theme);
    if (!Object.keys(pkg.files).length) downloadTheme(new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' }), theme.name, '.json');
    else downloadTheme(await exportThemePackage(pkg, readThemeStorage), theme.name, '.zip');
    setError('');
}
catch (e) {
    setError(e instanceof Error ? e.message : '내보내기에 실패했습니다.');
}
finally {
    setBusy(false);
} }}>테마 파일로 내보내기</button>{error && <p role="alert">{error}</p>}</>; }
export function PackageEditor({ draft, setDraft }: {
    draft: BlankyTheme;
    setDraft: Dispatch<SetStateAction<BlankyTheme>>;
}) {
    const [mode, setMode] = useState('basic');
    const [message, setMessage] = useState('');
    useEffect(() => {
        const source = draft.package;
        if (!source || !Object.values(source.files).some(file => file.storagePath && !file.data)) return;
        let alive = true;
        void hydrateThemePackage(source).then(hydrated => {
            if (alive) setDraft(current => current.package === source ? { ...current, package: hydrated } : current);
        }).catch(() => { if (alive) setMessage('이미지 썸네일을 불러오지 못했습니다. 다시 시도해 주세요.'); });
        return () => { alive = false; };
    }, [draft.package, setDraft]);
    const pkg = draft.package ?? packageFromTheme(draft);
    const update = (fn: (p: ThemePackage) => ThemePackage) => setDraft(t => ({ ...t, themeType: 'package', package: fn(t.package ?? packageFromTheme(t)) }));
    const upload = async (file: File, group: 'assets' | 'iconPack' | 'fonts' | 'previews', name: string) => { try {
        if (file.size > 5 * 1024 * 1024)
            throw new Error('파일은 최대 5MB입니다.');
        const ext = file.name.split('.').at(-1)?.toLowerCase();
        const p = (group === 'previews' ? 'preview/' : 'assets/') + name + '-' + crypto.randomUUID() + '.' + ext;
        const f = validateAsset(p, new Uint8Array(await file.arrayBuffer()), group === 'iconPack');
        if (group === 'fonts' && f.mime !== 'font/woff2')
            throw new Error('폰트는 WOFF2만 지원합니다.');
        if (group === 'assets' && name === 'checkbox' && f.mime !== 'image/svg+xml')
            throw new Error('체크박스는 SVG만 지원합니다.');
        if (group === 'assets' && !f.mime.startsWith('image/'))
            throw new Error('이미지 파일을 선택해 주세요.');
        update(current => { const next = structuredClone(current); next.files[p] = f; if (group === 'previews')
            next.manifest.previews = [p];
        else if (group === 'fonts')
            next.manifest.fonts = { ...next.manifest.fonts, [name]: p };
        else
            next.manifest[group] = { ...next.manifest[group], [name]: p }; if (group === 'assets') next.manifest.imageSettings = { ...next.manifest.imageSettings, [name]: { size: 100, x: 50, y: 50, opacity: 100, fit: name === 'character' ? 'contain' : 'cover', fileName: file.name } }; const used = new Set([...Object.values(next.manifest.assets), ...Object.values(next.manifest.iconPack), ...Object.values(next.manifest.fonts ?? {}), ...next.manifest.previews]); next.files = Object.fromEntries(Object.entries(next.files).filter(([k]) => used.has(k))); return next; });
        setMessage('업로드한 파일을 미리보기에 반영했습니다.');
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : '업로드에 실패했습니다.');
    } };
    const renderAsset = (k: typeof THEME_ASSET_KEYS[number]) => { const path = pkg.manifest.assets[k]; const file = pkg.files[path]; const settings = pkg.manifest.imageSettings?.[k] ?? { size:100, x:50, y:50, opacity:100, fit:'cover' as const }; return <div key={k} className="theme-upload-item"><div className="theme-upload-row"><div className="theme-upload-thumb">{file?.data ? <img src={'data:' + file.mime + ';base64,' + file.data} alt=""/> : <span aria-hidden="true">▧</span>}</div><div className="min-w-0"><strong>{assetLabels[k]}</strong><p className="text-xs text-neutral-500 truncate">{settings.fileName ?? path?.split('/').at(-1) ?? 'PNG · JPG · WebP / 최대 5MB'}</p><p className="text-xs text-neutral-500">{k === 'character' ? '투명 이미지를 콘텐츠 아래에 배치합니다.' : '이미지로 나만의 공간을 꾸며 보세요.'}</p></div><div className="flex gap-1"><label className="btn btn-line theme-file-button">{path ? '변경' : '업로드'}<input aria-label={assetLabels[k] + ' 업로드'} type="file" accept={k === 'checkbox' ? '.svg' : '.png,.jpg,.jpeg,.webp,.svg'} onChange={e => { const f=e.target.files?.[0]; if(f) void upload(f,'assets',k); e.target.value=''; }}/></label>{path && <button className="btn btn-ghost" onClick={() => update(p => { const next=structuredClone(p); delete next.manifest.assets[k]; delete next.manifest.imageSettings?.[k]; const used = new Set([...Object.values(next.manifest.assets), ...Object.values(next.manifest.iconPack), ...Object.values(next.manifest.fonts ?? {}), ...next.manifest.previews]); if (!used.has(path)) delete next.files[path]; return next; })}> 삭제</button>}</div></div>{path && <details className="theme-image-options"><summary>크기 · 위치 · 투명도 설정</summary><div className="grid grid-cols-2 gap-3 mt-3">{(['size','x','y','opacity'] as const).map(field => <label key={field}>{({size:'크기',x:'가로 정렬',y:'세로 정렬',opacity:'불투명도'})[field]} · {settings[field]}%<input type="range" aria-label={assetLabels[k] + ' ' + field} min={field === 'size' ? 10 : 0} max={field === 'size' ? 200 : 100} value={settings[field]} onChange={e => {const value=Number(e.target.value); update(p => ({...p,manifest:{...p.manifest,imageSettings:{...p.manifest.imageSettings,[k]:{...settings,[field]:value}}}}));}}/></label>)}<label>표시 방식<select className="field" value={settings.fit} onChange={e => { const fit=e.target.value as typeof settings.fit; update(p => ({...p,manifest:{...p.manifest,imageSettings:{...p.manifest.imageSettings,[k]:{...settings,fit}}}})); }}><option value="cover">채우기</option><option value="contain">전체 보기</option><option value="repeat">반복</option></select></label></div></details>}</div>; };
    return <div className="space-y-4"><div className="flex gap-2"><button className="btn btn-line" aria-pressed={mode === 'basic'} onClick={() => setMode('basic')}>기본 편집</button><button className="btn btn-line" aria-pressed={mode === 'advanced'} onClick={() => setMode('advanced')}>고급 편집</button></div>{mode === 'basic' ? <><details open><summary>배경 · 일정 · 캘린더 · 할 일 이미지</summary><div className="theme-upload-grid">{THEME_ASSET_KEYS.filter(k => ['background','sidebar','cardBackground','calendarBackground','character'].includes(k)).map(renderAsset)}<details><summary>더 많은 이미지 설정</summary>{THEME_ASSET_KEYS.filter(k => !['background','sidebar','cardBackground','calendarBackground','character'].includes(k)).map(renderAsset)}</details></div></details><details><summary>커스텀 아이콘 · SVG / PNG / JPG / WebP</summary><div className="theme-upload-grid">{THEME_ICON_KEYS.map(k => { const path=pkg.manifest.iconPack[k]; const file=path ? pkg.files[path] : undefined; return <div key={k} className="theme-upload-item theme-upload-row"><div className="theme-upload-thumb">{file?.data ? <img src={'data:' + file.mime + ';base64,' + file.data} alt=""/> : <span aria-hidden="true">▧</span>}</div><div className="min-w-0"><strong>{k}</strong><p className="text-xs text-neutral-500 truncate">{path?.split('/').at(-1) ?? 'PNG · JPG · WebP · SVG'}</p></div><div className="flex gap-1"><label className="btn btn-line theme-file-button">{path ? '변경' : '업로드'}<input aria-label={k + ' 아이콘 업로드'} type="file" accept=".svg,.png,.jpg,.jpeg,.webp" onChange={e => {const f=e.target.files?.[0]; if(f) void upload(f,'iconPack',k); e.target.value=''; }}/></label>{path && <button className="btn btn-ghost" onClick={() => update(p => {const next=structuredClone(p);delete next.manifest.iconPack[k];return next;})}>삭제</button>}</div></div>; })}</div></details><details><summary>폰트 · WOFF2 / 미리보기 이미지</summary>{['body', 'heading'].map(k => <label key={k} className="block">{k === 'body' ? '본문 폰트' : '제목 폰트'}<input type="file" accept=".woff2" onChange={e => { const f = e.target.files?.[0]; if (f)
        void upload(f, 'fonts', k); }}/></label>)}<label>패키지 미리보기 이미지<input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={e => { const f = e.target.files?.[0]; if (f)
        void upload(f, 'previews', 'preview'); }}/></label></details></> : <div><label className="block">고급 CSS<textarea aria-label="고급 CSS" className="field theme-css-editor" value={draft.package?.customCss ?? ''} placeholder={'[data-theme-slot="schedule-card"] { border-radius: 20px; backdrop-filter: blur(12px); }'} onChange={e => { const css = e.target.value; update(p => ({ ...p, customCss: css })); try {
        sanitizeCss(css, pkg.manifest.assets);
        setMessage('CSS 검증을 통과했습니다.');
    }
    catch (error) {
        setMessage(error instanceof Error ? error.message : 'CSS를 확인해 주세요.');
    } }}/></label><p className="text-xs">Theme Slot 선택자와 허용된 속성만 사용할 수 있습니다. 이미지 참조: url("asset://background"). 외부 URL, JavaScript, 숨김, 위치 지정은 지원하지 않습니다.</p></div>}<label className="block">테마 버전<input aria-label="패키지 버전" className="field ml-2" value={draft.package?.manifest.version ?? '1.0.0'} onChange={e => update(p => ({ ...p, manifest: { ...p.manifest, version: e.target.value } }))}/></label><p role="status">{message}</p></div>;
}
export function ThemeImport({ onPreview }: { onPreview?: (theme: BlankyTheme | null) => void } = {}) {
    const ctx = useTheme();
    const { user } = useSession();
    const [pending, setPending] = useState<BlankyTheme | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    return <div data-theme-protected><label className="btn btn-line theme-import-label">테마 가져오기<input aria-label="테마 가져오기" type="file" accept=".blanky-theme,.zip,.json" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file || !user)
        return; setBusy(true); setPending(null); onPreview?.(null); setMessage('패키지를 검사하는 중…'); try {
        if (!/\.(blanky-theme|zip|json)$/i.test(file.name))
            throw new Error('JSON 또는 ZIP 테마 파일을 선택해 주세요.');
        const p = await importThemePackage(file);
        const imported: BlankyTheme = { id: crypto.randomUUID(), creatorId: user.id, creatorName: p.manifest.author, name: p.manifest.name, description: p.manifest.description, thumbnailUrl: '', category: '가져온 테마', tags: [], visibility: 'private', pricingType: 'free', price: 0, config: p.config, themeType: 'package', package: p, downloadCount: 0, ratingAverage: 0, ratingCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        setPending(imported);
        onPreview?.(imported);
        setMessage('검사를 통과했습니다. 설치 전 미리보기를 확인해 주세요.');
    }
    catch (error) {
        setMessage(error instanceof Error ? error.message : '테마 가져오기에 실패했습니다.');
    }
    finally {
        setBusy(false);
    } }}/></label><p role="status">{message}</p>{pending && <section className="theme-import-review" aria-label="테마 설치 전 확인"><h2>{pending.name}</h2><p>제작자: {pending.package!.manifest.author} · 버전: {pending.package!.manifest.version}</p><p className="my-3">포함 요소: {packageFeatures(pending).join(' · ')}</p>{!onPreview && <ThemePreview theme={pending}/>}<div className="my-3 flex gap-2">{!onPreview && <button className="btn btn-line" onClick={() => ctx.startPreview(pending)}>내 일정으로 미리보기</button>}<button className="btn btn-primary" disabled={busy} onClick={async () => { if (!user)
        return; setBusy(true); try {
        await importInstalledTheme(user.id, pending);
        await ctx.refresh();
        ctx.endPreview();
        setPending(null); onPreview?.(null);
        setMessage('설치했습니다. 내 테마에서 적용할 수 있습니다.');
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : '설치에 실패했습니다.');
    }
    finally {
        setBusy(false);
    } }}>설치</button><button className="btn btn-line" onClick={() => { if (ctx.preview?.id === pending.id)
        ctx.endPreview(); setPending(null); onPreview?.(null); setMessage(''); }}>취소</button></div></section>}</div>;
}
