import { useState, type Dispatch, type SetStateAction } from 'react';
import { THEME_SLOT_ALIASES, THEME_SLOT_SPECS, slotsForKind, type BlankyTheme, type ThemeDecorationSlot, type ThemeKind, type ThemePackage } from '@blanky/types';
import { packageFromTheme } from '../../theme/package/ThemeLoader.ts';
import { validateAsset } from '../../theme/package/ThemeValidator.ts';
import { encoder } from '../../theme/package/limits.ts';
import { defaultImageSettings, themeAssetPath } from '../../theme/package/slots.ts';
import { PATTERN_PRESETS } from '../../theme/package/patternPresets.ts';
function sourceKey(assets: Record<string, string>, slot: ThemeDecorationSlot) {
    if (assets[slot])
        return slot;
    const alias = Object.entries(THEME_SLOT_ALIASES).find(([, value]) => value === slot)?.[0];
    return alias && assets[alias] ? alias : slot;
}
function updatePackage(setDraft: Dispatch<SetStateAction<BlankyTheme>>, fn: (pkg: ThemePackage) => ThemePackage) {
    setDraft(theme => ({ ...theme, themeType: 'package', package: fn(theme.package ?? packageFromTheme(theme)) }));
}
export function ThemeSlots({ draft, setDraft, kind }: {
    draft: BlankyTheme;
    setDraft: Dispatch<SetStateAction<BlankyTheme>>;
    kind: ThemeKind;
}) {
    const pkg = draft.package ?? packageFromTheme(draft);
    const slots = slotsForKind(kind);
    const [message, setMessage] = useState('');
    const upload = async (slot: ThemeDecorationSlot, file: File) => {
        if (file.size > 5 * 1024 * 1024)
            throw new Error('파일은 최대 5MB입니다.');
        const ext = file.name.split('.').at(-1)?.toLowerCase();
        const path = themeAssetPath('assets', slot, ext ?? 'png');
        const asset = validateAsset(path, new Uint8Array(await file.arrayBuffer()));
        if (!asset.mime.startsWith('image/'))
            throw new Error('이미지 파일을 선택해 주세요.');
        updatePackage(setDraft, current => {
            const next = structuredClone(current);
            const previous = sourceKey(next.manifest.assets, slot);
            const previousPath = next.manifest.assets[previous];
            delete next.manifest.assets[previous];
            if (previous !== slot)
                delete next.manifest.imageSettings?.[previous];
            next.files[path] = asset;
            next.manifest.assets[slot] = path;
            next.manifest.imageSettings = { ...next.manifest.imageSettings, [slot]: defaultImageSettings(slot, file.name) };
            const used = new Set([...Object.values(next.manifest.assets), ...Object.values(next.manifest.iconPack), ...Object.values(next.manifest.fonts ?? {}), ...next.manifest.previews]);
            if (previousPath && !used.has(previousPath))
                delete next.files[previousPath];
            next.files = Object.fromEntries(Object.entries(next.files).filter(([key]) => used.has(key) || key === path));
            return next;
        });
        setMessage('업로드한 파일을 미리보기에 반영했습니다.');
    };
    const applyPreset = (preset: (typeof PATTERN_PRESETS)[number]) => {
        const path = 'assets/patterns/pattern-' + preset.id + '.svg';
        const asset = validateAsset(path, encoder.encode(preset.svg));
        updatePackage(setDraft, current => {
            const next = structuredClone(current);
            const previous = next.manifest.assets.pattern;
            next.files[path] = asset;
            next.manifest.assets.pattern = path;
            next.manifest.imageSettings = { ...next.manifest.imageSettings, pattern: defaultImageSettings('pattern', preset.label + '.svg') };
            const used = new Set([...Object.values(next.manifest.assets), ...Object.values(next.manifest.iconPack), ...Object.values(next.manifest.fonts ?? {}), ...next.manifest.previews]);
            if (previous && !used.has(previous))
                delete next.files[previous];
            next.files = Object.fromEntries(Object.entries(next.files).filter(([key]) => used.has(key)));
            return next;
        });
        setMessage(preset.label + ' 패턴을 적용했습니다.');
    };
    return <div className="space-y-4">
        {message && <p role="status">{message}</p>}
        {kind !== 'color' && <div>
            <p className="mb-2 text-sm font-medium">패턴 프리셋</p>
            <div className="theme-preset-row">{PATTERN_PRESETS.map(preset => <button key={preset.id} type="button" className="btn btn-line" onClick={() => applyPreset(preset)}>{preset.label}</button>)}</div>
        </div>}
        {THEME_SLOT_SPECS.filter(spec => slots.includes(spec.key)).map(spec => {
            const key = sourceKey(pkg.manifest.assets, spec.key);
            const path = pkg.manifest.assets[key];
            const file = path ? pkg.files[path] : undefined;
            const settings = pkg.manifest.imageSettings?.[key] ?? defaultImageSettings(spec.key);
            return <div key={spec.key} className="theme-upload-item">
                <div className="theme-upload-row">
                    <div className="theme-upload-thumb">{file?.data ? <img src={'data:' + file.mime + ';base64,' + file.data} alt="" /> : <span aria-hidden="true">▧</span>}</div>
                    <div className="min-w-0">
                        <strong>{spec.label}</strong>
                        <p className="text-xs text-neutral-500">{spec.width}×{spec.height} · {spec.transparent ? '투명 배경 권장' : '불투명'} · {spec.accept.replaceAll('.', '').toUpperCase()} · 최대 {spec.maxKb >= 1024 ? spec.maxKb / 1024 + 'MB' : spec.maxKb + 'KB'}</p>
                        <p className="truncate text-xs text-neutral-500">{settings.fileName ?? path?.split('/').at(-1) ?? spec.placement}</p>
                    </div>
                    <div className="flex gap-1">
                        <label className="btn btn-line theme-file-button">{path ? '변경' : '업로드'}<input aria-label={spec.label + ' 업로드'} type="file" accept={spec.accept} onChange={event => { const chosen = event.target.files?.[0]; event.target.value = ''; if (!chosen) return; void upload(spec.key, chosen).catch(error => setMessage(error instanceof Error ? error.message : '업로드에 실패했습니다.')); }} /></label>
                        {path && <button type="button" className="btn btn-ghost" onClick={() => updatePackage(setDraft, current => {
                            const next = structuredClone(current);
                            const usedKey = sourceKey(next.manifest.assets, spec.key);
                            const usedPath = next.manifest.assets[usedKey];
                            delete next.manifest.assets[usedKey];
                            delete next.manifest.imageSettings?.[usedKey];
                            const used = new Set([...Object.values(next.manifest.assets), ...Object.values(next.manifest.iconPack), ...Object.values(next.manifest.fonts ?? {}), ...next.manifest.previews]);
                            if (usedPath && !used.has(usedPath))
                                delete next.files[usedPath];
                            return next;
                        })}>삭제</button>}
                    </div>
                </div>
                {path && <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs">표시<input type="checkbox" className="ml-2" checked={settings.visible !== false} onChange={event => { const visible = event.target.checked; updatePackage(setDraft, current => ({ ...current, manifest: { ...current.manifest, imageSettings: { ...current.manifest.imageSettings, [key]: { ...settings, visible } } } })); }} /></label>
                    {(['size', 'opacity'] as const).map(field => <label key={field} className="text-xs">{field === 'size' ? '크기' : '불투명도'} · {settings[field]}%<input type="range" min={field === 'size' ? 10 : 0} max={field === 'size' ? 200 : 100} value={settings[field]} onChange={event => updatePackage(setDraft, current => ({ ...current, manifest: { ...current.manifest, imageSettings: { ...current.manifest.imageSettings, [key]: { ...settings, [field]: Number(event.target.value) } } } }))} /></label>)}
                    {spec.key === 'pattern' && <label className="text-xs">반복<select className="field" value={settings.fit} onChange={event => updatePackage(setDraft, current => ({ ...current, manifest: { ...current.manifest, imageSettings: { ...current.manifest.imageSettings, [key]: { ...settings, fit: event.target.value as typeof settings.fit } } } }))}><option value="repeat">반복</option><option value="cover">채우기</option><option value="contain">맞춤</option></select></label>}
                    {spec.key === 'wallpaper' && <label className="text-xs">표시 방식<select className="field" value={settings.fit} onChange={event => updatePackage(setDraft, current => ({ ...current, manifest: { ...current.manifest, imageSettings: { ...current.manifest.imageSettings, [key]: { ...settings, fit: event.target.value as typeof settings.fit } } } }))}><option value="cover">채우기</option><option value="contain">맞춤</option><option value="repeat">반복</option></select></label>}
                </div>}
            </div>;
        })}
    </div>;
}
