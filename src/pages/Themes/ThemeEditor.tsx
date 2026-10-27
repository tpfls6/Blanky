import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BUILTIN_THEMES, normalizeThemeConfig, type BlankyTheme, type ThemeConfig, type ThemeKind, type ThemeMode } from '@blanky/types';
import { useAction } from './useThemeAction.ts';
import { ColorField } from './ColorField.tsx';
import { ThemePreview } from './ThemePreview.tsx';
import { ThemeSlots } from './ThemeSlots.tsx';
import { PackageEditor, ThemeExportButton, ThemeImport } from './PackageControls.tsx';
import { useSession } from '../../state/useSession.ts';
import { useTheme } from '../../theme/context.ts';
import { saveTheme } from '../../services/themes/index.ts';
import { packageFromTheme } from '../../theme/package/ThemeLoader.ts';
import { prunePackageForKind, themeKindOf } from '../../theme/package/slots.ts';
const KINDS: { id: ThemeKind; title: string; body: string }[] = [
    { id: 'color', title: 'Color', body: '심플한 색상 테마' },
    { id: 'pattern', title: 'Pattern', body: '패턴과 배경으로 꾸미기' },
    { id: 'character', title: 'Character', body: '캐릭터와 장식으로 꾸미기' },
];
const COLOR_FIELDS: { group: 'colors' | 'sidebar'; key: string; label: string }[] = [
    { group: 'colors', key: 'primary', label: '메인 컬러' },
    { group: 'colors', key: 'background', label: '배경색' },
    { group: 'sidebar', key: 'background', label: '사이드바 색상' },
    { group: 'colors', key: 'surface', label: '카드 · 입력창' },
    { group: 'colors', key: 'textPrimary', label: '텍스트 색상' },
    { group: 'colors', key: 'accent', label: '강조 색상' },
];
const LINKED: Record<string, string[]> = {
    background: ['calendar.background', 'sidebar.background'],
    surface: ['card.background', 'schedule.background', 'task.background'],
    primary: ['calendar.todayColor', 'calendar.selectedColor', 'task.checkboxColor', 'sidebar.selectedBackground'],
    textPrimary: ['schedule.textColor', 'sidebar.textColor', 'calendar.weekdayColor'],
    textSecondary: ['sidebar.iconColor'],
    border: ['schedule.borderColor', 'card.borderColor'],
};
function applyKind(theme: BlankyTheme, kind: ThemeKind): BlankyTheme {
    const pkg = prunePackageForKind(theme.package ?? packageFromTheme(theme), kind);
    const empty = !Object.keys(pkg.manifest.assets).length && !pkg.customCss && !Object.keys(pkg.manifest.iconPack).length && !pkg.manifest.previews.length;
    if (kind === 'color' && empty)
        return { ...theme, themeType: 'basic', package: undefined };
    return { ...theme, themeType: 'package', package: pkg };
}
function applyMode(config: ThemeConfig, mode: ThemeMode): ThemeConfig {
    const next = structuredClone(mode === 'dark' ? BUILTIN_THEMES[3].config : BUILTIN_THEMES[0].config);
    next.mode = mode;
    next.iconPack = config.iconPack;
    return next;
}
export function ThemeEditorPage() {
    const [params] = useSearchParams();
    const ctx = useTheme();
    const { user } = useSession();
    const original = ctx.themes.find(theme => theme.id === params.get('id'));
    if (ctx.loading)
        return <p className="p-6">불러오는 중…</p>;
    if (params.get('id') && (!original || original.creatorId !== user?.id))
        return <p className="p-6">본인이 만든 테마만 수정할 수 있습니다.</p>;
    return <ThemeEditor key={original?.id ?? 'new'} original={original} publish={params.has('publish')} />;
}
function ThemeEditor({ original, publish }: {
    original?: BlankyTheme;
    publish: boolean;
}) {
    const { user } = useSession();
    const ctx = useTheme();
    const action = useAction();
    const [draft, setDraft] = useState<BlankyTheme>(() => {
        if (!original)
            return { ...structuredClone(BUILTIN_THEMES[0]), id: crypto.randomUUID(), creatorId: user!.id, creatorName: user!.nickname || user!.name, name: '나의 테마', visibility: 'private', createdAt: new Date().toISOString() };
        const copy = structuredClone(original);
        copy.config = normalizeThemeConfig(copy.config);
        return copy;
    });
    const [kind, setKind] = useState<ThemeKind>(() => original ? themeKindOf(original) : 'color');
    const [stage, setStage] = useState<'type' | 'edit'>(original ? 'edit' : 'type');
    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [importPreview, setImportPreview] = useState<BlankyTheme | null>(null);
    const [saved, setSaved] = useState(() => structuredClone(draft));
    const [registration, setRegistration] = useState(publish);
    const chooseKind = (next: ThemeKind) => {
        setKind(next);
        setDraft(current => applyKind(current, next));
        setStage('edit');
    };
    const change = (group: string, key: string, value: string | number) => setDraft(theme => {
        const config = structuredClone(theme.config);
        const target = config[group as keyof ThemeConfig] as unknown as Record<string, string | number>;
        const previous = target[key];
        target[key] = value;
        if (group === 'colors') {
            for (const path of LINKED[key] ?? []) {
                const [g, k] = path.split('.');
                const component = config[g as keyof ThemeConfig] as unknown as Record<string, string | number>;
                if (component[k] === previous)
                    component[k] = value;
            }
        }
        return { ...theme, config };
    });
    const save = async (apply = false) => {
        if (!user)
            return;
        const next = await saveTheme(user.id, applyKind(draft, kind));
        setDraft(next);
        setSaved(structuredClone(next));
        await ctx.refresh();
        if (apply)
            await ctx.apply(next);
    };
    if (stage === 'type')
        return <section data-theme-protected className="theme-page theme-customizer">
            <header className="theme-editor-heading"><div><h1>테마 유형 선택</h1><p>만들고 싶은 테마를 고르면 필요한 설정만 보여 줍니다.</p></div></header>
            <div className="theme-kind-grid">
                {KINDS.map(item => <button key={item.id} type="button" className="theme-kind-card" onClick={() => chooseKind(item.id)}>
                    <span className={'theme-kind-swatch kind-' + item.id} aria-hidden="true" />
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                </button>)}
            </div>
        </section>;
    return <section data-theme-protected className="theme-page theme-customizer">
        <header className="theme-editor-heading">
            <div>
                <h1>테마 꾸미기</h1>
                <p>{KINDS.find(item => item.id === kind)?.body}</p>
            </div>
            <span>사용 중 · {ctx.themes.find(theme => theme.id === ctx.active)?.name ?? '기본 테마'}</span>
        </header>
        <div className="theme-wizard-steps" aria-label="제작 단계">
            <button type="button" className="tab" onClick={() => setStage('type')}>1 유형</button>
            <span className="tab tab-on">2 꾸미기</span>
            <span className="tab tab-on">3 미리보기</span>
            <span className="tab">4 저장</span>
        </div>
        <div className="theme-editor mt-6">
            <div className="space-y-5">
                <section>
                    <h2 className="text-sm font-medium">기본 정보</h2>
                    <label className="mt-3 block text-sm">테마 이름<input className="field mt-1 w-full" maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
                    <div className="mt-3 flex gap-2" role="group" aria-label="라이트 다크">
                        {(['light', 'dark'] as const).map(mode => <button key={mode} type="button" className={draft.config.mode === mode ? 'chip chip-on' : 'chip'} aria-pressed={draft.config.mode === mode} onClick={() => setDraft(theme => ({ ...theme, config: applyMode(theme.config, mode) }))}>{mode === 'light' ? '라이트' : '다크'}</button>)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">{KINDS.map(item => <button key={item.id} type="button" className={kind === item.id ? 'chip chip-on' : 'chip'} aria-pressed={kind === item.id} onClick={() => chooseKind(item.id)}>{item.title}</button>)}</div>
                </section>
                <section>
                    <h2 className="text-sm font-medium">색상</h2>
                    <div className="mt-3 grid grid-cols-2 gap-3">{COLOR_FIELDS.map(field => {
                        const value = field.group === 'sidebar' ? draft.config.sidebar.background : draft.config.colors[field.key as keyof ThemeConfig['colors']];
                        return <ColorField key={field.group + field.key} label={field.label} value={value} onChange={next => change(field.group, field.key, next)} />;
                    })}</div>
                </section>
                {kind !== 'color' && <section>
                    <h2 className="text-sm font-medium">{kind === 'character' ? '배경 · 패턴 · 캐릭터' : '배경 및 패턴'}</h2>
                    <div className="mt-3"><ThemeSlots draft={draft} setDraft={setDraft} kind={kind} /></div>
                </section>}
                <details>
                    <summary>고급 패키지 · 아이콘 · CSS</summary>
                    <PackageEditor draft={draft} setDraft={setDraft} />
                    <ThemeImport onPreview={setImportPreview} />
                </details>
            </div>
            <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-neutral-500">실시간 미리보기</p>
                    <div className="flex gap-2" role="group" aria-label="미리보기 화면">
                        <button type="button" className={viewport === 'desktop' ? 'chip chip-on' : 'chip'} aria-pressed={viewport === 'desktop'} onClick={() => setViewport('desktop')}>데스크톱</button>
                        <button type="button" className={viewport === 'mobile' ? 'chip chip-on' : 'chip'} aria-pressed={viewport === 'mobile'} onClick={() => setViewport('mobile')}>모바일</button>
                    </div>
                </div>
                <ThemePreview theme={importPreview ?? draft} viewport={viewport} />
                <div className="mt-5 flex flex-wrap gap-2">
                    <button className="btn btn-line" onClick={() => { setKind('color'); setDraft(theme => ({ ...theme, config: structuredClone(BUILTIN_THEMES[0].config), package: undefined, themeType: 'basic' })); }}>기본값 복원</button>
                    <button className="btn btn-line" onClick={() => { setDraft(structuredClone(saved)); setKind(themeKindOf(saved)); }}>취소</button>
                    <button disabled={action.busy} className="btn btn-line" onClick={() => void action.run(() => save())}>저장</button>
                    <button disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(() => save(true))}>저장하고 적용하기</button>
                    <button className="btn btn-line" onClick={() => setRegistration(!registration)}>스토어 등록</button>
                    <ThemeExportButton theme={draft} />
                    <Link className="btn btn-ghost" to="/settings/themes">내 테마</Link>
                </div>
                <p role="status" className="mt-3">{action.message}</p>
                {registration && <form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); void action.run(() => save(false)); }}>
                    <h2>스토어 등록 정보</h2>
                    <label className="block text-sm">설명<textarea className="field w-full" value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
                    <label className="block text-sm">대표 이미지 URL (HTTPS)<input type="url" pattern="https://.*" className="field w-full" value={draft.thumbnailUrl} onChange={event => setDraft({ ...draft, thumbnailUrl: event.target.value })} /></label>
                    <label className="block text-sm">카테고리<input className="field w-full" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })} /></label>
                    <label className="block text-sm">태그 (쉼표로 구분)<input className="field w-full" value={draft.tags.join(',')} onChange={event => setDraft({ ...draft, tags: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label>
                    <label className="block text-sm">공개 여부<select className="field ml-2" value={draft.visibility} onChange={event => setDraft({ ...draft, visibility: event.target.value as 'public' | 'private' })}><option value="private">비공개</option><option value="public">공개</option></select></label>
                    <select aria-label="판매 방식" className="field" value={draft.pricingType} onChange={event => setDraft({ ...draft, pricingType: event.target.value as 'free' | 'paid', price: 0 })}><option value="free">무료</option><option value="paid">유료</option></select>
                    <label className="block text-sm">가격 (원)<input type="number" min={0} step={1} disabled={draft.pricingType === 'free'} className="field ml-2" value={draft.price} onChange={event => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
                    <button disabled={action.busy} className="btn btn-primary">등록 정보 저장</button>
                </form>}
            </div>
        </div>
    </section>;
}
