import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, House, Library, StickyNote } from 'lucide-react';
import type { BlankyTheme } from '@blanky/types';
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
            <ThemeRuntime theme={theme} className={'theme-preview preview-page preview-' + viewport}>
                <div data-theme-slot="schedule-card" hidden />
                {fill ? null : <aside data-theme-slot="sidebar" className="theme-sidebar">
                    <strong>Blanky</strong>
                    {PAGES.map(item => <button type="button" key={item.id} className="nav-link mt-2 w-full text-left" aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}><ThemeIcon name={item.icon} fallback={item.Icon} /> {item.label}</button>)}
                </aside>}
                <div className="theme-preview-page" aria-hidden="true">{ready ? <Page /> : null}</div>
            </ThemeRuntime>
        </div>
    );
}
