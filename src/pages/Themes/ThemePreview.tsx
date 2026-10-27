import { useState } from 'react';
import { House, CalendarDays } from 'lucide-react';
import type { BlankyTheme } from '@blanky/types';
import { ThemeRuntime } from '../../theme/package/ThemeRuntime.tsx';
import { ThemeIcon } from '../../theme/ThemeIcon.tsx';
import { MiniCalendar } from '../../components/schedule/MiniCalendar.tsx';
import { TaskCheckbox } from '../../components/tasks/TaskCheckbox.tsx';
import { EmptyState } from '../../components/common/EmptyState.tsx';
import { todayISO } from '../../utils/date.ts';
export function ThemePreview({ theme, viewport = 'desktop' }: {
    theme: BlankyTheme;
    viewport?: 'desktop' | 'mobile';
}) {
    const [date, setDate] = useState(todayISO());
    const [done, setDone] = useState(true);
    const [view, setView] = useState('전체');
    return <>
        <div className="theme-preview-tabs" aria-label="미리보기 화면">{['전체', '캘린더', '일정', '할 일', '사이드바'].map(item => <button key={item} className={view === item ? 'chip chip-on' : 'chip'} aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}</div>
        {viewport === 'mobile' && <p className="mb-2 text-xs text-neutral-500">모바일 미리보기는 반응형 시뮬레이션입니다. 네이티브 렌더링과 다를 수 있습니다.</p>}
        <ThemeRuntime theme={theme} className={'theme-preview preview-' + view + ' preview-' + viewport}>
            <aside data-theme-slot="sidebar" className="theme-sidebar">
                <strong>Blanky</strong>
                <p className="nav-link mt-4" aria-current="page"><ThemeIcon name="calendar" fallback={CalendarDays} /> Schedule</p>
                <p className="nav-link"><ThemeIcon name="home" fallback={House} /> Home</p>
            </aside>
            <div className="min-w-0 space-y-4 p-4">
                <header data-theme-slot="page-header" className="theme-preview-header"><strong>Today</strong><span>미리보기</span></header>
                <MiniCalendar selected={date} weekStartsOn={0} events={new Set([date])} tasks={new Set()} onSelect={setDate} />
                <div data-theme-slot="schedule-card" className="theme-plan p-3"><strong>10:00 · 집중하는 시간</strong><p className="mt-1 text-xs"><span style={{ color: '#3c8664' }}>●</span> 업무 · 카테고리 색상 유지</p></div>
                <div data-theme-slot="task-card" className="theme-task flex gap-2 p-3"><TaskCheckbox checked={done} label="미리보기 할 일 완료" onChange={() => setDone(!done)} /><span className={done ? 'theme-completed' : ''}>오늘의 할 일</span></div>
                <div data-theme-slot="card" className="panel">일상에 맞는 나만의 디자인</div>
                <input data-theme-slot="input" className="field w-full" readOnly value="입력창" aria-label="입력창 미리보기" />
                <button data-theme-slot="button-primary" type="button" className="btn btn-primary">버튼</button>
                <EmptyState>기록이 없습니다</EmptyState>
            </div>
        </ThemeRuntime>
    </>;
}
