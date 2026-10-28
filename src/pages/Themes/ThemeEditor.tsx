import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BUILTIN_THEMES, normalizeThemeConfig, type BlankyTheme, type ThemeConfig } from '@blanky/types';
import { useAction } from './useThemeAction.ts';
import { ColorField } from './ColorField.tsx';
import { ThemePreview } from './ThemePreview.tsx';
import { ThemeImport } from './PackageControls.tsx';
import { useSession } from '../../state/useSession.ts';
import { useTheme } from '../../theme/context.ts';
import { saveTheme } from '../../services/themes/index.ts';

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

function colorDraft(userId: string, creatorName: string, original: BlankyTheme | undefined, active: BlankyTheme | undefined): BlankyTheme {
    if (original) {
        const copy = structuredClone(original);
        copy.config = normalizeThemeConfig(copy.config);
        return copy;
    }
    const next: BlankyTheme = { ...structuredClone(BUILTIN_THEMES[0]), id: crypto.randomUUID(), creatorId: userId, creatorName, name: '나의 테마', visibility: 'private', createdAt: new Date().toISOString() };
    if (active)
        next.config = normalizeThemeConfig(active.config);
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
    return <ThemeEditor key={original?.id ?? 'new'} original={original} />;
}

function ThemeEditor({ original }: { original?: BlankyTheme }) {
    const { user } = useSession();
    const ctx = useTheme();
    const action = useAction();
    const [tab, setTab] = useState<'colors' | 'custom'>('colors');
    const [draft, setDraft] = useState<BlankyTheme>(() => colorDraft(user!.id, user!.nickname || user!.name, original, ctx.themes.find(theme => theme.id === ctx.active)));
    const change = (group: string, key: string, value: string) => setDraft(theme => {
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
        const next = await saveTheme(user.id, draft);
        setDraft(next);
        await ctx.refresh();
        if (apply)
            await ctx.apply(next);
    };
    return <section data-theme-protected className="theme-page theme-customizer">
        <header className="theme-editor-heading">
            <h1>테마 만들기</h1>
        </header>
        <div className="theme-editor-tabs" role="tablist" aria-label="테마 제작">
            <button type="button" role="tab" aria-selected={tab === 'colors'} className={tab === 'colors' ? 'tab tab-on' : 'tab'} onClick={() => setTab('colors')}>색상 변경</button>
            <button type="button" role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'tab tab-on' : 'tab'} onClick={() => setTab('custom')}>커스텀</button>
        </div>
        {tab === 'colors' ? <div className="theme-editor mt-6">
            <div>
                <div className="theme-editor-colors">{COLOR_FIELDS.map(field => {
                    const value = field.group === 'sidebar' ? draft.config.sidebar.background : draft.config.colors[field.key as keyof ThemeConfig['colors']];
                    return <ColorField key={field.group + field.key} label={field.label} value={value} onChange={next => change(field.group, field.key, next)} />;
                })}</div>
                <div className="theme-editor-actions">
                    <button type="button" disabled={action.busy} className="btn btn-line" onClick={() => void action.run(() => save())}>저장</button>
                    <button type="button" disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(() => save(true))}>적용하기</button>
                </div>
                <p role="status" className="mt-3">{action.message}</p>
            </div>
            <ThemePreview theme={draft} />
        </div> : <ThemeImport variant="dropzone" />}
    </section>;
}
