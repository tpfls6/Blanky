import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { BUILTIN_THEMES, normalizeThemeConfig, type BlankyTheme, type ThemeConfig } from '@blanky/types';
import { useAction } from './useThemeAction.ts';
import { ColorPicker } from './ColorField.tsx';
import { ThemePreview } from './ThemePreview.tsx';
import { ThemeImport } from './PackageControls.tsx';
import { useSession } from '../../state/useSession.ts';
import { useTheme } from '../../theme/context.ts';
import { saveTheme } from '../../services/themes/index.ts';
import { ROUTES } from '../../constants/routes.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { CustomizationSheet } from '../Custom/CustomizationSheet.tsx';
import '../More/more.css';
import './themeEditor.css';

// `id` names the i18n label/hint (themes.colorFields.*); `soft` picks light suggestions for background-like colors.
const COLOR_FIELDS: { id: string; group: 'colors' | 'sidebar'; key: string; soft?: boolean }[] = [
    { id: 'primary', group: 'colors', key: 'primary' },
    { id: 'background', group: 'colors', key: 'background', soft: true },
    { id: 'sidebar', group: 'sidebar', key: 'background', soft: true },
    { id: 'surface', group: 'colors', key: 'surface', soft: true },
    { id: 'textPrimary', group: 'colors', key: 'textPrimary' },
    { id: 'accent', group: 'colors', key: 'accent' },
];
const LINKED: Record<string, string[]> = {
    surface: ['card.background', 'schedule.background', 'task.background', 'calendar.background'],
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

// Phone mini preview drawn straight from the draft colors: sidebar, title, a week of calendar cells with
// today (primary) and one highlight (accent), on a card (surface) over the background.
function MiniPreview({ theme }: { theme: BlankyTheme }) {
    const { colors, sidebar, calendar } = theme.config;
    return <div className="te-mini" aria-hidden="true" style={{ background: colors.background }}>
        <div className="te-mini-side" style={{ background: sidebar.background }}>
            <i style={{ background: sidebar.selectedBackground }} />
            {[0, 1, 2].map(n => <i key={n} style={{ background: sidebar.textColor }} />)}
        </div>
        <div className="te-mini-main" style={{ background: colors.surface, borderColor: colors.border }}>
            <span className="te-mini-title" style={{ background: colors.textPrimary }} />
            <span className="te-mini-text" style={{ background: colors.textSecondary }} />
            <div className="te-mini-cal" style={{ background: calendar.background }}>
                {Array.from({ length: 14 }, (_, n) => <b key={n} data-on={n === 2 || n === 6 ? '' : undefined} style={{ background: n === 2 ? colors.primary : n === 6 ? colors.accent : colors.border }} />)}
            </div>
        </div>
    </div>;
}

function ThemeEditor({ original }: { original?: BlankyTheme }) {
    const { t } = useI18n();
    const { user } = useSession();
    const ctx = useTheme();
    const action = useAction();
    const nameId = useId();
    const phone = useMediaQuery(PHONE_QUERY);
    const [tab, setTab] = useState<'colors' | 'custom'>('colors');
    const [editing, setEditing] = useState<string | null>(null);
    const [draft, setDraft] = useState<BlankyTheme>(() => colorDraft(user!.id, user!.nickname || user!.name, original, ctx.themes.find(theme => theme.id === ctx.active)));
    // The last saved (or opened) state; the app bar says so when the draft differs from it.
    const [baseline, setBaseline] = useState(draft);
    const dirty = draft.name !== baseline.name || JSON.stringify(draft.config) !== JSON.stringify(baseline.config);
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
        const name = draft.name.trim();
        if (!name) throw new Error(t('custom.themeNameRequired'));
        const next = await saveTheme(user.id, { ...draft, name });
        setDraft(next);
        setBaseline(next);
        await ctx.refresh();
        if (apply)
            await ctx.apply(next);
    };
    const valueOf = (field: typeof COLOR_FIELDS[number]) => field.group === 'sidebar' ? draft.config.sidebar.background : draft.config.colors[field.key as keyof ThemeConfig['colors']];
    const field = COLOR_FIELDS.find(item => item.id === editing);
    const title = original ? draft.name.trim() || original.name : t('themes.editorNew');
    return <section data-theme-protected className="te-page">
        <header className="more-bar te-bar mobile-theme-editor-heading">
            <Link to={ROUTES.myThemes} className="more-ib" aria-label={t('custom.goBack')}>
                <ArrowLeft className="size-5.5" strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <h1>{title}{dirty ? <span className="te-bar-sub">{t('themes.unsaved')}</span> : null}</h1>
        </header>
        <div className="theme-editor te-layout" data-tab={tab}>
            <div className="te-form">
                <div className="te-seg" role="tablist" aria-label={t('themes.editorModes')}>
                    <button type="button" role="tab" aria-selected={tab === 'colors'} onClick={() => setTab('colors')}>{t('themes.segColors')}</button>
                    <button type="button" role="tab" aria-selected={tab === 'custom'} onClick={() => setTab('custom')}>{t('themes.segCustom')}</button>
                </div>
                {tab === 'colors' ? <>
                    <label className="more-label" htmlFor={nameId}>{t('themes.nameLabel')}</label>
                    <input id={nameId} className="field te-name" value={draft.name} onChange={event => setDraft(theme => ({ ...theme, name: event.target.value }))} maxLength={100} required />
                    <h2 className="more-label">{t('themes.colorsLabel')}<small>{t('themes.tapToChange')}</small></h2>
                    <div className="more-card theme-editor-colors">{COLOR_FIELDS.map(item => {
                        const value = valueOf(item);
                        return <button key={item.id} type="button" className="more-row te-color-row" aria-haspopup="dialog" onClick={() => setEditing(item.id)}>
                            <span className="more-rt">{t(`themes.colorFields.${item.id}.label`)}<small>{t(`themes.colorFields.${item.id}.hint`)}</small></span>
                            <span className="te-hex">{value.toUpperCase()}</span>
                            <span className="theme-editor-swatch" style={{ background: value }} aria-hidden="true" />
                        </button>;
                    })}</div>
                    <p role="status" className="te-status">{action.message}</p>
                </> : <ThemeImport variant="dropzone" />}
            </div>
            {tab === 'colors' ? <div className="te-preview">{phone ? <MiniPreview theme={draft} /> : <ThemePreview theme={draft} fill />}</div> : null}
        </div>
        {tab === 'colors' ? <div className="theme-editor-actions te-actionbar">
            <button type="button" disabled={action.busy} className="btn btn-line" onClick={() => void action.run(() => save())}>{t('themes.save')}</button>
            <button type="button" disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(() => save(true))}>{t('themes.saveAndApply')}</button>
        </div> : null}
        {field ? <CustomizationSheet title={t(`themes.colorFields.${field.id}.label`)} subtitle={t(`themes.colorFields.${field.id}.hint`)} onClose={() => setEditing(null)}>
            <ColorPicker label={t(`themes.colorFields.${field.id}.label`)} value={valueOf(field)} soft={field.soft} onChange={next => change(field.group, field.key, next)} />
            <button type="button" className="btn btn-primary te-done" onClick={() => setEditing(null)}>{t('themes.done')}</button>
        </CustomizationSheet> : null}
    </section>;
}
