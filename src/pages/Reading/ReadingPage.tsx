import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { sameBook } from '@blanky/types';
import type { BookMetadata, BookPatch, Highlight, HighlightInput, LibraryBook, ReadingLibrary, ReadingNote, ReadingStatus, Shelf, ShelfInput } from '@blanky/types';
import type { ReadingRepository } from '@blanky/api';
import type { ReadingStoreRepository } from '../../services/reading/local.ts';
import { readingService, importLegacyReading } from '../../services/reading/index.ts';
import { ExampleCard } from '../../features/onboarding/Example.tsx';
import { PageTour } from '../../features/onboarding/Onboarding.tsx';
import { isSupabaseConfigured } from '../../services/supabase/client.ts';
import { useSession } from '../../state/useSession.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useLibrary } from '../../state/useLibrary.ts';
import { PageCanvas } from '../../features/pages/PageCanvas.tsx';
import { resolveLayout } from '../../features/pages/layout.ts';
import { ArrowLeft, GripVertical } from 'lucide-react';
import { ReadingIcon, ReadingIconPicker } from './ReadingIconPicker.tsx';
import { DEFAULT_SWATCH } from '../../constants/swatches.ts';
import { StarRating } from './StarRating.tsx';
import { josa, readingText, type ReadingText } from './readingText.ts';
import { todayISO } from '../../utils/date.ts';
import { saveAndClose } from '../../utils/saveAndClose.ts';
import { useReadingDrag } from './useReadingDrag.ts';
import { bookCategories, categoryLabel, matchesCategory, moveShelf, UNCLASSIFIED } from './readingInteractions.ts';
import './reading.css';
const ReadingErrorContext = createContext('');
const noLegacyBooks: ReturnType<typeof useLibrary>['books'] = [];
const noLegacyLogs: ReturnType<typeof useLibrary>['logs'] = [];
const empty: ReadingLibrary = { books: [], shelves: [], memberships: [] };
const tags = (value: string) => [...new Set(value.split(/[,，#\s]+/).map(t => t.trim()).filter(Boolean))];
const shelfColor = (name: string) => /^#[0-9a-f]{6}$/i.test(name) ? name : 'var(--blanky-colors-' + (name === 'textSecondary' ? 'text-secondary' : name) + ')';
function Cover({ book }: {
    book: BookMetadata;
}) { const [failed, setFailed] = useState(false); return <div className="reading-book-cover" data-theme-slot="reading-book-cover">{book.cover_url && !failed ? <img draggable={false} src={book.cover_url} alt={book.title + ' 표지'} loading="lazy" onError={() => setFailed(true)}/> : <span>{book.title}</span>}</div>; }
function Modal({ title, close, busy = false, children }: {
    title: string;
    close: () => void;
    busy?: boolean;
    children: ReactNode;
}) {
    const error = useContext(ReadingErrorContext);
    const ref = useRef<HTMLDivElement>(null), onClose = useRef(close);
    // A modal stays open until its save settles, so Escape and × do nothing while busy.
    useEffect(() => { onClose.current = () => { if (!busy) close(); }; }, [close, busy]);
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
    return <div className="reading-modal-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="reading-modal"><header><h2>{title}</h2><button type="button" className="btn btn-ghost" disabled={busy} onClick={close} aria-label="닫기">×</button></header>{error ? <p role="alert" className="reading-error">{error}</p> : null}{children}</div></div>;
}
export function ReadingPage({ editing = false }: {
    editing?: boolean;
}) {
    const { user } = useSession();
    const { pageLayouts, setPageLayout, books, logs } = useLibrary();
    return <PageCanvas pageId="reading" editing={editing} blocks={resolveLayout('reading', pageLayouts.reading)} onChange={blocks => setPageLayout('reading', blocks)} render={block => block.type === 'page-body' && user ? <>{editing ? null : <PageTour page="reading"/>}<ReadingWorkspace key={user.id} userId={user.id} legacyBooks={books} legacyLogs={logs}/></> : null}/>;
}
export function ReadingWorkspace({ userId, legacyBooks = noLegacyBooks, legacyLogs = noLegacyLogs, repository, heading, labels, basePath = '/reading' }: {
    userId: string;
    legacyBooks?: ReturnType<typeof useLibrary>['books'];
    legacyLogs?: ReturnType<typeof useLibrary>['logs'];
    repository?: ReadingRepository & Partial<Pick<ReadingStoreRepository, 'setBookCategories' | 'updateBookMetadata'>>;
    heading?: string;
    labels?: Record<string, string>;
    basePath?: string;
}) {
    const { t } = useI18n();
    const text = useMemo(() => readingText(labels), [labels]);
    const repo = useMemo<ReadingRepository & Partial<Pick<ReadingStoreRepository, 'setBookCategories' | 'updateBookMetadata'>>>(() => repository ?? readingService(userId), [userId, repository]);
    const { bookId: routeBookId } = useParams();
    const [params] = useSearchParams();
    const bookId = repository ? params.get('book') : routeBookId;
    const bookPath = (id: string) => repository ? basePath + '?book=' + encodeURIComponent(id) : basePath + '/' + id;
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
        setData(previous); if (!repository) await importLegacyReading(userId, legacyBooks, legacyLogs); const next = await repo.getMyBooks(); if (!cancelled) {
        setData(next);
        setError('');
    } })().catch(e => { if (!cancelled)
        setError(e instanceof Error ? e.message : josa(text.library, '을') + ' 불러오지 못했습니다.'); }).finally(() => { if (!cancelled)
        setLoading(false); }); return () => { cancelled = true; }; }, [repo, userId, legacyBooks, legacyLogs, repository, text.library]);
    // The ref lock keeps a double click from starting a second save before busy re-renders.
    const saving = useRef(false);
    const act = (fn: () => Promise<unknown>) => saveAndClose(saving, async () => { await fn(); await refresh(); return true; }, {
        fail: message => { if (alive.current) setError(message); },
        busy: value => { if (alive.current) setBusy(value); },
    });
    const reorder = (ids: string[]) => void act(() => repo.reorderShelves(ids));
    const drag = useReadingDrag((item, target) => {
        if (item.kind === 'shelf') reorder(moveShelf(data.shelves, item.id, target).map(s => s.id));
        else if (data.books.some(b => b.id === item.id) && data.shelves.some(s => s.id === target)) {
            void act(() => repo.addBookToShelf(item.id, target)).then(ok => { if (ok) setNotice(text.shelf + '에 추가했습니다.'); });
        }
    }, busy);
    const categories = [...new Set(data.books.flatMap(bookCategories))].sort((a,b) => a.localeCompare(b));
    const activeCategory = category === 'all' || category === UNCLASSIFIED || categories.includes(category) ? category : 'all';
    const selected = data.shelves.find(s => s.id === filter);
    const filtered = data.books.filter(b => (filter === 'all' || (text.statuses().some(([id]) => id === filter) ? b.reading_status === filter : data.memberships.some(m => m.shelf_id === filter && m.user_book_id === b.id))) && (status === 'all' || b.reading_status === status) && matchesCategory(b, activeCategory) && (b.book.title + ' ' + b.book.author).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const current = data.books.find(b => b.id === bookId);
    return <ReadingErrorContext.Provider value={error}><div className="reading-page" data-theme-slot="reading-page">
 <header data-theme-slot="page-header" className="reading-heading"><div><h1>{heading ?? t('reading.title')}</h1><p>{text.word('tagline')}</p></div><button data-tour="add-book" className="btn btn-primary" onClick={() => setSearch(true)}>+ {text.item} 추가 · 검색</button></header>
 {!isSupabaseConfigured ? <p className="reading-muted">로컬 모드 · 이 브라우저에 저장됩니다.</p> : null}
 {error ? <div role="alert" className="reading-error">{error}<button className="btn btn-ghost" disabled={busy} onClick={() => void act(() => repository ? repo.getMyBooks() : importLegacyReading(userId, legacyBooks, legacyLogs))}>다시 시도</button></div> : null}
 {loading ? <p role="status">{josa(text.library, '을')} 불러오고 있어요…</p> : <div className="reading-layout">
 <aside className="reading-sidebar" data-theme-slot="reading-sidebar" aria-label={'독서 ' + text.shelf}>
 {[['all', '전체'] as const, ...text.statuses()].map(([id, label]) => <button key={id} className={filter === id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(id); navigate(basePath); }}>{label}<span>{id === 'all' ? data.books.length : data.books.filter(b => b.reading_status === id).length}</span></button>)}
 <div className="reading-shelf-heading">내 {text.shelf}<button className="btn btn-ghost" onClick={() => setShelfEditor('new')} aria-label={'새 ' + text.shelf}>+</button></div>
 {data.shelves.map((s, index) => <div className={'reading-shelf' + (drag.target===s.id?' reading-drop-target':'') + (drag.active?.id===s.id?' reading-dragging':'')} data-theme-slot="reading-shelf" data-reading-shelf-id={s.id} key={s.id}>
 <button type="button" className="reading-drag-handle" disabled={busy} aria-label={s.name+' '+text.shelf+' 순서 변경'} title="드래그로 순서 변경 · 방향키로 이동" onPointerDown={e=>drag.start(e,{kind:'shelf',id:s.id,label:s.name})} onClick={drag.click} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const next=index+(e.key==='ArrowUp'?-1:1);if(data.shelves[next])reorder(moveShelf(data.shelves,s.id,data.shelves[next].id).map(s=>s.id))}}}><GripVertical size={14}/></button>
 <button className={filter === s.id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(s.id); navigate(basePath); }}><span style={{color:shelfColor(s.color)}}><ReadingIcon value={s.icon}/></span>{s.name}<span>{data.memberships.filter(m => m.shelf_id === s.id).length}</span></button><button className="reading-edit" aria-label={s.name + ' ' + text.shelf + ' 편집'} onClick={() => setShelfEditor(s)}>⋯</button></div>)}
 {!data.shelves.length ? <ExampleCard className="reading-example-shelf" title={'인생' + text.item} meta={text.shelf} body={'좋았던 ' + text.item + (labels?.item?.trim() ? ', ' : ', 개발… ') + '원하는 이름으로 묶어요.'} action={'첫 ' + text.shelf + ' 만들기'} onStart={() => setShelfEditor('new')}/> : null}
 </aside>
 <main className="reading-content">
 {bookId ? (current ? <BookDetail key={current.id} book={current} basePath={basePath} labels={labels} text={text} saveMetadata={repo.updateBookMetadata ? metadata => act(() => repo.updateBookMetadata!(current.id, metadata)) : undefined} repo={repo} busy={busy} act={act} remove={() => setConfirm(() => async () => { await repo.removeBook(current.id); navigate(basePath); })}/> : <p>{josa(text.item, '을')} 찾을 수 없습니다. <Link to={basePath}>{josa(text.library, '으로')} 돌아가기</Link></p>) : <>
 <div className="reading-list-heading"><div><h2>{selected ? <><ReadingIcon value={selected.icon}/> {selected.name}</> : filter === 'all' ? (labels?.library?.trim() ? '내 ' + text.library : '내 독서 라이브러리') : text.status(filter as ReadingStatus)}</h2>{selected?.description ? <p>{selected.description}</p> : null}<p className="reading-muted">{filtered.length}{text.unit} · 최근 추가순</p></div></div>
 <div className="reading-toolbar"><input className="field" aria-label={'내 ' + text.library + ' 검색'} placeholder={'내 ' + text.library + '에서 제목, ' + text.word('author') + ' 검색'} value={query} onChange={e => setQuery(e.target.value)}/><select className="field" aria-label={text.word('status') + ' 필터'} value={status} onChange={e => setStatus(e.target.value)}><option value="all">모든 상태</option>{text.statuses().map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select className="field" aria-label={text.word('category') + ' 필터'} value={activeCategory} onChange={e=>setCategory(e.target.value)}><option value="all">모든 종류</option>{categories.map(c=><option value={c} key={c}>{categoryLabel(c)}</option>)}<option value={UNCLASSIFIED}>분류 없음</option></select><button type="button" className="btn btn-line" disabled={busy} onClick={()=>void act(async()=>{const result=await repo.refreshCategories();setNotice(result.updated+text.unit+'의 분류를 확인했습니다.'+(result.remaining?' '+result.remaining+josa(text.unit,'이')+' 남았습니다. 다시 눌러 이어서 가져오세요.':''))})}>분류 정보 불러오기</button></div>
 {notice?<p role="status" className="reading-muted">{notice}</p>:null}
 <div className="reading-book-grid" data-theme-slot="reading-book-grid">{filtered.map(b => <article className="reading-book-card" data-theme-slot="reading-book-card" key={b.id} draggable={false} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(filter==='all'&&e.pointerType!=='touch')drag.start(e,{kind:'book',id:b.id,label:b.book.title})}} onClick={drag.click} data-reading-draggable={filter==='all'?'true':undefined}>{filter==='all'?<button type="button" className="reading-book-drag-handle" aria-label={b.book.title+' '+text.shelf+'에 드래그'} onPointerDown={e=>{e.stopPropagation();drag.start(e,{kind:'book',id:b.id,label:b.book.title})}}><GripVertical size={16}/></button>:null}<Link to={bookPath(b.id)}><Cover book={b.book}/><h3>{b.book.title}</h3><p>{b.book.author || text.word('author') + ' 미상'}</p><p className="reading-book-status" data-status={b.reading_status}><span className="reading-status-dot" aria-hidden="true"/>{text.status(b.reading_status)}</p></Link></article>)}</div>
 {!data.books.length && filter === 'all' && !query ? <div className="reading-example-book"><ExampleCard title={labels?.item?.trim() ? '첫 ' + text.item : '데미안'} meta={text.status('reading') + (labels?.item?.trim() ? '' : ' · 42%')} body={labels?.item?.trim() ? [text.word('title'), text.word('author'), text.word('rating')].join(' · ') : '헤르만 헤세 · 3일 전 120쪽까지 읽음'} action={'첫 ' + text.item + ' 추가하기'} onStart={() => setSearch(true)}/></div> : null}
 {!filtered.length && (data.books.length || filter !== 'all' || query) ? <div className="reading-empty"><h3>{josa(text.item, '을')} 담을 자리가 준비됐어요.</h3><p>검색해서 첫 {josa(text.item, '을')} 추가하거나 다른 {josa(text.shelf, '을')} 선택해 보세요.</p><button className="btn btn-primary" onClick={() => setSearch(true)}>{text.item} 검색</button></div> : null}
 </>}
 </main></div>}
 {search ? <SearchModal text={text} repo={repo} data={data} defaultShelf={selected?.id} busy={busy} close={() => setSearch(false)} add={async (book, status, shelves) => { const ok = await act(async () => { const id = await repo.addBook(book, status, shelves); if (id && status === 'reading') { const saved = await repo.getUserBook(id); if (saved.reading_status === 'reading' && !saved.started_at) await repo.updateBook(id, { started_at: todayISO() }); } }); return !!ok; }}/> : null}
 {shelfEditor ? <ShelfModal text={text} shelf={shelfEditor === 'new' ? null : shelfEditor} order={data.shelves.length} busy={busy} close={() => setShelfEditor(null)} save={async (input) => { if (await act(() => shelfEditor === 'new' ? repo.createShelf(input) : repo.updateShelf(shelfEditor.id, input)))
        setShelfEditor(null); }} remove={shelfEditor === 'new' ? undefined : () => { const id = shelfEditor.id; setShelfEditor(null); setConfirm(() => async () => { await repo.deleteShelf(id); setFilter('all'); }); }}/> : null}
 {confirm ? <Modal title="삭제할까요?" close={() => setConfirm(null)}><p>{text.shelf} 삭제는 {josa(text.item, '을')} {text.library}에 유지합니다. {text.item} 삭제는 해당 {text.highlight}·{text.memo}도 함께 삭제합니다.</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void act(confirm).then(ok => { if (ok)
        setConfirm(null); })}>삭제</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>취소</button></div></Modal> : null}
 {drag.active?<div className="reading-drag-preview" style={{left:drag.active.x+14,top:drag.active.y+14}} aria-hidden="true">{drag.active.kind==='book'?text.shelf+'에 추가':text.shelf+' 순서 변경'} · {drag.active.label}</div>:null}
 </div></ReadingErrorContext.Provider>;
}
function ShelfModal({ text, shelf, order, busy, close, save, remove }: {
    text: ReadingText;
    shelf: Shelf | null;
    order: number;
    busy: boolean;
    close: () => void;
    save: (input: ShelfInput) => Promise<void>;
    remove?: () => void;
}) {
    const [draft, setDraft] = useState<ShelfInput>(shelf ?? { name: '', description: '', icon: '📚', color: DEFAULT_SWATCH, sort_order: order });
    return <Modal title={shelf ? text.shelf + ' 편집' : '새 ' + text.shelf} close={close} busy={busy}><form className="reading-form" onSubmit={e => { e.preventDefault(); void save({ ...draft, name: draft.name.trim() }); }}><label>{text.shelf} 이름<input required maxLength={100} className="field" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>설명<textarea className="field" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><div><p className="reading-muted">아이콘</p><ReadingIconPicker value={draft.icon} onChange={icon=>setDraft(current=>({...current,icon}))} color={draft.color} onColor={color=>setDraft(current=>({...current,color}))}/></div><div className="reading-actions"><button className="btn btn-primary" disabled={busy || !draft.name.trim()}>{shelf ? '저장' : '만들기'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>취소</button>{remove ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove}>{text.shelf} 삭제</button> : null}</div></form></Modal>;
}
function SearchModal({ text, repo, data, defaultShelf, busy: saving, close, add }: {
    text: ReadingText;
    repo: ReadingRepository;
    data: ReadingLibrary;
    defaultShelf?: string;
    busy: boolean;
    close: () => void;
    add: (b: BookMetadata, s: ReadingStatus, ids: string[]) => Promise<boolean>;
}) {
    const [query, setQuery] = useState(''), [results, setResults] = useState<BookMetadata[]>([]), [selected, setSelected] = useState<BookMetadata | null>(null), [status, setStatus] = useState<ReadingStatus>('want'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false);
    const request = useRef(0);
    useEffect(() => () => { request.current++; }, []);
    return <Modal title={selected ? '내 ' + text.library + '에 ' + text.item + ' 추가' : text.item + ' 검색'} close={close} busy={saving}>{!selected ? <ManualBookForm text={text} add={add} defaultShelf={defaultShelf} close={close}/> : null}{selected ? <><div className="reading-result"><Cover book={selected}/><div><h3>{selected.title}</h3><p>{selected.author}</p></div></div><label className="reading-form">{text.word('status')}<select className="field" value={status} onChange={e => setStatus(e.target.value as ReadingStatus)}>{text.statuses().map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="reading-actions"><button className="btn btn-primary" disabled={busy || saving} onClick={async () => { setBusy(true); if (await add(selected, status, defaultShelf ? [defaultShelf] : [])) {
        close();
        return;
    } setBusy(false); }}>{busy ? '추가 중…' : '내 ' + text.library + '에 추가'}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(null)}>검색 결과</button></div></> : <><form className="reading-toolbar" onSubmit={async (e) => { e.preventDefault(); const id = ++request.current; setBusy(true); setError(''); setSearched(false); setResults([]); try {
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
    } }}><input className="field" required maxLength={200} aria-label={text.word('title') + ', ' + text.word('author') + ', ISBN 검색'} placeholder={text.word('title') + ', ' + text.word('author') + ', ISBN 검색…'} value={query} onChange={e => setQuery(e.target.value)}/><button className="btn btn-primary" disabled={busy}>검색</button></form>{busy ? <p role="status">{josa(text.item, '을')} 찾고 있어요…</p> : null}{error ? <p role="alert">{error}</p> : null}{searched && !results.length ? <p>검색 결과가 없습니다. 다른 제목이나 ISBN으로 검색해 주세요.</p> : null}<div className="reading-results">{results.map(b => { const exists = data.books.some(x => sameBook(x.book, b)); return <article className="reading-result" key={b.external_id}><Cover book={b}/><div><h3>{b.title}</h3><p>{b.author}</p><p className="reading-muted">{b.publisher} {b.published_date ? '· ' + b.published_date : ''}</p><button className="btn btn-line" disabled={exists} onClick={() => setSelected(b)}>{exists ? '내 ' + text.library + '에 있음' : '내 ' + text.library + '에 추가'}</button></div></article>; })}</div></>}</Modal>;
}
function ManualBookForm({ text, add, defaultShelf, close }: {
    text: ReadingText;
    add: (book: BookMetadata, status: ReadingStatus, shelves: string[]) => Promise<boolean>;
    defaultShelf?: string;
    close: () => void;
}) {
    const [title, setTitle] = useState(''), [author, setAuthor] = useState(''), [busy, setBusy] = useState(false);
    return <details className="my-4"><summary className="cursor-pointer text-sm text-neutral-500">직접 {text.item} 추가</summary>
        <form className="reading-form mt-3" onSubmit={async event => {
            event.preventDefault(); setBusy(true);
            try {
                if (await add({ title: title.trim(), author, external_source: 'manual', external_id: crypto.randomUUID(),
                    isbn10: null, isbn13: null, publisher: null, published_date: null, description: null,
                    cover_url: null, page_count: null }, 'want', defaultShelf ? [defaultShelf] : [])) { close(); return; }
                setBusy(false);
            } catch { setBusy(false); }
        }}>
            <label>{text.word('title')}<input required className="field" value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label>{text.word('author')}<input className="field" value={author} onChange={event => setAuthor(event.target.value)} /></label>
            <button className="btn btn-line" disabled={busy || !title.trim()}>{text.item} 추가</button>
        </form>
    </details>;
}
function BookDetail({ book, repo, busy, act, remove, basePath = '/reading', labels, text, saveMetadata }: {
    text: ReadingText;
    saveMetadata?: (metadata: Pick<BookMetadata, 'title' | 'author' | 'cover_url' | 'categories'>) => Promise<boolean | undefined>;
    basePath?: string;
    labels?: Record<string, string>;
    book: LibraryBook;
    repo: ReadingRepository;
    busy: boolean;
    act: (fn: () => Promise<unknown>) => Promise<boolean | undefined>;
    remove: () => void;
}) {
    const [tab, setTab] = useState<'record' | 'highlight' | 'memo' | 'info'>('record'), [highlights, setHighlights] = useState<Highlight[]>([]), [notes, setNotes] = useState<ReadingNote[]>([]), [error, setError] = useState(''), [entry, setEntry] = useState<Highlight | ReadingNote | 'new' | null>(null), [pageSort, setPageSort] = useState(false), [confirm, setConfirm] = useState<Highlight | ReadingNote | null>(null);
    const tabName = { record: '기록', highlight: text.highlight, memo: text.memo, info: '정보' } as const;
    const isHighlight = tab === 'highlight';
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
    return <article className="reading-detail" data-theme-slot="reading-detail"><Link className="reading-back inline-flex items-center gap-1.5" to={basePath}><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> 내 {text.library}</Link><header className="reading-detail-heading"><Cover book={book.book}/><div><h2>{book.book.title}</h2><p>{book.book.author}</p><p className="reading-muted">{book.book.publisher}</p><p>{text.status(book.reading_status)}</p><StarRating value={book.rating}/></div></header>{saveMetadata ? <BookMetadataEditor key={book.id + JSON.stringify(book.book)} book={book.book} text={text} busy={busy} save={saveMetadata}/> : null}<div role="tablist" aria-label={text.item + ' 상세'} className="reading-tabs">{(['record', 'highlight', 'memo', 'info'] as const).map(t => <button role="tab" id={'reading-tab-' + t} aria-controls="reading-tab-panel" aria-selected={tab === t} key={t} onClick={() => { setTab(t); setEntry(null); }}>{tabName[t]}</button>)}</div>{error ? <p role="alert">{error}</p> : null}<section role="tabpanel" id="reading-tab-panel" aria-labelledby={'reading-tab-' + tab}>
 {tab === 'record' ? <RecordForm key={book.id} book={book} text={text} busy={busy} save={patch => act(() => repo.updateBook(book.id, patch))}/> : tab === 'info' ? <div className="reading-information"><dl>{[[text.word('title'), book.book.title], [text.word('author'), book.book.author], ['출판사', book.book.publisher], ['출판일', book.book.published_date], ['ISBN 13', book.book.isbn13], ['ISBN 10', book.book.isbn10], [text.word('category'), bookCategories(book).map(categoryLabel).join(', ') || '분류 없음'], ['출처', book.book.external_source]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '정보 없음'}</dd></div>)}</dl><p className="reading-prose">{book.book.description?.replace(/<[^>]*>/g, '') || text.item + ' 설명이 없습니다.'}</p></div> : <><div className="reading-list-heading"><h3>{isHighlight ? '인상 깊은 ' + text.highlight : (labels?.memo?.trim() ? text.memo : '독서 메모')}</h3>{isHighlight ? <select aria-label="문장 정렬" className="field" value={pageSort ? 'page' : 'time'} onChange={e => setPageSort(e.target.value === 'page')}><option value="time">최근 저장순</option><option value="page">페이지순</option></select> : null}<button className="btn btn-primary" disabled={busy} onClick={() => setEntry('new')}>+ {tabName[tab]} 추가</button></div>{(isHighlight ? (pageSort ? [...highlights].sort((a, b) => (a.page_number ?? Infinity) - (b.page_number ?? Infinity)) : highlights) : notes).map(item => <article className={isHighlight ? 'reading-highlight' : 'reading-note'} data-theme-slot={isHighlight ? 'reading-highlight' : 'reading-note'} key={item.id}>{'page_number' in item && typeof item.page_number === 'number' && item.page_number ? <p className="reading-muted">p.{item.page_number}</p> : null}<p className="reading-prose">{item.content}</p>{'note' in item && typeof item.note === 'string' && item.note ? <p className="reading-prose reading-muted">{item.note}</p> : null}<p className="reading-muted">{item.tags.map(t => '#' + t).join(' ')} · {new Date(item.created_at).toLocaleDateString('ko-KR')}{item.updated_at !== item.created_at ? ' · 수정 ' + new Date(item.updated_at).toLocaleDateString('ko-KR') : ''}</p><div className="reading-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setEntry(item)}>수정</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(item)}>삭제</button></div></article>)}{!(isHighlight ? highlights : notes).length ? <p className="reading-empty">마음에 남은 {isHighlight ? josa(text.highlight, '을') : '생각을'} 기록해 보세요.</p> : null}</>}
 </section><button className="btn btn-ghost reading-remove" disabled={busy} onClick={remove}>{text.library}에서 {text.item} 삭제</button>
 {entry ? <EntryModal key={typeof entry === 'string' ? 'new' : entry.id} text={text} kind={isHighlight ? 'highlight' : 'note'} entry={entry === 'new' ? null : entry} busy={busy} close={() => setEntry(null)} save={async (input) => { if (isHighlight) {
        const h = input as HighlightInput;
        await entryAct(() => entry === 'new' ? repo.createHighlight(book.id, h) : repo.updateHighlight(entry.id, h));
    }
    else {
        await entryAct(() => entry === 'new' ? repo.createReadingNote(book.id, input) : repo.updateReadingNote(entry.id, input));
    } }}/> : null}
 {confirm ? <Modal title={tabName[tab] + ' 삭제'} close={() => setConfirm(null)}><p>이 기록을 삭제할까요?</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void entryAct(() => 'source_type' in confirm ? repo.deleteHighlight(confirm.id) : repo.deleteReadingNote(confirm.id))}>삭제</button><button className="btn btn-ghost" onClick={() => setConfirm(null)}>취소</button></div></Modal> : null}
 </article>;
}
function BookMetadataEditor({ book, text: words, busy, save }: {
    book: BookMetadata;
    text: ReadingText;
    busy: boolean;
    save: (metadata: Pick<BookMetadata, 'title' | 'author' | 'cover_url' | 'categories'>) => Promise<boolean | undefined>;
}) {
    const [text, setText] = useState((book.categories ?? []).join(', '));
    const [title, setTitle] = useState(book.title);
    const [author, setAuthor] = useState(book.author);
    const [image, setImage] = useState(book.cover_url ?? '');
    return <form className="reading-form reading-record my-5" onSubmit={async event => {
        event.preventDefault();
        await save({ title, author, cover_url: image || null, categories: [...new Set(text.split(',').map(value => value.trim()).filter(Boolean))] });
    }}>
        <label>{words.word('title')}<input required className="field" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>{words.word('author')}<input className="field" value={author} onChange={event => setAuthor(event.target.value)} /></label>
        <label>{words.word('image')}<input className="field" value={image} onChange={event => setImage(event.target.value)} /></label>
        <label className="min-w-0 flex-1 text-xs text-neutral-500">{words.word('category')}
            <input aria-label={words.word('category') + ' 편집'} className="field mt-1 w-full" value={text} onChange={event => setText(event.target.value)} placeholder="쉼표로 구분 · 비우면 분류 없음" />
        </label>
        <button className="btn btn-line" disabled={busy}>{words.item} 정보 저장</button>
    </form>;
}
function RecordForm({ book, busy, save, text }: {
    text: ReadingText;
    book: LibraryBook;
    busy: boolean;
    save: (patch: BookPatch) => Promise<unknown>;
}) {
    const [draft, setDraft] = useState<BookPatch>({ reading_status: book.reading_status, rating: book.rating, started_at: book.started_at, finished_at: book.finished_at, review: book.review, tags: book.tags }), [tagText, setTagText] = useState(book.tags.join(', ')), [saved, setSaved] = useState(false);
    const patch = (p: BookPatch) => { setSaved(false); setDraft({ ...draft, ...p }); };
    return <form className="reading-form reading-record" onSubmit={async (e) => { e.preventDefault(); if (await save({ ...draft, tags: tags(tagText) }))
        setSaved(true); }}><label>{text.word('status')}<select className="field" value={draft.reading_status} onChange={e => { const status = e.target.value as ReadingStatus; patch({ reading_status: status, ...(status === 'reading' && !draft.started_at ? { started_at: todayISO() } : {}) }); }}>{text.statuses().map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="reading-form-rating"><p>{text.word('rating')}</p><StarRating value={draft.rating??null} disabled={busy} onChange={rating=>patch({rating})}/></div><label>{text.word('startedAt')}<input className="field" type="date" value={draft.started_at ?? ''} onChange={e => patch({ started_at: e.target.value || null })}/></label><label>{text.word('finishedAt')}<input className="field" type="date" value={draft.finished_at ?? ''} onChange={e => patch({ finished_at: e.target.value || null })}/></label><label className="reading-wide">{text.word('note')}<textarea className="field" value={draft.review} onChange={e => patch({ review: e.target.value })}/></label><label className="reading-wide">{text.word('tags')}<input className="field" placeholder="철학, 성장, 개발" value={tagText} onChange={e => { setTagText(e.target.value); setSaved(false); }}/></label><div className="reading-wide reading-actions"><button className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '기록 저장'}</button>{saved ? <span role="status">저장했습니다.</span> : null}</div></form>;
}
function EntryModal({ text, kind, entry, busy, close, save }: {
    text: ReadingText;
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
    return <Modal title={(kind === 'highlight' ? text.highlight : text.memo) + (entry ? ' 수정' : ' 추가')} close={close} busy={busy}><form className="reading-form" onSubmit={e => { e.preventDefault(); const input = { content: content.trim(), tags: tags(tagText) }; void save(kind === 'note' ? input : { ...input, page_number: page ? Number(page) : null, note, source_type: entry && 'source_type' in entry ? entry.source_type : 'manual', source_url: entry && 'source_url' in entry ? entry.source_url : null, source_title: entry && 'source_title' in entry ? entry.source_title : null }); }}><label>{kind === 'highlight' ? '인상 깊은 ' + text.highlight : text.memo + ' 내용'}<textarea required rows={5} className="field" value={content} onChange={e => setContent(e.target.value)}/></label>{kind === 'highlight' ? <><label>페이지 · 선택 사항<input type="number" min={1} step={1} className="field" value={page} onChange={e => setPage(e.target.value)}/></label><label>이 {text.highlight}에 대한 {text.memo}<textarea className="field" value={note} onChange={e => setNote(e.target.value)}/></label></> : null}<label>태그<input className="field" placeholder="관계, 생각" value={tagText} onChange={e => setTagText(e.target.value)}/></label><div className="reading-actions"><button className="btn btn-primary" disabled={busy || !content.trim()}>{busy ? '저장 중…' : '저장'}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>취소</button></div></form></Modal>;
}
