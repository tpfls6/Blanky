import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, House, Library, StickyNote } from 'lucide-react';
import type { BlankyTheme } from '@blanky/types';
import { BrandLogo } from '../../components/common/BrandLogo.tsx';
import { IconView } from '../../constants/icons.ts';
import { chromeNavLabel, CUSTOM_NAV, isRecordNav, SETTINGS_NAV, STORE_NAV, THEMES_NAV, TRASH_NAV, visibleNav } from '../../constants/navigation.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useLibrary } from '../../state/useLibrary.ts';
import { ThemeRuntime } from '../../theme/package/ThemeRuntime.tsx';
import { ThemeIcon } from '../../theme/ThemeIcon.tsx';
import { HomePage } from '../Home/HomePage.tsx';
import { DailyBoard } from '../Schedule/SchedulePage.tsx';
import { DiaryPage } from '../Diary/DiaryPage.tsx';
import { ReadingPage } from '../Reading/ReadingPage.tsx';
import { MemoPage } from '../Memo/MemoPage.tsx';

const PAGES = [
    { id: 'home', label: '홈', icon: 'home', Icon: House, Page: HomePage },
    { id: 'schedule', label: '일정', icon: 'calendar', Icon: CalendarDays, Page: DailyBoard },
    { id: 'diary', label: '일기', icon: 'diary', Icon: BookOpen, Page: DiaryPage },
    { id: 'reading', label: '독서', icon: 'reading', Icon: Library, Page: ReadingPage },
    { id: 'memo', label: '메모', icon: 'memo', Icon: StickyNote, Page: MemoPage },
] as const;

function PreviewSidebar({ current }: { current: string }) {
    const { t } = useI18n();
    const { settings, customPages } = useLibrary();
    const items = visibleNav(settings.nav);
    const row = (id: string, Icon: typeof STORE_NAV.icon, label: string) => (
        <span key={id} className="nav-link min-w-0" aria-current={current === id ? 'page' : undefined}>
            <ThemeIcon name={id} fallback={Icon} strokeWidth={1.5} aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
        </span>
    );
    return (
        <aside data-theme-slot="sidebar" className="theme-sidebar theme-preview-sidebar">
            <div className="sidebar-brand"><BrandLogo className="px-2 text-neutral-900" /></div>
            <nav className="mt-6 flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                {items.filter(item => !isRecordNav(item.id)).map(item => row(item.id, item.icon, chromeNavLabel(item.id, t, item.label)))}
                {items.some(item => isRecordNav(item.id)) ? <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.records')}</p> : null}
                {items.filter(item => isRecordNav(item.id)).map(item => row(item.id, item.icon, chromeNavLabel(item.id, t, item.label)))}
                <p className="mt-6 px-2 pb-1 text-[11px] tracking-wide text-neutral-400">{t('nav.pages')}</p>
                {customPages.map(page => (
                    <span key={page.id} className="nav-link min-w-0">
                        <IconView name={page.icon} className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">{page.name}</span>
                    </span>
                ))}
            </nav>
            <div className="mt-auto border-t border-line pt-3">
                {row('store', STORE_NAV.icon, t('nav.store'))}
                {row('themes', THEMES_NAV.icon, t('nav.themes'))}
                {row('custom', CUSTOM_NAV.icon, t('nav.custom'))}
                {row('trash', TRASH_NAV.icon, t('nav.trash'))}
                {row('settings', SETTINGS_NAV.icon, t('nav.settings'))}
            </div>
        </aside>
    );
}

export function ThemePreview({ theme, viewport = 'desktop', fill = false }: {
    theme: BlankyTheme;
    viewport?: 'desktop' | 'mobile';
    fill?: boolean;
}) {
    const [view, setView] = useState<(typeof PAGES)[number]['id']>('home');
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    const current = PAGES.find(page => page.id === view) ?? PAGES[0];
    const Page = current.Page;
    return (
        <div className={fill ? 'theme-editor-preview theme-preview-fill' : 'theme-editor-preview'}>
            <div className="theme-preview-tabs" aria-label="미리보기 화면">{PAGES.map(item => <button key={item.id} type="button" className={view === item.id ? 'chip chip-on' : 'chip'} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
            {viewport === 'mobile' && <p className="mb-2 text-xs text-neutral-500">모바일 미리보기는 반응형 시뮬레이션입니다. 네이티브 렌더링과 다를 수 있습니다.</p>}
            <ThemeRuntime inert theme={theme} className={'theme-preview preview-page preview-' + viewport}>
                <div data-theme-slot="schedule-card" hidden />
                <PreviewSidebar current={view} />
                <div className="theme-preview-page" aria-hidden="true">{ready ? <Page /> : null}</div>
            </ThemeRuntime>
        </div>
    );
}
