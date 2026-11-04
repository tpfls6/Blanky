import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '../../constants/routes.ts'
import { StoreTabs } from '../Store/StoreTabs.tsx'
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
function ThemeCard({ theme }: {
    theme: BlankyTheme;
}) { return <article className="theme-store-card"><Link to={'/store/themes/' + theme.id} className="block"><div className="theme-swatch" style={{ background: theme.config.colors.background, color: theme.config.colors.textPrimary }}>{theme.thumbnailUrl ? <img src={theme.thumbnailUrl} alt={theme.name} className="h-full w-full object-contain"/> : <><div style={{ background: theme.config.sidebar.selectedBackground }}/><div><span style={{ background: theme.config.colors.primary }}/><span style={{ background: theme.config.schedule.background }}/><span style={{ background: theme.config.colors.surface }}/></div></>}</div><h2 className="mt-3 font-medium">{theme.name}</h2><span className="text-xs">{kindLabels[themeKindOf(theme)]} · {theme.package ? '패키지' : '색상'}</span></Link><Link className="text-sm text-neutral-500" to={'/creator/' + (theme.creatorId ?? 'blanky')}>{theme.creatorName}</Link><p className="mt-1 text-sm">{price(theme)} <span className="text-neutral-400">· {theme.ratingCount ? '★ ' + theme.ratingAverage.toFixed(1) : '평점 없음'} · {theme.downloadCount} 다운로드</span></p></article>; }
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
export function ThemeStore() {
    const { themes, error, loading } = useTheme();
    const { user } = useSession();
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const [tab, setTab] = useState('추천');
    const mine = params.get('view') === 'mine';
    const setMine = (on: boolean) => setParams(current => { const next = new URLSearchParams(current); if (on) next.set('view', 'mine'); else next.delete('view'); return next; });
    const shown = themes.filter(t => t.visibility === 'public' && (tab !== '무료' || t.pricingType === 'free') && (tab !== '유료' || t.pricingType === 'paid') && (t.name + ' ' + t.description + ' ' + t.tags.join(' ')).toLowerCase().includes(query.toLowerCase())).sort((a, b) => tab === '인기' ? b.downloadCount - a.downloadCount : tab === '신규' ? b.createdAt.localeCompare(a.createdAt) : Number(a.creatorId !== null) - Number(b.creatorId !== null));
    return <section data-theme-protected className="theme-page">
        <header className="flex flex-wrap justify-between gap-3"><div><h1>테마 스토어</h1><p className="text-sm text-neutral-500">당신의 하루를 취향에 맞게.</p></div><div className="flex gap-2"><button type="button" className="btn btn-line" aria-pressed={mine} onClick={() => setMine(!mine)}>내 테마</button><Link className="btn btn-primary" to={ROUTES.themeEditor}>테마 만들기</Link></div></header>
        <StoreTabs current="themes" />
        {!mine && <input className="field my-5 w-full max-w-lg" aria-label="테마 검색" placeholder="이름, 설명, 태그 검색" value={query} onChange={e => setQuery(e.target.value)}/>}
        <div className={(mine ? 'mt-5 ' : '') + 'mb-6 flex flex-wrap gap-4'}>{['추천', '인기', '신규', '무료', '유료'].map(v => <button key={v} type="button" className={!mine && tab === v ? 'tab tab-on' : 'tab'} onClick={() => { setTab(v); setMine(false); }}>{v}</button>)}</div>
        {error ? <p role="alert" className="store-state">테마를 불러오지 못했습니다. {error}</p>
            : loading ? <p role="status" className="store-state">테마를 불러오는 중…</p>
                : mine ? <MyStoreThemes themes={themes.filter(t => t.creatorId !== null && t.creatorId === user?.id)}/>
                    : shown.length ? <div className="theme-grid">{shown.map(t => <ThemeCard key={t.id} theme={t}/>)}</div>
                        : <p className="store-state">검색 결과가 없습니다.</p>}
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
    const t = ctx.themes.find(v => v.id === themeId);
    if (!t)
        return <section data-theme-protected className="theme-page">{ctx.loading ? <p role="status" className="store-state">불러오는 중…</p> : <div role="alert" className="store-state"><p>테마를 찾을 수 없습니다.</p>{ctx.error && <p className="mt-2">{ctx.error}</p>}<Link className="btn btn-line mt-4" to="/store">스토어로</Link></div>}</section>;
    const owned = !t.creatorId || t.creatorId === user?.id || ctx.installed.includes(t.id);
    return <section data-theme-protected className="theme-page">
        <Link className="inline-flex items-center gap-1.5 text-sm" to="/store"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 스토어</Link>
        <div className="store-split">
            <div>
                <h1>{t.name}</h1>
                <Link className="text-sm text-neutral-500" to={'/creator/' + (t.creatorId ?? 'blanky')}>{t.creatorName}</Link>
                <p className="store-meta mt-3"><span>{kindLabels[themeKindOf(t)]}{t.package ? ' · Package v' + t.package.manifest.version : ''}</span><span>{price(t)}</span><span>{t.downloadCount} 다운로드</span><span>{t.ratingCount ? '★ ' + t.ratingAverage : '평점 없음'}</span><span>제작일 {new Date(t.createdAt).toLocaleDateString('ko-KR')}</span></p>
                {t.description && <p className="mt-5 whitespace-pre-wrap">{t.description}</p>}
                <h2 className="mt-6 text-sm font-medium">포함 요소</h2>
                <p className="mt-2 text-sm">{packageFeatures(t).join(' · ')}</p>
                <div className="mt-6 flex flex-wrap gap-2"><button type="button" disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(async () => {
                    if (owned)
                        await ctx.apply(t);
                    else if (user) {
                        await installTheme(user.id, t);
                        await ctx.refresh();
                    }
                })}>{owned ? '적용하기' : t.pricingType === 'paid' ? '구매하기' : '설치하기'}</button><button type="button" className="btn btn-line" onClick={() => { ctx.startPreview(t); navigate('/schedule'); }}>내 일정으로 미리보기</button>{owned && <ThemeExportButton theme={t}/>}</div>
                <p role="status" className="mt-3">{action.message}</p>
            </div>
            <div className="store-split-preview">{t.thumbnailUrl && <img className="mb-4 w-full rounded-xl" src={t.thumbnailUrl} alt={t.name}/>}<ThemePreview theme={t}/></div>
        </div>
    </section>;
}
export { MyThemesPage } from './MyThemesPage.tsx'
export function CreatorPage() { const { userId } = useParams(); const { themes } = useTheme(); const list = themes.filter(t => t.visibility === 'public' && (userId === 'blanky' ? t.creatorId === null : t.creatorId === userId)); const count = list.reduce((n, t) => n + t.ratingCount, 0); return <section data-theme-protected className="theme-page"><Link className="inline-flex items-center gap-1.5" to="/store"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 스토어</Link><div className="mt-5 flex size-16 items-center justify-center rounded-full bg-accent-light text-2xl" aria-label="제작자 프로필">{(list[0]?.creatorName ?? 'Creator').slice(0, 1)}</div><h1 className="mt-5">{list[0]?.creatorName ?? 'Creator'}</h1><p className="my-5">등록 테마 {list.length} · 전체 다운로드 {list.reduce((n, t) => n + t.downloadCount, 0)} · {count ? '평균 평점 ' + (list.reduce((n, t) => n + t.ratingAverage * t.ratingCount, 0) / count).toFixed(1) : '평점 없음'}</p><div className="theme-grid">{list.map(t => <ThemeCard key={t.id} theme={t}/>)}</div></section>; }
