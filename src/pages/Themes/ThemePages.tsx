import { ArrowLeft } from 'lucide-react'
import { PageTour } from '../../features/onboarding/Onboarding.tsx'
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
export function ThemeStore() { const { themes, error, loading } = useTheme(); const [query, setQuery] = useState(''); const [tab, setTab] = useState('추천'); const shown = themes.filter(t => t.visibility === 'public' && (tab !== '무료' || t.pricingType === 'free') && (tab !== '유료' || t.pricingType === 'paid') && (t.name + ' ' + t.description + ' ' + t.tags.join(' ')).toLowerCase().includes(query.toLowerCase())).sort((a, b) => tab === '인기' ? b.downloadCount - a.downloadCount : tab === '신규' ? b.createdAt.localeCompare(a.createdAt) : Number(a.creatorId !== null) - Number(b.creatorId !== null)); return <section data-theme-protected className="theme-page"><header className="flex flex-wrap justify-between gap-3"><div><h1>테마 스토어</h1><p className="text-sm text-neutral-500">당신의 하루를 취향에 맞게.</p></div><div className="flex gap-2"><Link className="btn btn-line" to="/settings/themes">내 테마</Link><Link className="btn btn-primary" to="/customize/theme">테마 만들기</Link></div></header><StoreTabs current="themes" /><input className="field my-5 w-full max-w-lg" aria-label="테마 검색" placeholder="이름, 설명, 태그 검색" value={query} onChange={e => setQuery(e.target.value)}/><div className="mb-6 flex flex-wrap gap-4">{['추천', '인기', '신규', '무료', '유료'].map(v => <button key={v} className={tab === v ? 'tab tab-on' : 'tab'} onClick={() => setTab(v)}>{v}</button>)}<Link className="tab" to="/settings/themes">내 테마</Link></div>{error && <p role="alert">{error}</p>}{loading ? <p role="status">테마를 불러오는 중…</p> : <div className="theme-grid">{shown.map(t => <ThemeCard key={t.id} theme={t}/>)}{!shown.length && <p>검색 결과가 없습니다.</p>}</div>}</section>; }
function StoreTabs({ current }: { current: 'themes' | 'templates' }) {
  return <><div data-tour="store-tabs" className="mt-6 flex gap-3"><Link className={current === 'themes' ? 'chip chip-on' : 'chip'} to="/store">테마</Link><Link className={current === 'templates' ? 'chip chip-on' : 'chip'} to="/store?tab=templates">템플릿</Link></div><PageTour page="store" className="mt-5" /></>
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
        return <section data-theme-protected className="theme-page">{ctx.loading ? '불러오는 중…' : '테마를 찾을 수 없습니다.'}<p>{ctx.error}</p><Link to="/store">스토어로</Link></section>;
    const owned = !t.creatorId || t.creatorId === user?.id || ctx.installed.includes(t.id);
    return <section data-theme-protected className="theme-page"><Link className="inline-flex items-center gap-1.5 text-sm" to="/store"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 스토어</Link><div className="theme-editor mt-6"><div>{t.thumbnailUrl && <img className="mb-4 w-full rounded-xl" src={t.thumbnailUrl} alt={t.name}/>}<ThemePreview theme={t}/></div><div><h1>{t.name}</h1><Link to={'/creator/' + (t.creatorId ?? 'blanky')}>{t.creatorName}</Link><p className="my-5 whitespace-pre-wrap">{t.description}</p><p>형식: {kindLabels[themeKindOf(t)]} · {t.package ? 'Package v' + t.package.manifest.version : 'Color'}</p><h2 className="mt-4">포함 요소</h2><p className="my-2 text-sm">{packageFeatures(t).join(" · ")}</p><p>{price(t)} · {t.downloadCount} 다운로드 · {t.ratingCount ? '★ ' + t.ratingAverage : '평점 없음'}</p><p className="my-3 text-xs">제작일 {new Date(t.createdAt).toLocaleDateString('ko-KR')}</p><div className="flex flex-wrap gap-2"><button className="btn btn-line" onClick={() => { ctx.startPreview(t); navigate('/schedule'); }}>내 일정으로 미리보기</button><button disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(async () => {
            if (owned)
                await ctx.apply(t);
            else if (user) {
                await installTheme(user.id, t);
                await ctx.refresh();
            }
        })}>{owned ? '적용하기' : t.pricingType === 'paid' ? '구매하기' : '설치하기'}</button></div>{owned && <div className="mt-3"><ThemeExportButton theme={t}/></div>}<p role="status" className="mt-3">{action.message}</p></div></div></section>;
}
export { MyThemesPage } from './MyThemesPage.tsx'
export function CreatorPage() { const { userId } = useParams(); const { themes } = useTheme(); const list = themes.filter(t => t.visibility === 'public' && (userId === 'blanky' ? t.creatorId === null : t.creatorId === userId)); const count = list.reduce((n, t) => n + t.ratingCount, 0); return <section data-theme-protected className="theme-page"><Link className="inline-flex items-center gap-1.5" to="/store"><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 스토어</Link><div className="mt-5 flex size-16 items-center justify-center rounded-full bg-accent-light text-2xl" aria-label="제작자 프로필">{(list[0]?.creatorName ?? 'Creator').slice(0, 1)}</div><h1 className="mt-5">{list[0]?.creatorName ?? 'Creator'}</h1><p className="my-5">등록 테마 {list.length} · 전체 다운로드 {list.reduce((n, t) => n + t.downloadCount, 0)} · {count ? '평균 평점 ' + (list.reduce((n, t) => n + t.ratingAverage * t.ratingCount, 0) / count).toFixed(1) : '평점 없음'}</p><div className="theme-grid">{list.map(t => <ThemeCard key={t.id} theme={t}/>)}</div></section>; }
