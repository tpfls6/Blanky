import { ArrowLeft, Check, ChevronRight, Download, Eye, Link2, Palette, Share2, Upload } from 'lucide-react'
import { ROUTES } from '../../constants/routes.ts'
import { StoreTabs } from '../Store/StoreTabs.tsx'
import { CreatorRow, SortMenu, StoreBar, StoreChip, StoreChips, StoreDetailBar, StoreMenuSheet, StoreStats, StoreToast, type StoreMenuItem } from '../Store/StoreChrome.tsx'
import { useFlash } from '../Store/useFlash.ts'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { useAction } from './useThemeAction.ts'
export { ThemePreviewBar } from './ThemePreviewBar.tsx'
export { ThemePreview } from './ThemePreview.tsx'
export { ThemeEditorPage } from './ThemeEditor.tsx'
import { packageFeatures, kindLabels } from '../../theme/package/features.ts';
import { themeKindOf } from '../../theme/package/slots.ts';

import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TemplateStore } from '../Store/TemplateStore.tsx';
import { type BlankyTheme } from '@blanky/types';
import { useTheme } from '../../theme/context.ts';
import { ThemeExportButton } from './PackageControls.tsx';
import { useSession } from '../../state/useSession.ts';
import { installTheme } from '../../services/themes/index.ts';
import { ThemePreview } from './ThemePreview.tsx';
const price = (t: BlankyTheme) => t.pricingType === 'free' ? '무료' : '₩' + t.price.toLocaleString();
/** Theme thumbnail drawn from the theme's own colors (or its uploaded image). */
function ThemeArt({ theme, small }: { theme: BlankyTheme; small?: boolean }) {
    return <div className={small ? 'theme-swatch store-art store-art-sm' : 'theme-swatch store-art'} style={{ background: theme.config.colors.background, color: theme.config.colors.textPrimary }}>{theme.thumbnailUrl ? <img src={theme.thumbnailUrl} alt={theme.name} className="h-full w-full object-contain"/> : <><div style={{ background: theme.config.sidebar.selectedBackground }}/><div><span style={{ background: theme.config.colors.primary }}/><span style={{ background: theme.config.schedule.background }}/><span style={{ background: theme.config.colors.surface }}/></div></>}</div>;
}
/** Price, rating (when there is one) and downloads in one short line; 무료 reads in the accent color. */
function ThemeMeta({ theme }: { theme: BlankyTheme }) {
    const { t, locale } = useI18n();
    const downloads = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(theme.downloadCount);
    return <p className="store-card-meta">
        <span className={theme.pricingType === 'free' ? 'store-free' : 'store-price'}>{theme.pricingType === 'free' ? t('themes.free') : price(theme)}</span>
        {/* No ratings yet: the rating slot is left out rather than saying so. */}
        {theme.ratingCount ? <span><span className="store-star" aria-hidden="true">★</span>{theme.ratingAverage.toFixed(1)}</span> : null}
        <span title={t('themes.downloads', { count: theme.downloadCount })}><Download className="inline size-3 align-[-1px]" strokeWidth={2} aria-hidden="true"/> {downloads}<span className="sr-only"> {t('store.downloadsSr')}</span></span>
    </p>;
}
// Shared with the creator page: preview · name · creator · price · rating · downloads, the whole card opens the detail.
function ThemeCard({ theme }: {
    theme: BlankyTheme;
}) { return <article className="theme-store-card store-card"><Link to={ROUTES.themeDetail(theme.id)} className="block"><ThemeArt theme={theme}/><h2 className="store-card-name">{theme.name}</h2><p className="store-card-by">{theme.creatorName}</p><ThemeMeta theme={theme}/></Link></article>; }
// Themes the user made, browsed in place: list and details on the left, live preview on the right.
function MyStoreThemes({ themes }: { themes: BlankyTheme[] }) {
    const ctx = useTheme();
    const action = useAction();
    const [selectedId, setSelectedId] = useState('');
    const selected = themes.find(t => t.id === selectedId) ?? themes[0];
    if (!selected)
        return <p className="store-state">아직 등록한 테마가 없습니다.</p>;
    return <div className="store-split" data-testid="my-themes">
        <div>
            <div className="store-list" role="list">{themes.map(t => <button key={t.id} type="button" role="listitem" className="store-list-item" aria-pressed={t.id === selected.id} onClick={() => setSelectedId(t.id)}>
                <span className="store-list-dot" style={{ background: t.config.colors.primary }} aria-hidden="true"/>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span>
                <span className="shrink-0 text-xs text-neutral-500">{t.visibility === 'public' ? '공개' : '비공개'}</span>
            </button>)}</div>
            <h2 className="text-lg font-medium">{selected.name}</h2>
            <p className="store-meta mt-1"><span>{kindLabels[themeKindOf(selected)]}</span><span>{selected.visibility === 'public' ? '스토어 공개' : '비공개'}</span><span>{price(selected)}</span><span>{selected.downloadCount} 다운로드</span>{ctx.active === selected.id && <span>사용 중</span>}</p>
            {selected.description && <p className="mt-4 whitespace-pre-wrap text-sm">{selected.description}</p>}
            <div className="mt-6 flex flex-wrap gap-2">
                <button type="button" disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(() => ctx.apply(selected))}>적용하기</button>
                <Link className="btn btn-line" to={ROUTES.themeDetail(selected.id)}>상세 보기</Link>
                <Link className="btn btn-ghost" to={ROUTES.themeEditor + '?id=' + selected.id}>수정</Link>
            </div>
            <p role="status" className="mt-3 text-sm">{action.message}</p>
        </div>
        <div className="store-split-preview"><ThemePreview theme={selected}/></div>
    </div>;
}
type ThemeFilter = 'all' | 'free' | 'paid' | 'installed';
type ThemeSort = 'featured' | 'popular' | 'new';
export function ThemeStore() {
    const { themes, installed, error, loading } = useTheme();
    const { user } = useSession();
    const { t } = useI18n();
    const phone = useMediaQuery(PHONE_QUERY);
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<ThemeFilter>('all');
    const [sort, setSort] = useState<ThemeSort>('featured');
    const mine = params.get('view') === 'mine';
    const setMine = (on: boolean) => setParams(current => { const next = new URLSearchParams(current); if (on) next.set('view', 'mine'); else next.delete('view'); return next; });
    const text = query.trim().toLowerCase();
    const order = (list: BlankyTheme[], by: ThemeSort) => [...list].sort((a, b) => by === 'popular' ? b.downloadCount - a.downloadCount : by === 'new' ? b.createdAt.localeCompare(a.createdAt) : Number(a.creatorId !== null) - Number(b.creatorId !== null));
    const pool = filter === 'installed' ? themes.filter(th => installed.includes(th.id)) : themes.filter(th => th.visibility === 'public' && (filter !== 'free' || th.pricingType === 'free') && (filter !== 'paid' || th.pricingType === 'paid'));
    const shown = order(pool.filter(th => (th.name + ' ' + th.description + ' ' + th.tags.join(' ')).toLowerCase().includes(text)), sort);
    // The featured row reuses the 추천 order (official first); it shows only while browsing everything.
    const featured = !text && filter === 'all' ? order(themes.filter(th => th.visibility === 'public'), 'featured').slice(0, 5) : [];
    const menu: StoreMenuItem[] = [
        { label: t('themes.createTheme'), hint: t('store.createThemeHint'), icon: Palette, to: ROUTES.themeEditor, accent: true },
        { label: t('store.myThemes'), icon: Upload, onClick: () => setMine(true) },
        { label: t('store.manageThemes'), hint: t('store.manageThemesHint'), icon: Download, to: ROUTES.myThemes },
    ];
    return <section data-theme-protected className="theme-page store-page">
        <StoreBar phone={phone} query={mine ? '' : query} onQuery={value => { setQuery(value); if (mine) setMine(false); }} searchLabel={t('store.searchThemes')} menu={menu} onBack={mine ? () => setMine(false) : undefined}
            actions={<><button type="button" className="btn btn-line" aria-pressed={mine} onClick={() => setMine(!mine)}>{t('themes.myThemes')}</button><Link className="btn btn-primary" to={ROUTES.themeEditor}>{t('themes.createTheme')}</Link></>}/>
        <div className="store-body">
        <StoreTabs current="themes" />
        {!mine && <StoreChips label={t('store.filters')}>
            {(['all', 'free', 'paid', 'installed'] as const).map(id => <StoreChip key={id} on={filter === id} onClick={() => setFilter(id)}>{t(id === 'all' ? 'store.all' : id === 'installed' ? 'store.installed' : 'themes.' + id)}</StoreChip>)}
        </StoreChips>}
        {error ? <p role="alert" className="store-state">{t('store.themesLoadError')} {error}</p>
            : loading ? <p role="status" className="store-state">{t('themes.loading')}</p>
                : mine ? <MyStoreThemes themes={themes.filter(th => th.creatorId !== null && th.creatorId === user?.id)}/>
                    : <>
                        {featured.length > 1 && <section aria-label={t('store.featuredThemes')}>
                            <h2 className="more-label store-label">{t('store.featuredThemes')}</h2>
                            <div className="store-feat">{featured.map(th => <Link key={th.id} to={ROUTES.themeDetail(th.id)} className="store-fcard">
                                <ThemeArt theme={th}/>
                                <span className="store-fcard-info"><span className="more-rt"><span className="store-card-name">{th.name}</span><small>{th.creatorName} · {kindLabels[themeKindOf(th)]}</small></span><span className={th.pricingType === 'free' ? 'store-pill store-pill-free' : 'store-pill'}>{th.pricingType === 'free' ? t('themes.free') : price(th)}</span></span>
                            </Link>)}</div>
                        </section>}
                        <SortMenu count={text ? t('store.results', { count: shown.length }) : t('store.countThemes', { count: shown.length })} value={sort} onChange={setSort}
                            options={(['featured', 'popular', 'new'] as const).map(value => ({ value, label: t('store.sort.' + value) }))}/>
                        {!shown.length ? <p className="store-state">{t('templates.empty')}</p>
                            : text ? <ul className="more-card store-results">{shown.map(th => <li key={th.id}><Link to={ROUTES.themeDetail(th.id)} className="more-row">
                                <ThemeArt theme={th} small/>
                                <span className="more-rt"><span className="store-card-name">{th.name}</span><small>{th.creatorName} · {th.pricingType === 'free' ? t('themes.free') : price(th)}{th.ratingCount ? ' · ★ ' + th.ratingAverage.toFixed(1) : ''}</small></span>
                                <ChevronRight className="more-chev size-4.5" aria-hidden="true"/>
                            </Link></li>)}</ul>
                                : <div className="theme-grid">{shown.map(th => <ThemeCard key={th.id} theme={th}/>)}</div>}
                    </>}
        </div>
    </section>;
}
export function StorePage() {
  const [params] = useSearchParams()
  if (params.get('tab') === 'templates') return <TemplateStore />
  return <ThemeStore />
}
export function ThemeDetailPage() {
    const { themeId } = useParams();
    const ctx = useTheme();
    const { user } = useSession();
    const action = useAction();
    const navigate = useNavigate();
    const { t: tr, locale } = useI18n();
    const phone = useMediaQuery(PHONE_QUERY);
    const [sheet, setSheet] = useState(false);
    const [copies, setCopies] = useState(0);
    const copyToast = useFlash(copies ? tr('templates.copied') : '', copies);
    const actionToast = useFlash(action.message);
    const toast = copyToast || actionToast;
    const t = ctx.themes.find(v => v.id === themeId);
    if (!t)
        return <section data-theme-protected className="theme-page">{ctx.loading ? <p role="status" className="store-state">불러오는 중…</p> : <div role="alert" className="store-state"><p>테마를 찾을 수 없습니다.</p>{ctx.error && <p className="mt-2">{ctx.error}</p>}<Link className="btn btn-line mt-4" to="/store">스토어로</Link></div>}</section>;
    const owned = !t.creatorId || t.creatorId === user?.id || ctx.installed.includes(t.id);
    const compact = (value: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    const byCreator = ctx.themes.filter(v => v.visibility === 'public' && v.creatorId === t.creatorId).length;
    const copyLink = () => void navigator.clipboard.writeText(window.location.origin + ROUTES.themeDetail(t.id)).then(() => setCopies(n => n + 1));
    const primaryLabel = owned ? tr('themes.applyNow') : t.pricingType === 'paid' ? tr('store.buy') : tr('store.installFree');
    const primary = <button type="button" disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(async () => {
        if (owned)
            await ctx.apply(t);
        else if (user) {
            await installTheme(user.id, t);
            await ctx.refresh();
        }
    })}>{owned ? <Check className="size-4.5" strokeWidth={2} aria-hidden="true"/> : null}{primaryLabel}</button>;
    const iconOnly = phone && t.pricingType === 'paid' && !owned;
    const preview = <button type="button" className={iconOnly ? 'btn btn-line store-icon-btn' : 'btn btn-line'} aria-label={phone ? tr('themes.previewMine') : undefined} onClick={() => { ctx.startPreview(t); navigate('/schedule'); }}><Eye className="size-4.5" strokeWidth={1.8} aria-hidden="true"/>{iconOnly ? null : phone ? tr('themes.preview') : tr('themes.previewMine')}</button>;
    // Stats: only values the theme has (no rating yet → no rating cell).
    const stats = [
        ...(t.ratingCount ? [{ value: <><span className="store-star" aria-hidden="true">★</span> {t.ratingAverage.toFixed(1)}</>, label: tr('store.ratings', { count: t.ratingCount }) }] : []),
        { value: compact(t.downloadCount), label: tr('store.downloadsSr') },
        { value: t.package ? 'v' + t.package.manifest.version : kindLabels[themeKindOf(t)], label: t.package ? kindLabels[themeKindOf(t)] : tr('store.kind') },
    ];
    return <section data-theme-protected className="theme-page store-page store-detail">
        {phone ? <StoreDetailBar over onShare={copyLink} onMore={() => setSheet(true)} backTo={ROUTES.store}/>
            : <Link className="inline-flex items-center gap-1.5 text-sm" to="/store"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 스토어</Link>}
        {phone && <div className="store-hero" aria-hidden="true">{t.thumbnailUrl ? <img src={t.thumbnailUrl} alt=""/> : <ThemeArt theme={t}/>}</div>}
        <div className="store-split">
            <div className="store-info">
                <h1>{t.name}</h1>
                {!phone && <div className="store-detail-actions">{preview}{primary}{t.pricingType === 'paid' && !owned ? <span className="store-price-tag">{price(t)}</span> : null}
                    <button type="button" className="btn btn-ghost" onClick={copyLink}><Share2 className="size-4" strokeWidth={1.8} aria-hidden="true"/>{tr('store.copyLink')}</button>
                    {owned && <ThemeExportButton theme={t} className="btn btn-ghost">{tr('themes.exportFile')}</ThemeExportButton>}</div>}
                <CreatorRow to={'/creator/' + (t.creatorId ?? 'blanky')} name={t.creatorName} hint={byCreator ? tr('store.creatorThemes', { count: byCreator }) : tr('store.creatorPage')}/>
                <StoreStats items={stats}/>
                {t.description && <><h2 className="more-label">{tr('store.about')}</h2><p className="store-desc">{t.description}</p></>}
                <h2 className="more-label">{tr('store.features')}</h2>
                <ul className="store-tags">{packageFeatures(t).map(item => <li key={item}>{item}</li>)}</ul>
                <p className="more-hint">{tr('themes.createdAt', { date: new Date(t.createdAt).toLocaleDateString(locale) })}</p>
            </div>
            <div className="store-split-preview">{t.thumbnailUrl && !phone && <img className="mb-4 w-full rounded-xl" src={t.thumbnailUrl} alt={t.name}/>}<ThemePreview theme={t}/></div>
        </div>
        {phone && <div className="store-actionbar">
            {t.pricingType === 'paid' && !owned ? <span className="store-price-col"><small>{tr('store.price')}</small><b>{price(t)}</b></span> : null}
            {preview}{primary}
        </div>}
        <StoreToast message={toast}/>
        {sheet && <StoreMenuSheet title={t.name} subtitle={[owned ? tr('store.ownedTheme') : '', t.creatorName].filter(Boolean).join(' · ')} onClose={() => setSheet(false)} groups={[[
            { label: tr('store.copyLink'), icon: Link2, onClick: copyLink },
            ...(owned ? [<ThemeExportButton key="export" theme={t} className="more-row"><span className="more-ri store-ri"><Download className="size-4.5" strokeWidth={1.8} aria-hidden="true"/></span><span className="more-rt">{tr('themes.exportFile')}</span></ThemeExportButton>] : []),
            ...(owned ? [{ label: tr('store.manageInMyThemes'), icon: Palette, to: ROUTES.myThemes }] : []),
        ]]}/>}
    </section>;
}
export { MyThemesPage } from './MyThemesPage.tsx'
export function CreatorPage() { const { userId } = useParams(); const { themes } = useTheme(); const list = themes.filter(t => t.visibility === 'public' && (userId === 'blanky' ? t.creatorId === null : t.creatorId === userId)); const count = list.reduce((n, t) => n + t.ratingCount, 0); return <section data-theme-protected className="theme-page"><Link className="inline-flex items-center gap-1.5" to="/store"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 스토어</Link><div className="mt-5 flex size-16 items-center justify-center rounded-full bg-accent-light text-2xl" aria-label="제작자 프로필">{(list[0]?.creatorName ?? 'Creator').slice(0, 1)}</div><h1 className="mt-5">{list[0]?.creatorName ?? 'Creator'}</h1><p className="my-5">등록 테마 {list.length} · 전체 다운로드 {list.reduce((n, t) => n + t.downloadCount, 0)} · {count ? '평균 평점 ' + (list.reduce((n, t) => n + t.ratingAverage * t.ratingCount, 0) / count).toFixed(1) : '평점 없음'}</p><div className="theme-grid">{list.map(t => <ThemeCard key={t.id} theme={t}/>)}</div></section>; }
