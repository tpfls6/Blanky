import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { READING_STATUS, sameBook } from '@blanky/types';
import type { BookMetadata, BookPatch, Highlight, HighlightInput, LibraryBook, ReadingLibrary, ReadingNote, ReadingStatus, Shelf, ShelfInput } from '@blanky/types';
import type { ReadingRepository } from '@blanky/api';
import { readingService, importLegacyReading } from '../../services/reading/index.ts';
import { isSupabaseConfigured } from '../../services/supabase/client.ts';
import { useSession } from '../../state/useSession.ts';
import { useLibrary } from '../../state/useLibrary.ts';
import { PageCanvas } from '../../features/pages/PageCanvas.tsx';
import { resolveLayout } from '../../features/pages/layout.ts';
import { GripVertical } from 'lucide-react';
import { ReadingIcon, ReadingIconPicker } from './ReadingIconPicker.tsx';
import { StarRating } from './StarRating.tsx';
import { todayISO } from '../../utils/date.ts';
import { useReadingDrag } from './useReadingDrag.ts';
import { bookCategories, categoryLabel, matchesCategory, moveShelf, UNCLASSIFIED } from './readingInteractions.ts';
import './reading.css';
const ReadingErrorContext = createContext('');
const empty: ReadingLibrary = { books: [], shelves: [], memberships: [] };
const tags = (value: string) => [...new Set(value.split(/[,，#\s]+/).map(t => t.trim()).filter(Boolean))];
const shelfColor = (name: string) => /^#[0-9a-f]{6}$/i.test(name) ? name : 'var(--blanky-colors-' + (name === 'textSecondary' ? 'text-secondary' : name) + ')';
function Cover({ book }: {
    book: BookMetadata;
}) { const [failed, setFailed] = useState(false); return <div className="reading-book-cover" data-theme-slot="reading-book-cover">{book.cover_url && !failed ? <img draggable={false} src={book.cover_url} alt={book.title + ' 표지'} loading="lazy" onError={() => setFailed(true)}/> : <span>{book.title}</span>}</div>; }
function Modal({ title, close, children }: {
    title: string;
    close: () => void;
    children: ReactNode;
}) {
    const error = useContext(ReadingErrorContext);
    const ref = useRef<HTMLDivElement>(null), onClose = useRef(close);
    useEffect(() => { onClose.current = close; }, [close]);
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; const el = ref.current; el?.querySelector<HTMLElement>('input,button,textarea,select')?.focus(); const listener = (e: KeyboardEvent) => { if (e.key === 'Escape')
        onClose.current(); if (e.key === 'Tab') {
        const controls = el?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,a[href]');
        if (!controls?.length)
            return;
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    } }; document.addEventListener('keydown', listener); return () => { document.removeEventListener('keydown', listener); previous?.focus(); }; }, []);
    return <div className="reading-modal-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="reading-modal"><header><h2>{title}</h2><button type="button" className="btn btn-ghost" onClick={close} aria-label="닫기">×</button></header>{error ? <p role="alert" className="reading-error">{error}</p> : null}{children}</div></div>;
}
export function ReadingPage({ editing = false }: {
    editing?: boolean;
}) {
    const { user } = useSession();
    const { pageLayouts, setPageLayout, books, logs } = useLibrary();
    return <PageCanvas pageId="reading" editing={editing} blocks={resolveLayout('reading', pageLayouts.reading)} onChange={blocks => setPageLayout('reading', blocks)} render={block => block.type === 'page-body' && user ? <ReadingWorkspace key={user.id} userId={user.id} legacyBooks={books} legacyLogs={logs}/> : null}/>;
}
function ReadingWorkspace({ userId, legacyBooks, legacyLogs }: {
    userId: string;
    legacyBooks: ReturnType<typeof useLibrary>['books'];
    legacyLogs: ReturnType<typeof useLibrary>['logs'];
}) {
    const repo = useMemo(() => readingService(userId), [userId]);
    const { bookId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<ReadingLibrary>(empty), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [search, setSearch] = useState(false), [shelfEditor, setShelfEditor] = useState<Shelf | 'new' | null>(null), [confirm, setConfirm] = useState<(() => Promise<void>) | null>(null);
    const [category, setCategory] = useState('all');
    const [notice, setNotice] = useState('');
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const refresh = async () => { const next = await repo.getMyBooks(); if (alive.current)
        setData(next); };
    useEffect(() => { let cancelled = false; (async () => { const previous = await repo.getMyBooks(); if (!cancelled)
        setData(previous); await importLegacyReading(userId, legacyBooks, legacyLogs); const next = await repo.getMyBooks(); if (!cancelled) {
        setData(next);
        setError('');
    } })().catch(e => { if (!cancelled)
        setError(e instanceof Error ? e.message : '서재를 불러오지 못했습니다.'); }).finally(() => { if (!cancelled)
        setLoading(false); }); return () => { cancelled = true; }; }, [repo, userId, legacyBooks, legacyLogs]);
    const act = async (fn: () => Promise<unknown>) => { if (busy)
        return; setBusy(true); setError(''); try {
        await fn();
        await refresh();
        return true;
    }
    catch (e) {
        if (alive.current)
            setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
        return false;
    }
    finally {
        if (alive.current)
            setBusy(false);
    } };
    const reorder = (ids: string[]) => void act(() => repo.reorderShelves(ids));
    const drag = useReadingDrag((item, target) => {
        if (item.kind === 'shelf') reorder(moveShelf(data.shelves, item.id, target).map(s => s.id));
        else if (data.books.some(b => b.id === item.id) && data.shelves.some(s => s.id === target)) {
            void act(() => repo.addBookToShelf(item.id, target)).then(ok => { if (ok) setNotice('책장에 추가했습니다.'); });
        }
    }, busy);
    const categories = [...new Set(data.books.flatMap(bookCategories))].sort((a,b) => a.localeCompare(b));
    const selected = data.shelves.find(s => s.id === filter);
    const filtered = data.books.filter(b => (filter === 'all' || (filter in READING_STATUS ? b.reading_status === filter : data.memberships.some(m => m.shelf_id === filter && m.user_book_id === b.id))) && (status === 'all' || b.reading_status === status) && matchesCategory(b, category) && (b.book.title + ' ' + b.book.author).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const current = data.books.find(b => b.id === bookId);
    return <ReadingErrorContext.Provider value={error}><div className="reading-page" data-theme-slot="reading-page">
 <header className="reading-heading"><div><h1>Reading</h1><p>읽고, 기억하고, 나만의 책장에 담아요.</p></div><button className="btn btn-primary" onClick={() => setSearch(true)}>+ 책 추가 · 검색</button></header>
 {!isSupabaseConfigured ? <p className="reading-muted">로컬 모드 · 이 브라우저에 저장됩니다.</p> : null}
 {error ? <div role="alert" className="reading-error">{error}<button className="btn btn-ghost" disabled={busy} onClick={() => void act(() => importLegacyReading(userId, legacyBooks, legacyLogs))}>다시 시도</button></div> : null}
 {loading ? <p role="status">서재를 불러오고 있어요…</p> : <div className="reading-layout">
 <aside className="reading-sidebar" data-theme-slot="reading-sidebar" aria-label="독서 책장">
 {[['all', '전체'], ...Object.entries(READING_STATUS)].map(([id, label]) => <button key={id} className={filter === id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(id); navigate('/reading'); }}>{label}<span>{id === 'all' ? data.books.length : data.books.filter(b => b.reading_status === id).length}</span></button>)}
 <div className="reading-shelf-heading">내 책장<button className="btn btn-ghost" onClick={() => setShelfEditor('new')} aria-label="새 책장">+</button></div>
 {data.shelves.map((s, index) => <div className={'reading-shelf' + (drag.target===s.id?' reading-drop-target':'') + (drag.active?.id===s.id?' reading-dragging':'')} data-theme-slot="reading-shelf" data-reading-shelf-id={s.id} key={s.id}>
 <button type="button" className="reading-drag-handle" disabled={busy} aria-label={s.name+' 책장 순서 변경'} title="드래그로 순서 변경 · 방향키로 이동" onPointerDown={e=>drag.start(e,{kind:'shelf',id:s.id,label:s.name})} onClick={drag.click} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const next=index+(e.key==='ArrowUp'?-1:1);if(data.shelves[next])reorder(moveShelf(data.shelves,s.id,data.shelves[next].id).map(s=>s.id))}}}><GripVertical size={14}/></button>
 <button className={filter === s.id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(s.id); navigate('/reading'); }}><span style={{color:shelfColor(s.color)}}><ReadingIcon value={s.icon}/></span>{s.name}<span>{data.memberships.filter(m => m.shelf_id === s.id).length}</span></button><button className="reading-edit" aria-label={s.name + ' 책장 편집'} onClick={() => setShelfEditor(s)}>⋯</button></div>)}
 {!data.shelves.length ? <p className="reading-muted">좋았던 책, 인생책, 개발…<br />원하는 책장을 만들어 보세요.</p> : null}
 </aside>
 <main className="reading-content">
 {bookId ? (current ? <BookDetail key={current.id} book={current}  repo={repo} busy={busy} act={act} remove={() => setConfirm(() => async () => { await repo.removeBook(current.id); navigate('/reading'); })}/> : <p>책을 찾을 수 없습니다. <Link to="/reading">서재로 돌아가기</Link></p>) : <>
 <div className="reading-list-heading"><div><h2>{selected ? <><ReadingIcon value={selected.icon}/> {selected.name}</> : filter === 'all' ? '내 독서 라이브러리' : READING_STATUS[filter as ReadingStatus]}</h2>{selected?.description ? <p>{selected.description}</p> : null}<p className="reading-muted">{filtered.length}권 · 최근 추가순</p></div></div>
 <div className="reading-toolbar"><input className="field" aria-label="내 서재 검색" placeholder="내 서재에서 제목, 저자 검색" value={query} onChange={e => setQuery(e.target.value)}/><select className="field" aria-label="독서 상태 필터" value={status} onChange={e => setStatus(e.target.value)}><option value="all">모든 상태</option>{Object.entries(READING_STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select className="field" aria-label="책 종류 필터" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">모든 종류</option>{categories.map(c=><option value={c} key={c}>{categoryLabel(c)}</option>)}<option value={UNCLASSIFIED}>분류 없음</option></select><button type="button" className="btn btn-line" disabled={busy} onClick={()=>void act(async()=>{const result=await repo.refreshCategories();setNotice(result.updated+'권의 분류를 확인했습니다.'+(result.remaining?' '+result.remaining+'권이 남았습니다. 다시 눌러 이어서 가져오세요.':''))})}>분류 정보 불러오기</button></div>
 {notice?<p role="status" className="reading-muted">{notice}</p>:null}
 <div className="reading-book-grid" data-theme-slot="reading-book-grid">{filtered.map(b => <article className="reading-book-card" data-theme-slot="reading-book-card" key={b.id} draggable={false} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(filter==='all'&&e.pointerType!=='touch')drag.start(e,{kind:'book',id:b.id,label:b.book.title})}} onClick={drag.click} data-reading-draggable={filter==='all'?'true':undefined}>{filter==='all'?<button type="button" className="reading-book-drag-handle" aria-label={b.book.title+' 책장에 드래그'} onPointerDown={e=>{e.stopPropagation();drag.start(e,{kind:'book',id:b.id,label:b.book.title})}}><GripVertical size={16}/></button>:null}<Link to={'/reading/'+b.id}><Cover book={b.book}/><h3>{b.book.title}</h3><p>{b.book.author || '저자 미상'}</p><p className="reading-book-status" data-status={b.reading_status}><span className="reading-status-dot" aria-hidden="true"/>{READING_STATUS[b.reading_status]}</p></Link></article>)}</div>
 {!filtered.length ? <div className="reading-empty"><h3>책을 담을 자리가 준비됐어요.</h3><p>검색해서 첫 책을 추가하거나 다른 책장을 선택해 보세요.</p><button className="btn btn-primary" onClick={() => setSearch(true)}>책 검색</button></div> : null}
 </>}
 </main></div>}
 {search ? <SearchModal repo={repo} data={data} defaultShelf={selected?.id} close={() => setSearch(false)} add={async (book, status, shelves) => { const ok = await act(async () => { const id = await repo.addBook(book, status, shelves); if (id && status === 'reading') { const saved = await repo.getUserBook(id); if (saved.reading_status === 'reading' && !saved.started_at) await repo.updateBook(id, { started_at: todayISO() }); } }); return !!ok; }}/> : null}
 {shelfEditor ? <ShelfModal shelf={shelfEditor === 'new' ? null : shelfEditor} order={data.shelves.length} busy={busy} close={() => setShelfEditor(null)} save={async (input) => { if (await act(() => shelfEditor === 'new' ? repo.createShelf(input) : repo.updateShelf(shelfEditor.id, input)))
        setShelfEditor(null); }} remove={shelfEditor === 'new' ? undefined : () => { const id = shelfEditor.id; setShelfEditor(null); setConfirm(() => async () => { await repo.deleteShelf(id); setFilter('all'); }); }}/> : null}
 {confirm ? <Modal title="삭제할까요?" close={() => setConfirm(null)}><p>책장 삭제는 책을 서재에 유지합니다. 책 삭제는 해당 문장·메모도 함께 삭제합니다.</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void act(confirm).then(ok => { if (ok)
        setConfirm(null); })}>삭제</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>취소</button></div></Modal> : null}
 {drag.active?<div className="reading-drag-preview" style={{left:drag.active.x+14,top:drag.active.y+14}} aria-hidden="true">{drag.active.kind==='book'?'책장에 추가':'책장 순서 변경'} · {drag.active.label}</div>:null}
 </div></ReadingErrorContext.Provider>;
}
function ShelfModal({ shelf, order, busy, close, save, remove }: {
    shelf: Shelf | null;
    order: number;
    busy: boolean;
    close: () => void;
    save: (input: ShelfInput) => Promise<void>;
    remove?: () => void;
}) {
    const [draft, setDraft] = useState<ShelfInput>(shelf ?? { name: '', description: '', icon: '📚', color: 'primary', sort_order: order });
    return <Modal title={shelf ? '책장 편집' : '새 책장'} close={close}><form className="reading-form" onSubmit={e => { e.preventDefault(); void save({ ...draft, name: draft.name.trim() }); }}><label>책장 이름<input required maxLength={100} className="field" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>설명<textarea className="field" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><div><p className="reading-muted">아이콘</p><ReadingIconPicker value={draft.icon} onChange={icon=>setDraft(current=>({...current,icon}))} color={draft.color} onColor={color=>setDraft(current=>({...current,color}))}/></div><div className="reading-actions"><button className="btn btn-primary" disabled={busy || !draft.name.trim()}>{shelf ? '저장' : '만들기'}</button><button type="button" className="btn btn-ghost" onClick={close}>취소</button>{remove ? <button type="button" className="btn btn-ghost" onClick={remove}>책장 삭제</button> : null}</div></form></Modal>;
}
function SearchModal({ repo, data, defaultShelf, close, add }: {
    repo: ReadingRepository;
    data: ReadingLibrary;
    defaultShelf?: string;
    close: () => void;
    add: (b: BookMetadata, s: ReadingStatus, ids: string[]) => Promise<boolean>;
}) {
    const [query, setQuery] = useState(''), [results, setResults] = useState<BookMetadata[]>([]), [selected, setSelected] = useState<BookMetadata | null>(null), [status, setStatus] = useState<ReadingStatus>('want'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false);
    const request = useRef(0);
    useEffect(() => () => { request.current++; }, []);
    return <Modal title={selected ? '내 서재에 책 추가' : '책 검색'} close={close}>{selected ? <><div className="reading-result"><Cover book={selected}/><div><h3>{selected.title}</h3><p>{selected.author}</p></div></div><label className="reading-form">독서 상태<select className="field" value={status} onChange={e => setStatus(e.target.value as ReadingStatus)}>{Object.entries(READING_STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="reading-actions"><button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); if (await add(selected, status, defaultShelf ? [defaultShelf] : [])) {
        setSelected(null);
    } setBusy(false); }}>{busy ? '추가 중…' : '내 서재에 추가'}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(null)}>검색 결과</button></div></> : <><form className="reading-toolbar" onSubmit={async (e) => { e.preventDefault(); const id = ++request.current; setBusy(true); setError(''); setSearched(false); setResults([]); try {
        const books = await repo.searchBooks(query);
        if (id === request.current) {
            setResults(books);
            setSearched(true);
        }
    }
    catch (e) {
        if (id === request.current)
            setError(e instanceof Error ? e.message : '검색 실패');
    }
    finally {
        if (id === request.current)
            setBusy(false);
    } }}><input className="field" required maxLength={200} aria-label="책 제목, 저자, ISBN 검색" placeholder="책 제목, 저자, ISBN 검색…" value={query} onChange={e => setQuery(e.target.value)}/><button className="btn btn-primary" disabled={busy}>검색</button></form>{busy ? <p role="status">책을 찾고 있어요…</p> : null}{error ? <p role="alert">{error}</p> : null}{searched && !results.length ? <p>검색 결과가 없습니다. 다른 제목이나 ISBN으로 검색해 주세요.</p> : null}<div className="reading-results">{results.map(b => { const exists = data.books.some(x => sameBook(x.book, b)); return <article className="reading-result" key={b.external_id}><Cover book={b}/><div><h3>{b.title}</h3><p>{b.author}</p><p className="reading-muted">{b.publisher} {b.published_date ? '· ' + b.published_date : ''}</p><button className="btn btn-line" disabled={exists} onClick={() => setSelected(b)}>{exists ? '내 서재에 있음' : '내 서재에 추가'}</button></div></article>; })}</div></>}</Modal>;
}
function BookDetail({ book, repo, busy, act, remove }: {
    book: LibraryBook;
    repo: ReadingRepository;
    busy: boolean;
    act: (fn: () => Promise<unknown>) => Promise<boolean | undefined>;
    remove: () => void;
}) {
    const [tab, setTab] = useState('기록'), [highlights, setHighlights] = useState<Highlight[]>([]), [notes, setNotes] = useState<ReadingNote[]>([]), [error, setError] = useState(''), [entry, setEntry] = useState<Highlight | ReadingNote | 'new' | null>(null), [pageSort, setPageSort] = useState(false), [confirm, setConfirm] = useState<Highlight | ReadingNote | null>(null);
    const load = async () => { const [h, n] = await Promise.all([repo.getHighlights(book.id), repo.getReadingNotes(book.id)]); setHighlights(h); setNotes(n); };
    useEffect(() => { let alive = true; Promise.all([repo.getHighlights(book.id), repo.getReadingNotes(book.id)]).then(([h, n]) => { if (alive) {
        setHighlights(h);
        setNotes(n);
    } }).catch(e => { if (alive)
        setError(String(e.message)); }); return () => { alive = false; }; }, [repo, book.id]);
    const entryAct = async (fn: () => Promise<unknown>) => { if (await act(async () => { await fn(); await load(); })) {
        setEntry(null);
        setConfirm(null);
    } };
    return <article className="reading-detail" data-theme-slot="reading-detail"><Link className="reading-back" to="/reading">← 내 서재</Link><header className="reading-detail-heading"><Cover book={book.book}/><div><h2>{book.book.title}</h2><p>{book.book.author}</p><p className="reading-muted">{book.book.publisher}</p><p>{READING_STATUS[book.reading_status]}</p><StarRating value={book.rating}/></div></header><div role="tablist" aria-label="책 상세" className="reading-tabs">{['기록', '문장', '메모', '정보'].map(t => <button role="tab" id={'reading-tab-' + t} aria-controls="reading-tab-panel" aria-selected={tab === t} key={t} onClick={() => { setTab(t); setEntry(null); }}>{t}</button>)}</div>{error ? <p role="alert">{error}</p> : null}<section role="tabpanel" id="reading-tab-panel" aria-labelledby={'reading-tab-' + tab}>
 {tab === '기록' ? <RecordForm key={book.id} book={book} busy={busy} save={patch => act(() => repo.updateBook(book.id, patch))}/> : tab === '정보' ? <div className="reading-information"><dl>{[['제목', book.book.title], ['저자', book.book.author], ['출판사', book.book.publisher], ['출판일', book.book.published_date], ['ISBN 13', book.book.isbn13], ['ISBN 10', book.book.isbn10], ['종류', bookCategories(book).map(categoryLabel).join(', ') || '분류 없음'], ['출처', book.book.external_source]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '정보 없음'}</dd></div>)}</dl><p className="reading-prose">{book.book.description?.replace(/<[^>]*>/g, '') || '책 설명이 없습니다.'}</p></div> : <><div className="reading-list-heading"><h3>{tab === '문장' ? '인상 깊은 문장' : '독서 메모'}</h3>{tab === '문장' ? <select aria-label="문장 정렬" className="field" value={pageSort ? 'page' : 'time'} onChange={e => setPageSort(e.target.value === 'page')}><option value="time">최근 저장순</option><option value="page">페이지순</option></select> : null}<button className="btn btn-primary" disabled={busy} onClick={() => setEntry('new')}>+ {tab} 추가</button></div>{(tab === '문장' ? (pageSort ? [...highlights].sort((a, b) => (a.page_number ?? Infinity) - (b.page_number ?? Infinity)) : highlights) : notes).map(item => <article className={tab === '문장' ? 'reading-highlight' : 'reading-note'} data-theme-slot={tab === '문장' ? 'reading-highlight' : 'reading-note'} key={item.id}>{'page_number' in item && typeof item.page_number === 'number' && item.page_number ? <p className="reading-muted">p.{item.page_number}</p> : null}<p className="reading-prose">{item.content}</p>{'note' in item && typeof item.note === 'string' && item.note ? <p className="reading-prose reading-muted">{item.note}</p> : null}<p className="reading-muted">{item.tags.map(t => '#' + t).join(' ')} · {new Date(item.created_at).toLocaleDateString('ko-KR')}{item.updated_at !== item.created_at ? ' · 수정 ' + new Date(item.updated_at).toLocaleDateString('ko-KR') : ''}</p><div className="reading-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setEntry(item)}>수정</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(item)}>삭제</button></div></article>)}{!(tab === '문장' ? highlights : notes).length ? <p className="reading-empty">마음에 남은 {tab === '문장' ? '문장' : '생각'}을 기록해 보세요.</p> : null}</>}
 </section><button className="btn btn-ghost reading-remove" disabled={busy} onClick={remove}>서재에서 책 삭제</button>
 {entry ? <EntryModal key={typeof entry === 'string' ? 'new' : entry.id} kind={tab === '문장' ? 'highlight' : 'note'} entry={entry === 'new' ? null : entry} busy={busy} close={() => setEntry(null)} save={async (input) => { if (tab === '문장') {
        const h = input as HighlightInput;
        await entryAct(() => entry === 'new' ? repo.createHighlight(book.id, h) : repo.updateHighlight(entry.id, h));
    }
    else {
        await entryAct(() => entry === 'new' ? repo.createReadingNote(book.id, input) : repo.updateReadingNote(entry.id, input));
    } }}/> : null}
 {confirm ? <Modal title={tab + ' 삭제'} close={() => setConfirm(null)}><p>이 기록을 삭제할까요?</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void entryAct(() => 'source_type' in confirm ? repo.deleteHighlight(confirm.id) : repo.deleteReadingNote(confirm.id))}>삭제</button><button className="btn btn-ghost" onClick={() => setConfirm(null)}>취소</button></div></Modal> : null}
 </article>;
}
function RecordForm({ book, busy, save }: {
    book: LibraryBook;
    busy: boolean;
    save: (patch: BookPatch) => Promise<unknown>;
}) {
    const [draft, setDraft] = useState<BookPatch>({ reading_status: book.reading_status, rating: book.rating, started_at: book.started_at, finished_at: book.finished_at, review: book.review, tags: book.tags }), [tagText, setTagText] = useState(book.tags.join(', ')), [saved, setSaved] = useState(false);
    const patch = (p: BookPatch) => { setSaved(false); setDraft({ ...draft, ...p }); };
    return <form className="reading-form reading-record" onSubmit={async (e) => { e.preventDefault(); if (await save({ ...draft, tags: tags(tagText) }))
        setSaved(true); }}><label>독서 상태<select className="field" value={draft.reading_status} onChange={e => { const status = e.target.value as ReadingStatus; patch({ reading_status: status, ...(status === 'reading' && !draft.started_at ? { started_at: todayISO() } : {}) }); }}>{Object.entries(READING_STATUS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="reading-form-rating"><p>별점</p><StarRating value={draft.rating??null} disabled={busy} onChange={rating=>patch({rating})}/></div><label>시작일<input className="field" type="date" value={draft.started_at ?? ''} onChange={e => patch({ started_at: e.target.value || null })}/></label><label>완독일<input className="field" type="date" value={draft.finished_at ?? ''} onChange={e => patch({ finished_at: e.target.value || null })}/></label><label className="reading-wide">한줄평<textarea className="field" value={draft.review} onChange={e => patch({ review: e.target.value })}/></label><label className="reading-wide">책 태그<input className="field" placeholder="철학, 성장, 개발" value={tagText} onChange={e => { setTagText(e.target.value); setSaved(false); }}/></label><div className="reading-wide reading-actions"><button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '기록 저장'}</button>{saved ? <span role="status">저장했습니다.</span> : null}</div></form>;
}
function EntryModal({ kind, entry, busy, close, save }: {
    kind: 'highlight' | 'note';
    entry: Highlight | ReadingNote | null;
    busy: boolean;
    close: () => void;
    save: (input: HighlightInput | {
        content: string;
        tags: string[];
    }) => Promise<void>;
}) {
    const [content, setContent] = useState(entry?.content ?? ''), [page, setPage] = useState(entry && 'page_number' in entry ? String(entry.page_number ?? '') : ''), [note, setNote] = useState(entry && 'note' in entry ? entry.note : ''), [tagText, setTagText] = useState(entry?.tags.join(', ') ?? '');
    return <Modal title={(kind === 'highlight' ? '문장' : '메모') + (entry ? ' 수정' : ' 추가')} close={close}><form className="reading-form" onSubmit={e => { e.preventDefault(); const input = { content: content.trim(), tags: tags(tagText) }; void save(kind === 'note' ? input : { ...input, page_number: page ? Number(page) : null, note, source_type: entry && 'source_type' in entry ? entry.source_type : 'manual', source_url: entry && 'source_url' in entry ? entry.source_url : null, source_title: entry && 'source_title' in entry ? entry.source_title : null }); }}><label>{kind === 'highlight' ? '인상 깊은 문장' : '메모 내용'}<textarea required rows={5} className="field" value={content} onChange={e => setContent(e.target.value)}/></label>{kind === 'highlight' ? <><label>페이지 · 선택 사항<input type="number" min={1} step={1} className="field" value={page} onChange={e => setPage(e.target.value)}/></label><label>이 문장에 대한 메모<textarea className="field" value={note} onChange={e => setNote(e.target.value)}/></label></> : null}<label>태그<input className="field" placeholder="관계, 생각" value={tagText} onChange={e => setTagText(e.target.value)}/></label><div className="reading-actions"><button className="btn btn-primary" disabled={busy || !content.trim()}>저장</button><button type="button" className="btn btn-ghost" onClick={close}>취소</button></div></form></Modal>;
}
