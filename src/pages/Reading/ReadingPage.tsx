import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { sameBook } from '@blanky/types';
import type { BookMetadata, BookPatch, Highlight, HighlightInput, LibraryBook, ReadingLibrary, ReadingNote, ReadingStatus, Shelf, ShelfInput } from '@blanky/types';
import type { ReadingRepository } from '@blanky/api';
import type { ReadingStoreRepository } from '../../services/reading/local.ts';
import { readingService, importLegacyReading, importedBookId } from '../../services/reading/index.ts';
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
import { readingText, type ReadingText } from './readingText.ts';
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
}) { const { t } = useI18n(); const [failed, setFailed] = useState(false); return <div className="reading-book-cover" data-theme-slot="reading-book-cover">{book.cover_url && !failed ? <img draggable={false} src={book.cover_url} alt={t('reading.coverAlt', { title: book.title })} loading="lazy" onError={() => setFailed(true)}/> : <span>{book.title}</span>}</div>; }
function Modal({ title, close, busy = false, children }: {
    title: string;
    close: () => void;
    busy?: boolean;
    children: ReactNode;
}) {
    const error = useContext(ReadingErrorContext);
    const { t } = useI18n();
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
    return <div className="reading-modal-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="reading-modal"><header><h2>{title}</h2><button type="button" className="btn btn-ghost" disabled={busy} onClick={close} aria-label={t('close')}>×</button></header>{error ? <p role="alert" className="reading-error">{error}</p> : null}{children}</div></div>;
}
export function ReadingPage({ editing = false }: {
    editing?: boolean;
}) {
    const { user } = useSession();
    const { pageLayouts, setPageLayout, books, logs, trashReadingBook } = useLibrary();
    return <PageCanvas pageId="reading" editing={editing} blocks={resolveLayout('reading', pageLayouts.reading)} onChange={blocks => setPageLayout('reading', blocks)} render={block => block.type === 'page-body' && user ? <>{editing ? null : <PageTour page="reading"/>}<ReadingWorkspace key={user.id} userId={user.id} legacyBooks={books} legacyLogs={logs} trashBook={trashReadingBook}/></> : null}/>;
}
export function ReadingWorkspace({ userId, legacyBooks = noLegacyBooks, legacyLogs = noLegacyLogs, trashBook, repository, heading, labels, basePath = '/reading' }: {
    userId: string;
    legacyBooks?: ReturnType<typeof useLibrary>['books'];
    legacyLogs?: ReturnType<typeof useLibrary>['logs'];
    /** Deletes a book into the trash with its shelves, quotes and notes (and on the reading page its 서재 book
     *  and logs); the reading page and custom reading pages both pass it. Without it removeBook just deletes. */
    trashBook?: (id: string) => Promise<void>;
    repository?: ReadingRepository & Partial<Pick<ReadingStoreRepository, 'setBookCategories' | 'updateBookMetadata'>>;
    heading?: string;
    labels?: Record<string, string>;
    basePath?: string;
}) {
    const { t, locale } = useI18n();
    const text = useMemo(() => readingText(t, locale, labels), [t, locale, labels]);
    const repo = useMemo<ReadingRepository & Partial<Pick<ReadingStoreRepository, 'setBookCategories' | 'updateBookMetadata'>>>(() => repository ?? readingService(userId), [userId, repository]);
    const { bookId: routeBookId } = useParams();
    const [params] = useSearchParams();
    const bookId = repository ? params.get('book') : routeBookId;
    const bookPath = (id: string) => repository ? basePath + '?book=' + encodeURIComponent(id) : basePath + '/' + id;
    const navigate = useNavigate();
    // Home's 보기 on a reading log names the legacy book; once it is imported, open that book's detail.
    const location = useLocation();
    const legacyTarget = repository ? undefined : (location.state as { legacyBookId?: string } | null)?.legacyBookId;
    const legacyMissing = !repository && Boolean((location.state as { legacyMissing?: boolean } | null)?.legacyMissing);
    const [data, setData] = useState<ReadingLibrary>(empty), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [filter, setFilter] = useState('all'), [query, setQuery] = useState(''), [status, setStatus] = useState('all'), [search, setSearch] = useState(false), [shelfEditor, setShelfEditor] = useState<Shelf | 'new' | null>(null), [confirm, setConfirm] = useState<(() => Promise<void>) | null>(null);
    // A book that goes to the trash can come back, so its delete says so; shelves and other deletes keep the old text.
    const [confirmBody, setConfirmBody] = useState('confirmDeleteBody');
    const [category, setCategory] = useState('all');
    const [notice, setNotice] = useState('');
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    // Read through a ref so switching the language does not load the library again.
    const translate = useRef(t);
    useEffect(() => { translate.current = t; }, [t]);
    const refresh = async () => { const next = await repo.getMyBooks(); if (alive.current)
        setData(next); };
    useEffect(() => { let cancelled = false; (async () => { const previous = await repo.getMyBooks(); if (!cancelled)
        setData(previous); if (!repository) await importLegacyReading(userId, legacyBooks, legacyLogs); const next = await repo.getMyBooks(); if (!cancelled) {
        setData(next);
        setError('');
    } })().catch(e => { console.error(e); if (!cancelled)
        setError(translate.current('reading.loadFailed')); }).finally(() => { if (!cancelled)
        setLoading(false); }); return () => { cancelled = true; }; }, [repo, userId, legacyBooks, legacyLogs, repository]);
    // A failed import keeps the target and its alert up, so 다시 시도 (busy while it runs) can still open
    // the book; an import that ran but has no such book (deleted meanwhile) falls back to the list and says so.
    useEffect(() => { if (loading || busy || !legacyTarget)
        return; const id = importedBookId(userId, legacyTarget, data.books); if (!id && error)
        return; navigate(id ? basePath + '/' + id : basePath, { replace: true, state: id ? undefined : { legacyMissing: true } }); }, [loading, busy, legacyTarget, userId, data.books, error, navigate, basePath]);
    // The ref lock keeps a double click from starting a second save before busy re-renders.
    const saving = useRef(false);
    const act = (fn: () => Promise<unknown>) => saveAndClose(saving, async () => { await fn(); await refresh(); return true; }, {
        fail: message => { if (alive.current) setError(message); },
        busy: value => { if (alive.current) setBusy(value); },
    });
    // Loading and importing fail on storage or server details (JSON, quota) the reader cannot act on: those
    // stay in the console and the alert says what failed in the app's language.
    const retry = () => void act(() => (repository ? repo.getMyBooks() : importLegacyReading(userId, legacyBooks, legacyLogs)).catch((e: unknown) => { console.error(e); throw new Error(t('reading.loadFailed')); }));
    const reorder = (ids: string[]) => void act(() => repo.reorderShelves(ids));
    const drag = useReadingDrag((item, target) => {
        if (item.kind === 'shelf') reorder(moveShelf(data.shelves, item.id, target).map(s => s.id));
        else if (data.books.some(b => b.id === item.id) && data.shelves.some(s => s.id === target)) {
            void act(() => repo.addBookToShelf(item.id, target)).then(ok => { if (ok) setNotice(text.say('addedToShelf')); });
        }
    }, busy);
    const categories = [...new Set(data.books.flatMap(bookCategories))].sort((a,b) => a.localeCompare(b));
    const activeCategory = category === 'all' || category === UNCLASSIFIED || categories.includes(category) ? category : 'all';
    const selected = data.shelves.find(s => s.id === filter);
    const filtered = data.books.filter(b => (filter === 'all' || (text.statuses().some(([id]) => id === filter) ? b.reading_status === filter : data.memberships.some(m => m.shelf_id === filter && m.user_book_id === b.id))) && (status === 'all' || b.reading_status === status) && matchesCategory(b, activeCategory) && (b.book.title + ' ' + b.book.author).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const current = data.books.find(b => b.id === bookId);
    return <ReadingErrorContext.Provider value={error}><div className="reading-page" data-theme-slot="reading-page">
 <header data-theme-slot="page-header" className="reading-heading"><div><h1>{heading ?? t('reading.title')}</h1><p>{text.word('tagline')}</p></div><button data-tour="add-book" className="btn btn-primary" onClick={() => setSearch(true)}>+ {text.say('addSearch')}</button></header>
 {!isSupabaseConfigured ? <p className="reading-muted">{text.say('localMode')}</p> : null}
 {error ? <div role="alert" className="reading-error">{legacyTarget ? t('reading.openFailed') : error}<button className="btn btn-ghost" disabled={busy} onClick={retry}>{t('reading.retry')}</button></div> : null}
 {loading ? <p role="status">{text.say('loading')}</p> : <div className="reading-layout">
 <aside className="reading-sidebar" data-theme-slot="reading-sidebar" aria-label={text.say('shelvesLabel')}>
 <div className="reading-status-filters" role="group" aria-label={text.say('filterLabel', { name: text.word('status') })}>{[['all', text.say('all')] as const, ...text.statuses()].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(id); navigate(basePath); }}>{label}<span>{id === 'all' ? data.books.length : data.books.filter(b => b.reading_status === id).length}</span></button>)}</div>
 <div className="reading-shelf-heading">{text.say('myShelves')}<button className="btn btn-ghost" onClick={() => setShelfEditor('new')} aria-label={text.say('newShelf')}>+</button></div>
 {data.shelves.map((s, index) => <div className={'reading-shelf' + (drag.target===s.id?' reading-drop-target':'') + (drag.active?.id===s.id?' reading-dragging':'')} data-theme-slot="reading-shelf" data-reading-shelf-id={s.id} key={s.id}>
 <button type="button" className="reading-drag-handle" disabled={busy} aria-label={text.say('reorderShelf',{name:s.name})} title={text.say('reorderHint')} onPointerDown={e=>drag.start(e,{kind:'shelf',id:s.id,label:s.name})} onClick={drag.click} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const next=index+(e.key==='ArrowUp'?-1:1);if(data.shelves[next])reorder(moveShelf(data.shelves,s.id,data.shelves[next].id).map(s=>s.id))}}}><GripVertical size={14}/></button>
 <button className={filter === s.id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(s.id); navigate(basePath); }}><span style={{color:shelfColor(s.color)}}><ReadingIcon value={s.icon}/></span>{s.name}<span>{data.memberships.filter(m => m.shelf_id === s.id).length}</span></button><button className="reading-edit" aria-label={text.say('editShelfNamed', { name: s.name })} onClick={() => setShelfEditor(s)}>⋯</button></div>)}
 {!data.shelves.length ? <ExampleCard className="reading-example-shelf" title={text.say('exampleShelfTitle')} meta={text.cap(text.shelf)} body={text.say(labels?.item?.trim() ? 'exampleShelfBodyCustom' : 'exampleShelfBody')} action={text.say('firstShelf')} onStart={() => setShelfEditor('new')}/> : null}
 </aside>
 <main className="reading-content">
 {bookId ? (current ? <BookDetail key={current.id} book={current} basePath={basePath} labels={labels} text={text} saveMetadata={repo.updateBookMetadata ? metadata => act(() => repo.updateBookMetadata!(current.id, metadata)) : undefined} repo={repo} busy={busy} act={act} remove={() => { setConfirmBody(trashBook ? 'confirmTrashItemBody' : 'confirmDeleteBody'); setConfirm(() => async () => { await (trashBook ? trashBook(current.id) : repo.removeBook(current.id)); navigate(basePath); }); }}/> : <p>{text.say('itemMissing')} <Link to={basePath}>{text.say('backToLibrary')}</Link></p>) : <>
 <div className="reading-list-heading"><div><h2>{selected ? <><ReadingIcon value={selected.icon}/> {selected.name}</> : filter === 'all' ? (labels?.library?.trim() ? text.say('myLibrary') : text.say('myReadingLibrary')) : text.status(filter as ReadingStatus)}</h2>{selected?.description ? <p>{selected.description}</p> : null}<p className="reading-muted">{text.say('listMeta', { count: text.count(filtered.length) })}</p></div></div>
 <div className="reading-toolbar"><input className="field" aria-label={text.say('searchLibrary')} placeholder={text.say('searchLibraryPlaceholder', { author: text.inline('author') })} value={query} onChange={e => setQuery(e.target.value)}/><select className="field" aria-label={text.say('filterLabel', { name: text.word('status') })} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{text.say('allStatuses')}</option>{text.statuses().map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><select className="field" aria-label={text.say('filterLabel', { name: text.word('category') })} value={activeCategory} onChange={e=>setCategory(e.target.value)}><option value="all">{text.say('allKinds')}</option>{categories.map(c=><option value={c} key={c}>{categoryLabel(c, t)}</option>)}<option value={UNCLASSIFIED}>{t('reading.noCategory')}</option></select><button type="button" className="btn btn-line" disabled={busy} onClick={()=>void act(async()=>{const result=await repo.refreshCategories();setNotice(text.say('categoriesChecked',{count:text.count(result.updated)})+(result.remaining?' '+text.say('categoriesRemaining',{count:text.count(result.remaining,'이')}):''))})}>{text.say('loadCategories')}</button></div>
 {notice || legacyMissing?<p role="status" className="reading-muted">{notice || t('reading.openMissing')}</p>:null}
 <div className="reading-book-grid" data-theme-slot="reading-book-grid">{filtered.map(b => <article className="reading-book-card" data-theme-slot="reading-book-card" key={b.id} draggable={false} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(filter==='all'&&e.pointerType!=='touch')drag.start(e,{kind:'book',id:b.id,label:b.book.title})}} onClick={drag.click} data-reading-draggable={filter==='all'?'true':undefined}>{filter==='all'?<button type="button" className="reading-book-drag-handle" aria-label={text.say('dragToShelf',{title:b.book.title})} onPointerDown={e=>{e.stopPropagation();drag.start(e,{kind:'book',id:b.id,label:b.book.title})}}><GripVertical size={16}/></button>:null}<Link to={bookPath(b.id)}><Cover book={b.book}/><h3>{b.book.title}</h3><p>{b.book.author || text.say('unknownAuthor', { author: text.inline('author') })}</p><p className="reading-book-status" data-status={b.reading_status}><span className="reading-status-dot" aria-hidden="true"/>{text.status(b.reading_status)}</p></Link></article>)}</div>
 {!data.books.length && filter === 'all' && !query ? <div className="reading-example-book"><ExampleCard title={text.say(labels?.item?.trim() ? 'exampleFirstItem' : 'exampleBookTitle')} meta={text.status('reading') + (labels?.item?.trim() ? '' : ' · ' + text.percent(0.42))} body={labels?.item?.trim() ? [text.word('title'), text.word('author'), text.word('rating')].join(' · ') : text.say('exampleBookBody')} action={text.say('addFirstItem')} onStart={() => setSearch(true)}/></div> : null}
 {!filtered.length && (data.books.length || filter !== 'all' || query) ? <div className="reading-empty"><h3>{text.say('emptyTitle')}</h3><p>{text.say('emptyBody')}</p><button className="btn btn-primary" onClick={() => setSearch(true)}>{text.say('searchItem')}</button></div> : null}
 </>}
 </main></div>}
 {search ? <SearchModal text={text} repo={repo} data={data} defaultShelf={selected?.id} busy={busy} close={() => setSearch(false)} add={async (book, status, shelves) => { const ok = await act(async () => { const id = await repo.addBook(book, status, shelves); if (id && status === 'reading') { const saved = await repo.getUserBook(id); if (saved.reading_status === 'reading' && !saved.started_at) await repo.updateBook(id, { started_at: todayISO() }); } }); return !!ok; }}/> : null}
 {shelfEditor ? <ShelfModal text={text} shelf={shelfEditor === 'new' ? null : shelfEditor} order={data.shelves.length} busy={busy} close={() => setShelfEditor(null)} save={async (input) => { if (await act(() => shelfEditor === 'new' ? repo.createShelf(input) : repo.updateShelf(shelfEditor.id, input)))
        setShelfEditor(null); }} remove={shelfEditor === 'new' ? undefined : () => { const id = shelfEditor.id; setShelfEditor(null); setConfirmBody('confirmDeleteBody'); setConfirm(() => async () => { await repo.deleteShelf(id); setFilter('all'); }); }}/> : null}
 {confirm ? <Modal title={text.say('confirmDeleteTitle')} close={() => setConfirm(null)}><p>{text.say(confirmBody)}</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void act(confirm).then(ok => { if (ok)
        setConfirm(null); })}>{t('delete')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>{t('cancel')}</button></div></Modal> : null}
 {drag.active?<div className="reading-drag-preview" style={{left:drag.active.x+14,top:drag.active.y+14}} aria-hidden="true">{text.say(drag.active.kind==='book'?'addToShelf':'reorderShelves')} · {drag.active.label}</div>:null}
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
    return <Modal title={text.say(shelf ? 'editShelf' : 'newShelf')} close={close} busy={busy}><form className="reading-form" onSubmit={e => { e.preventDefault(); void save({ ...draft, name: draft.name.trim() }); }}><label>{text.say('shelfName')}<input required maxLength={100} className="field" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><label>{text.say('description')}<textarea className="field" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}/></label><div><p className="reading-muted">{text.say('icon')}</p><ReadingIconPicker value={draft.icon} onChange={icon=>setDraft(current=>({...current,icon}))} color={draft.color} onColor={color=>setDraft(current=>({...current,color}))}/></div><div className="reading-actions"><button className="btn btn-primary" disabled={busy || !draft.name.trim()}>{shelf ? text.t('save') : text.say('create')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>{text.t('cancel')}</button>{remove ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove}>{text.say('deleteShelf')}</button> : null}</div></form></Modal>;
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
    return <Modal title={text.say(selected ? 'addToLibraryTitle' : 'searchItem')} close={close} busy={saving}>{!selected ? <ManualBookForm text={text} add={add} defaultShelf={defaultShelf} close={close}/> : null}{selected ? <><div className="reading-result"><Cover book={selected}/><div><h3>{selected.title}</h3><p>{selected.author}</p></div></div><label className="reading-form">{text.word('status')}<select className="field" value={status} onChange={e => setStatus(e.target.value as ReadingStatus)}>{text.statuses().map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="reading-actions"><button className="btn btn-primary" disabled={busy || saving} onClick={async () => { setBusy(true); if (await add(selected, status, defaultShelf ? [defaultShelf] : [])) {
        close();
        return;
    } setBusy(false); }}>{busy ? text.say('adding') : text.say('addToLibrary')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setSelected(null)}>{text.say('searchResults')}</button></div></> : <><form className="reading-toolbar" onSubmit={async (e) => { e.preventDefault(); const id = ++request.current; setBusy(true); setError(''); setSearched(false); setResults([]); try {
        const books = await repo.searchBooks(query);
        if (id === request.current) {
            setResults(books);
            setSearched(true);
        }
    }
    catch (e) {
        if (id === request.current)
            setError(e instanceof Error ? e.message : text.say('searchFailed'));
    }
    finally {
        if (id === request.current)
            setBusy(false);
    } }}><input className="field" required maxLength={200} aria-label={text.say('searchQuery', { title: text.inline('title'), author: text.inline('author') })} placeholder={text.say('searchQuery', { title: text.inline('title'), author: text.inline('author') }) + '…'} value={query} onChange={e => setQuery(e.target.value)}/><button className="btn btn-primary" disabled={busy}>{text.t('search')}</button></form>{busy ? <p role="status">{text.say('searching')}</p> : null}{error ? <p role="alert">{error}</p> : null}{searched && !results.length ? <p>{text.say('noResults')}</p> : null}<div className="reading-results">{results.map(b => { const exists = data.books.some(x => sameBook(x.book, b)); return <article className="reading-result" key={b.external_id}><Cover book={b}/><div><h3>{b.title}</h3><p>{b.author}</p><p className="reading-muted">{b.publisher} {b.published_date ? '· ' + b.published_date : ''}</p><button className="btn btn-line" disabled={exists} onClick={() => setSelected(b)}>{text.say(exists ? 'inLibrary' : 'addToLibrary')}</button></div></article>; })}</div></>}</Modal>;
}
function ManualBookForm({ text, add, defaultShelf, close }: {
    text: ReadingText;
    add: (book: BookMetadata, status: ReadingStatus, shelves: string[]) => Promise<boolean>;
    defaultShelf?: string;
    close: () => void;
}) {
    const [title, setTitle] = useState(''), [author, setAuthor] = useState(''), [busy, setBusy] = useState(false);
    return <details className="my-4"><summary className="cursor-pointer text-sm text-neutral-500">{text.say('addManually')}</summary>
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
            <button className="btn btn-line" disabled={busy || !title.trim()}>{text.say('addItem')}</button>
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
    const tabName = { record: text.t('reading.record'), highlight: text.cap(text.highlight), memo: text.cap(text.memo), info: text.t('reading.info') } as const;
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
    return <article className="reading-detail" data-theme-slot="reading-detail"><Link className="reading-back inline-flex items-center gap-1.5" to={basePath}><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> {text.say('myLibrary')}</Link><header className="reading-detail-heading"><Cover book={book.book}/><div><h2>{book.book.title}</h2><p>{book.book.author}</p><p className="reading-muted">{book.book.publisher}</p><p>{text.status(book.reading_status)}</p>{book.current_page > 0 ? <p className="reading-muted" data-reading-last-page>{text.say('lastPage', { page: text.number(book.current_page) })}</p> : null}<StarRating value={book.rating}/></div></header>{saveMetadata ? <BookMetadataEditor key={book.id + JSON.stringify(book.book)} book={book.book} text={text} busy={busy} save={saveMetadata}/> : null}<div role="tablist" aria-label={text.say('detailLabel')} className="reading-tabs">{(['record', 'highlight', 'memo', 'info'] as const).map(t => <button role="tab" id={'reading-tab-' + t} aria-controls="reading-tab-panel" aria-selected={tab === t} key={t} onClick={() => { setTab(t); setEntry(null); }}>{tabName[t]}</button>)}</div>{error ? <p role="alert">{error}</p> : null}<section role="tabpanel" id="reading-tab-panel" aria-labelledby={'reading-tab-' + tab}>
 {tab === 'record' ? <RecordForm key={book.id} book={book} text={text} busy={busy} save={patch => act(() => repo.updateBook(book.id, patch))}/> : tab === 'info' ? <div className="reading-information"><dl>{[[text.word('title'), book.book.title], [text.word('author'), book.book.author], [text.t('reading.publisher'), book.book.publisher], [text.t('reading.published'), book.book.published_date], ['ISBN 13', book.book.isbn13], ['ISBN 10', book.book.isbn10], [text.word('category'), bookCategories(book).map(c => categoryLabel(c, text.t)).join(', ') || text.t('reading.noCategory')], [text.t('reading.source'), book.book.external_source]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? text.t('reading.noInfo')}</dd></div>)}</dl><p className="reading-prose">{book.book.description?.replace(/<[^>]*>/g, '') || text.say('noItemDescription')}</p></div> : <><div className="reading-list-heading"><h3>{isHighlight ? text.say('memorable') : (labels?.memo?.trim() ? text.memo : text.t('reading.notes'))}</h3>{isHighlight ? <select aria-label={text.t('reading.sortQuotes')} className="field" value={pageSort ? 'page' : 'time'} onChange={e => setPageSort(e.target.value === 'page')}><option value="time">{text.t('reading.sortRecent')}</option><option value="page">{text.t('reading.sortPage')}</option></select> : null}<button className="btn btn-primary" disabled={busy} onClick={() => setEntry('new')}>+ {text.say('addEntry', { name: tabName[tab] })}</button></div>{(isHighlight ? (pageSort ? [...highlights].sort((a, b) => (a.page_number ?? Infinity) - (b.page_number ?? Infinity)) : highlights) : notes).map(item => <article className={isHighlight ? 'reading-highlight' : 'reading-note'} data-theme-slot={isHighlight ? 'reading-highlight' : 'reading-note'} key={item.id}>{'page_number' in item && typeof item.page_number === 'number' && item.page_number ? <p className="reading-muted">p.{item.page_number}</p> : null}<p className="reading-prose">{item.content}</p>{'note' in item && typeof item.note === 'string' && item.note ? <p className="reading-prose reading-muted">{item.note}</p> : null}<p className="reading-muted">{item.tags.map(t => '#' + t).join(' ')} · {text.date(item.created_at)}{item.updated_at !== item.created_at ? ' · ' + text.say('edited', { date: text.date(item.updated_at) }) : ''}</p><div className="reading-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setEntry(item)}>{text.say('modify')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(item)}>{text.t('delete')}</button></div></article>)}{!(isHighlight ? highlights : notes).length ? <p className="reading-empty">{text.say(isHighlight ? 'emptyHighlights' : 'emptyNotes')}</p> : null}</>}
 </section><button className="btn btn-ghost reading-remove" disabled={busy} onClick={remove}>{text.say('removeItem')}</button>
 {entry ? <EntryModal key={typeof entry === 'string' ? 'new' : entry.id} text={text} kind={isHighlight ? 'highlight' : 'note'} entry={entry === 'new' ? null : entry} busy={busy} close={() => setEntry(null)} save={async (input) => { if (isHighlight) {
        const h = input as HighlightInput;
        await entryAct(() => entry === 'new' ? repo.createHighlight(book.id, h) : repo.updateHighlight(entry.id, h));
    }
    else {
        await entryAct(() => entry === 'new' ? repo.createReadingNote(book.id, input) : repo.updateReadingNote(entry.id, input));
    } }}/> : null}
 {confirm ? <Modal title={text.say('deleteEntry', { name: tabName[tab] })} close={() => setConfirm(null)}><p>{text.say('deleteEntryBody')}</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void entryAct(() => 'source_type' in confirm ? repo.deleteHighlight(confirm.id) : repo.deleteReadingNote(confirm.id))}>{text.t('delete')}</button><button className="btn btn-ghost" onClick={() => setConfirm(null)}>{text.t('cancel')}</button></div></Modal> : null}
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
            <input aria-label={words.say('editName', { name: words.word('category') })} className="field mt-1 w-full" value={text} onChange={event => setText(event.target.value)} placeholder={words.say('categoryPlaceholder')} />
        </label>
        <button className="btn btn-line" disabled={busy}>{words.say('saveItemInfo')}</button>
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
        setSaved(true); }}><label>{text.word('status')}<select className="field" value={draft.reading_status} onChange={e => { const status = e.target.value as ReadingStatus; patch({ reading_status: status, ...(status === 'reading' && !draft.started_at ? { started_at: todayISO() } : {}) }); }}>{text.statuses().map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="reading-form-rating"><p>{text.word('rating')}</p><StarRating value={draft.rating??null} disabled={busy} onChange={rating=>patch({rating})}/></div><label>{text.word('startedAt')}<input className="field" type="date" value={draft.started_at ?? ''} onChange={e => patch({ started_at: e.target.value || null })}/></label><label>{text.word('finishedAt')}<input className="field" type="date" value={draft.finished_at ?? ''} onChange={e => patch({ finished_at: e.target.value || null })}/></label><label className="reading-wide">{text.word('note')}<textarea className="field" value={draft.review} onChange={e => patch({ review: e.target.value })}/></label><label className="reading-wide">{text.word('tags')}<input className="field" placeholder={text.say('tagsPlaceholder')} value={tagText} onChange={e => { setTagText(e.target.value); setSaved(false); }}/></label><div className="reading-wide reading-actions"><button className="btn btn-primary" disabled={busy}>{busy ? text.t('saving') : text.say('saveRecord')}</button>{saved ? <span role="status">{text.say('savedNotice')}</span> : null}</div></form>;
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
    return <Modal title={text.say(entry ? 'editEntry' : 'addEntry', { name: kind === 'highlight' ? text.highlight : text.memo })} close={close} busy={busy}><form className="reading-form" onSubmit={e => { e.preventDefault(); const input = { content: content.trim(), tags: tags(tagText) }; void save(kind === 'note' ? input : { ...input, page_number: page ? Number(page) : null, note, source_type: entry && 'source_type' in entry ? entry.source_type : 'manual', source_url: entry && 'source_url' in entry ? entry.source_url : null, source_title: entry && 'source_title' in entry ? entry.source_title : null }); }}><label>{kind === 'highlight' ? text.say('memorable') : text.cap(text.say('memoContent'))}<textarea required rows={5} className="field" value={content} onChange={e => setContent(e.target.value)}/></label>{kind === 'highlight' ? <><label>{text.say('pageOptional')}<input type="number" min={1} step={1} className="field" value={page} onChange={e => setPage(e.target.value)}/></label><label>{text.say('highlightMemo')}<textarea className="field" value={note} onChange={e => setNote(e.target.value)}/></label></> : null}<label>{text.say('tags')}<input className="field" placeholder={text.say('noteTagsPlaceholder')} value={tagText} onChange={e => setTagText(e.target.value)}/></label><div className="reading-actions"><button className="btn btn-primary" disabled={busy || !content.trim()}>{busy ? text.t('saving') : text.t('save')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>{text.t('cancel')}</button></div></form></Modal>;
}
