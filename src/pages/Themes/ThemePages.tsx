import { useAction } from './useThemeAction.ts'
export { ThemePreviewBar } from './ThemePreviewBar.tsx'
import { ColorField } from './ColorField.tsx';
import { packageFeatures } from '../../theme/package/features.ts';
import { useConfirm } from '../../state/useConfirm.ts';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TemplateStore } from '../Store/TemplateStore.tsx';
import { BUILTIN_THEMES, FONT_OPTIONS, type BlankyTheme, type ThemeConfig } from '@blanky/types';
import { useTheme } from '../../theme/context.ts';
import { ThemeRuntime } from '../../theme/package/ThemeRuntime.tsx';
import { ThemeIcon } from '../../theme/ThemeIcon.tsx';
import { House, CalendarDays } from 'lucide-react';
import { PackageEditor, ThemeImport, ThemeExportButton } from './PackageControls.tsx';
import { useSession } from '../../state/useSession.ts';
import { installTheme, removeTheme, saveTheme, setActiveTheme } from '../../services/themes/index.ts';
import { MiniCalendar } from '../../components/schedule/MiniCalendar.tsx';
import { TaskCheckbox } from '../../components/tasks/TaskCheckbox.tsx';
import { todayISO } from '../../utils/date.ts';
const price = (t: BlankyTheme) => t.pricingType === 'free' ? '무료' : '₩' + t.price.toLocaleString();
export function ThemePreview({ theme }: {
    theme: BlankyTheme;
}) { const [date, setDate] = useState(todayISO()); const [done, setDone] = useState(true); const [view, setView] = useState('전체'); return <><div className="theme-preview-tabs" aria-label="미리보기 화면">{['전체', '캘린더', '일정', '할 일', '사이드바'].map(v => <button key={v} className={view === v ? 'chip chip-on' : 'chip'} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}</div><ThemeRuntime theme={theme} className={"theme-preview preview-" + view}><aside data-theme-slot="sidebar" className="theme-sidebar"><strong>Blanky</strong><p className="nav-link mt-4" aria-current="page"><ThemeIcon name="calendar" fallback={CalendarDays}/> Schedule</p><p className="nav-link"><ThemeIcon name="home" fallback={House}/> Home</p></aside><div className="min-w-0 space-y-4 p-4"><MiniCalendar selected={date} weekStartsOn={0} events={new Set([date])} tasks={new Set()} onSelect={setDate}/><div data-theme-slot="schedule-card" className="theme-plan p-3"><strong>10:00 · 집중하는 시간</strong><p className="mt-1 text-xs"><span style={{ color: '#3c8664' }}>●</span> 업무 · 카테고리 색상 유지</p></div><div data-theme-slot="task-card" className="theme-task flex gap-2 p-3"><TaskCheckbox checked={done} label="미리보기 할 일 완료" onChange={() => setDone(!done)}/><span className={done ? 'theme-completed' : ''}>오늘의 할 일</span></div><div data-theme-slot="card" className="panel">일상에 맞는 나만의 디자인</div></div></ThemeRuntime></>; }
function ThemeCard({ theme }: {
    theme: BlankyTheme;
}) { return <article><Link to={'/store/themes/' + theme.id} className="block"><div className="theme-swatch" style={{ background: theme.config.colors.background, color: theme.config.colors.textPrimary }}>{theme.thumbnailUrl ? <img src={theme.thumbnailUrl} alt={theme.name} className="h-full w-full object-cover"/> : <><div style={{ background: theme.config.sidebar.selectedBackground }}/><div><span style={{ background: theme.config.colors.primary }}/><span style={{ background: theme.config.schedule.background }}/><span style={{ background: theme.config.colors.surface }}/></div></>}</div><h2 className="mt-3 font-medium">{theme.name}</h2><span className="text-xs">{theme.package ? "패키지 테마" : "기본 설정 테마"}</span></Link><Link className="text-sm text-neutral-500" to={'/creator/' + (theme.creatorId ?? 'blanky')}>{theme.creatorName}</Link><p className="mt-1 text-sm">{price(theme)} <span className="text-neutral-400">· {theme.ratingCount ? '★ ' + theme.ratingAverage.toFixed(1) : '평점 없음'} · {theme.downloadCount} 다운로드</span></p></article>; }
export function ThemeStore() { const { themes, error, loading } = useTheme(); const [query, setQuery] = useState(''); const [tab, setTab] = useState('추천'); const shown = themes.filter(t => t.visibility === 'public' && (tab !== '무료' || t.pricingType === 'free') && (tab !== '유료' || t.pricingType === 'paid') && (t.name + ' ' + t.description + ' ' + t.tags.join(' ')).toLowerCase().includes(query.toLowerCase())).sort((a, b) => tab === '인기' ? b.downloadCount - a.downloadCount : tab === '신규' ? b.createdAt.localeCompare(a.createdAt) : Number(a.creatorId !== null) - Number(b.creatorId !== null)); return <section data-theme-protected className="theme-page"><header className="flex flex-wrap justify-between gap-3"><div><h1>테마 스토어</h1><p className="text-sm text-neutral-500">당신의 하루를 취향에 맞게.</p></div><div className="flex gap-2"><Link className="btn btn-line" to="/settings/themes">내 테마</Link><Link className="btn btn-primary" to="/customize/theme">테마 만들기</Link></div></header><StoreTabs current="themes" /><input className="field my-5 w-full max-w-lg" aria-label="테마 검색" placeholder="이름, 설명, 태그 검색" value={query} onChange={e => setQuery(e.target.value)}/><div className="mb-6 flex flex-wrap gap-4">{['추천', '인기', '신규', '무료', '유료'].map(v => <button key={v} className={tab === v ? 'tab tab-on' : 'tab'} onClick={() => setTab(v)}>{v}</button>)}<Link className="tab" to="/settings/themes">내 테마</Link></div>{error && <p role="alert">{error}</p>}{loading ? <p role="status">테마를 불러오는 중…</p> : <div className="theme-grid">{shown.map(t => <ThemeCard key={t.id} theme={t}/>)}{!shown.length && <p>검색 결과가 없습니다.</p>}</div>}</section>; }
function StoreTabs({ current }: { current: 'themes' | 'templates' }) {
  return <div className="mt-6 flex gap-3"><Link className={current === 'themes' ? 'chip chip-on' : 'chip'} to="/store">테마</Link><Link className={current === 'templates' ? 'chip chip-on' : 'chip'} to="/store?tab=templates">템플릿</Link></div>
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
    return <section data-theme-protected className="theme-page"><Link className="text-sm" to="/store">← 스토어</Link><div className="theme-editor mt-6"><div>{t.thumbnailUrl && <img className="mb-4 w-full rounded-xl" src={t.thumbnailUrl} alt={t.name}/>}<ThemePreview theme={t}/></div><div><h1>{t.name}</h1><Link to={'/creator/' + (t.creatorId ?? 'blanky')}>{t.creatorName}</Link><p className="my-5 whitespace-pre-wrap">{t.description}</p><p>형식: {t.package ? "Package Theme · v" + t.package.manifest.version : "Config Theme"}</p><h2 className="mt-4">포함 요소</h2><p className="my-2 text-sm">{packageFeatures(t).join(" · ")}</p><p>{price(t)} · {t.downloadCount} 다운로드 · {t.ratingCount ? '★ ' + t.ratingAverage : '평점 없음'}</p><p className="my-3 text-xs">제작일 {new Date(t.createdAt).toLocaleDateString('ko-KR')}</p><div className="flex flex-wrap gap-2"><button className="btn btn-line" onClick={() => { ctx.startPreview(t); navigate('/schedule'); }}>내 일정으로 미리보기</button><button disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(async () => {
            if (owned)
                await ctx.apply(t);
            else if (user) {
                await installTheme(user.id, t);
                await ctx.refresh();
            }
        })}>{owned ? '적용하기' : t.pricingType === 'paid' ? '구매하기' : '설치하기'}</button></div>{owned && <div className="mt-3"><ThemeExportButton theme={t}/></div>}<p role="status" className="mt-3">{action.message}</p></div></div></section>;
}
export function MyThemesPage() {
    const confirm = useConfirm();
    const ctx = useTheme();
    const { user } = useSession();
    const action = useAction();
    const navigate = useNavigate();
    return <section data-theme-protected className="theme-page"><h1>내 테마</h1><button className="btn btn-ghost mt-2" disabled={action.busy} onClick={() => void action.run(async () => { if (user) {
        await setActiveTheme(user.id, null);
        await ctx.refresh();
        ctx.endPreview();
    } })}>기존 Appearance 설정 사용</button><div className="my-4 flex gap-3"><Link className="btn btn-primary" to="/customize/theme">새 테마 만들기</Link><Link className="btn btn-line" to="/store">스토어</Link></div><ThemeImport /><p role="alert">{ctx.error}</p><p role="status">{action.message}</p>{[['사용 중', ctx.themes.filter(t => t.id === ctx.active)], ['설치한 테마', ctx.themes.filter(t => !t.creatorId || ctx.installed.includes(t.id))], ['내가 만든 테마', ctx.themes.filter(t => t.creatorId === user?.id)]].map(([label, list]) => <div key={label as string} className="mt-8"><h2 className="mb-4 font-medium">{label as string}{label === '사용 중' && !ctx.active ? ' · 기존 설정 사용 중' : ''}</h2><div className="theme-grid">{(list as BlankyTheme[]).map(t => <div key={t.id}><ThemeCard theme={t}/><div className="mt-3 flex flex-wrap gap-1"><button disabled={action.busy} className="btn btn-line" onClick={() => void action.run(() => ctx.apply(t))}>적용</button><button className="btn btn-ghost" onClick={() => { ctx.startPreview(t); navigate('/schedule'); }}>미리보기</button>{t.creatorId === user?.id && <><Link className="btn btn-ghost" to={'/customize/theme?id=' + t.id}>수정</Link><Link className="btn btn-ghost" to={'/customize/theme?id=' + t.id + '&publish=1'}>스토어 등록</Link><ThemeExportButton theme={t}/><button className="btn btn-ghost" disabled={action.busy} onClick={() => void action.run(async () => { if (!user) return; await saveTheme(user.id, { ...structuredClone(t), id: crypto.randomUUID(), name: t.name.slice(0, 94) + " 복사본", visibility: "private" }); await ctx.refresh(); })}>복제</button></>}{t.creatorId && <button disabled={action.busy} className="btn btn-ghost" onClick={async () => {
                        if (await confirm(t.name + ' 테마를 삭제할까요?'))
                            void action.run(async () => {
                                if (!user)
                                    return;
                                if (ctx.active === t.id)
                                    await ctx.apply(BUILTIN_THEMES[0]);
                                await removeTheme(user.id, t);
                                await ctx.refresh();
                            });
                    }}>삭제</button>}</div></div>)}</div></div>)}</section>;
}
const groups: Record<string, string> = { colors: '기본 색상', calendar: '캘린더', schedule: '일정', task: '할 일', card: '카드', sidebar: '사이드바', typography: '폰트' };
const labels: Record<string, string> = { background: '배경', surface: '보조 배경', primary: 'Primary', accent: 'Accent', textPrimary: '기본 텍스트', textSecondary: '보조 텍스트', border: '테두리', todayColor: '오늘 표시', selectedColor: '선택 날짜', weekdayColor: '평일', weekendColor: '주말', hoverColor: 'Hover', textColor: '텍스트', borderColor: '테두리', borderRadius: '모서리', opacity: '투명도', shadow: '그림자', checkboxColor: '체크박스 색상', checkboxStyle: '체크박스 모양', completedStyle: '완료 스타일', completedLineColor: '완료선', selectedBackground: '선택 메뉴 배경', iconColor: '아이콘 색상', headingFont: '제목 폰트', bodyFont: '본문 폰트' };
export function ThemeEditorPage() {
    const [params] = useSearchParams();
    const ctx = useTheme();
    const { user } = useSession();
    const original = ctx.themes.find(t => t.id === params.get('id'));
    if (ctx.loading)
        return <p className="p-6">불러오는 중…</p>;
    if (params.get('id') && (!original || original.creatorId !== user?.id))
        return <p className="p-6">본인이 만든 테마만 수정할 수 있습니다.</p>;
    return <ThemeEditor key={original?.id ?? 'new'} original={original} publish={params.has('publish')}/>;
}
function ThemeEditor({ original, publish }: {
    original?: BlankyTheme;
    publish: boolean;
}) {
    const { user } = useSession();
    const ctx = useTheme();
    const action = useAction();
    const [draft, setDraft] = useState<BlankyTheme>(() => original ? structuredClone(original) : ({ ...structuredClone(BUILTIN_THEMES[0]), id: crypto.randomUUID(), creatorId: user!.id, creatorName: user!.nickname || user!.name, name: '나의 테마', visibility: 'private', createdAt: new Date().toISOString() }));
    const [tab, setTab] = useState('색상 테마');
    const [importPreview, setImportPreview] = useState<BlankyTheme | null>(null);
    const [saved, setSaved] = useState(() => structuredClone(draft));
    const [registration, setRegistration] = useState(publish);
    const change = (group: string, key: string, value: string | number) => setDraft(t => {
        const config = structuredClone(t.config);
        const target = config[group as keyof ThemeConfig] as unknown as Record<string, string | number>;
        const previous = target[key];
        target[key] = value;
        if (group === 'colors') {
            const linked: Record<string, string[]> = {
                background: ['calendar.background', 'sidebar.background'],
                surface: ['card.background', 'schedule.background', 'task.background'],
                primary: ['calendar.todayColor', 'calendar.selectedColor', 'task.checkboxColor', 'sidebar.selectedBackground'],
                textPrimary: ['schedule.textColor', 'sidebar.textColor', 'calendar.weekdayColor'],
                textSecondary: ['sidebar.iconColor'], border: ['schedule.borderColor', 'card.borderColor'],
            };
            for (const path of linked[key] ?? []) {
                const [g, k] = path.split('.');
                const component = config[g as keyof ThemeConfig] as unknown as Record<string, string | number>;
                if (component[k] === previous) component[k] = value;
            }
        }
        return { ...t, config };
    });
    const save = async (apply = false) => {
        if (!user)
            return;
        const next = await saveTheme(user.id, { ...draft, visibility: draft.visibility });
        setDraft(next);
        setSaved(structuredClone(next));
        await ctx.refresh();
        if (apply)
            await ctx.apply(next);
    };
    return <section data-theme-protected className="theme-page theme-customizer"><header className="theme-editor-heading"><div><h1>나만의 테마</h1><p>색상과 이미지로 Blanky를 꾸며 보세요.</p></div><span>사용 중 · {ctx.themes.find(t => t.id === ctx.active)?.name ?? "기본 테마"}</span></header><div className="theme-editor mt-6"><div className="space-y-4"><label className="block text-sm">테마 이름<input className="field mt-1 w-full" maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><div className="theme-editor-tabs" role="tablist" aria-label="색상 테마">{["색상 테마", "이미지 꾸미기", "테마 가져오기"].map(v => <button key={v} role="tab" aria-selected={tab === v} className={tab === v ? "tab tab-on" : "tab"} onClick={() => { setTab(v); setImportPreview(null); }}>{v}</button>)}</div>{tab === "색상 테마" && <>{Object.entries(groups).map(([group, title]) => <details key={group} open={group === 'colors'} className="border-b border-line pb-3"><summary className="cursor-pointer text-sm font-medium">{title}</summary><div className="mt-3 grid grid-cols-2 gap-3">{Object.entries(draft.config[group as keyof ThemeConfig]).map(([key, value]) => { const options = key === 'shadow' ? ['none', '0 4px 16px #00000014', '0 8px 24px #00000028'] : key.endsWith('Font') ? [...FONT_OPTIONS] : key === 'checkboxStyle' ? ['square', 'round', 'circle'] : key === 'completedStyle' ? ['strike', 'dim', 'plain'] : null; return <div key={key} className="text-xs">{(options || typeof value === 'number') && (labels[key] ?? key)}{options ? <select className="field mt-1 w-full" value={value} onChange={e => change(group, key, e.target.value)}>{options.map(v => <option key={v}>{v}</option>)}</select> : typeof value === "string" ? <ColorField label={labels[key] ?? key} value={value} onChange={v => change(group, key, v)}/> : <input className="field mt-1 w-full" type={typeof value === 'number' ? 'number' : 'color'} min={key === 'opacity' ? .3 : 0} max={key === 'opacity' ? 1 : 32} step={key === 'opacity' ? .1 : 1} value={value} onChange={e => change(group, key, typeof value === 'number' ? Number(e.target.value) : e.target.value)}/>}</div>; })}</div></details>)}<label className="block text-sm">아이콘<select className="field ml-3" value={draft.config.iconPack} onChange={e => setDraft({ ...draft, config: { ...draft.config, iconPack: e.target.value } })}>{['default', 'rounded', 'outline', 'filled'].map(v => <option key={v}>{v}</option>)}</select></label></>}{tab === "이미지 꾸미기" && <PackageEditor draft={draft} setDraft={setDraft}/ >}{tab === "테마 가져오기" && <div className="space-y-4"><h2>테마 파일 관리</h2><p className="text-sm text-neutral-500">JSON 또는 ZIP을 확인한 후 내 테마에 저장하세요.</p><ThemeImport onPreview={setImportPreview}/><ThemeExportButton theme={draft}/><Link className="btn btn-ghost" to="/settings/themes">저장한 테마 관리</Link></div>}</div><div><p className="mb-3 text-sm text-neutral-500">실시간 미리보기</p><ThemePreview theme={importPreview ?? draft}/><div className="mt-5 flex flex-wrap gap-2"><button className="btn btn-line" onClick={() => setDraft(t => ({ ...t, config: structuredClone(BUILTIN_THEMES[0].config), package: undefined, themeType: 'basic' }))}>기본값 복원</button><button className="btn btn-line" onClick={() => setDraft(structuredClone(saved))}>취소</button><button disabled={action.busy} className="btn btn-line" onClick={() => void action.run(() => save())}>저장</button><button disabled={action.busy} className="btn btn-primary" onClick={() => void action.run(() => save(true))}>저장하고 적용하기</button><button className="btn btn-line" onClick={() => setRegistration(!registration)}>스토어 등록</button><ThemeExportButton theme={draft}/></div><p role="status" className="mt-3">{action.message}</p>{registration && <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void action.run(() => save(false)); }}><h2>스토어 등록 정보</h2><label className="block text-sm">설명<textarea className="field w-full" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><label className="block text-sm">대표 이미지 URL (HTTPS)<input type="url" pattern="https://.*" className="field w-full" value={draft.thumbnailUrl} onChange={e => setDraft({ ...draft, thumbnailUrl: e.target.value })}/></label><label className="block text-sm">카테고리<input className="field w-full" value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}/></label><label className="block text-sm">태그 (쉼표로 구분)<input className="field w-full" value={draft.tags.join(',')} onChange={e => setDraft({ ...draft, tags: e.target.value.split(',').map(v => v.trim()).filter(Boolean) })}/></label><label className="block text-sm">공개 여부<select className="field ml-2" value={draft.visibility} onChange={e => setDraft({ ...draft, visibility: e.target.value as 'public' | 'private' })}><option value="private">비공개</option><option value="public">공개</option></select></label><select aria-label="판매 방식" className="field" value={draft.pricingType} onChange={e => setDraft({ ...draft, pricingType: e.target.value as 'free' | 'paid', price: 0 })}><option value="free">무료</option><option value="paid">유료</option></select><label className="block text-sm">가격 (원)<input type="number" min={0} step={1} disabled={draft.pricingType === 'free'} className="field ml-2" value={draft.price} onChange={e => setDraft({ ...draft, price: Number(e.target.value) })}/></label><button disabled={action.busy} className="btn btn-primary">등록 정보 저장</button></form>}</div></div></section>;
}
export function CreatorPage() { const { userId } = useParams(); const { themes } = useTheme(); const list = themes.filter(t => t.visibility === 'public' && (userId === 'blanky' ? t.creatorId === null : t.creatorId === userId)); const count = list.reduce((n, t) => n + t.ratingCount, 0); return <section data-theme-protected className="theme-page"><Link to="/store">← 스토어</Link><div className="mt-5 flex size-16 items-center justify-center rounded-full bg-accent-light text-2xl" aria-label="제작자 프로필">{(list[0]?.creatorName ?? 'Creator').slice(0, 1)}</div><h1 className="mt-5">{list[0]?.creatorName ?? 'Creator'}</h1><p className="my-5">등록 테마 {list.length} · 전체 다운로드 {list.reduce((n, t) => n + t.downloadCount, 0)} · {count ? '평균 평점 ' + (list.reduce((n, t) => n + t.ratingAverage * t.ratingCount, 0) / count).toFixed(1) : '평점 없음'}</p><div className="theme-grid">{list.map(t => <ThemeCard key={t.id} theme={t}/>)}</div></section>; }
