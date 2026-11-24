import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AddFab } from '../../components/common/AddFab.tsx';
import { NotificationBell } from '../../components/calendars/NotificationBell.tsx';
import { MobileMoreLink } from '../../components/layout/MobileTopBar.tsx';
import { Link, matchPath, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { readingProgress, sameBook } from '@blanky/types';
import type { BookMetadata, BookPatch, Highlight, HighlightInput, LibraryBook, ReadingLibrary, ReadingNote, ReadingStatus, Shelf, ShelfInput } from '@blanky/types';
import type { ReadingRepository } from '@blanky/api';
import type { ReadingStoreRepository } from '../../services/reading/local.ts';
import { readingService, importLegacyReading, importedBookId } from '../../services/reading/index.ts';
import { PageTour } from '../../features/onboarding/Onboarding.tsx';
import { isSupabaseConfigured } from '../../services/supabase/client.ts';
import { useSession } from '../../state/useSession.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import { useLibrary } from '../../state/useLibrary.ts';
import { PageCanvas } from '../../features/pages/PageCanvas.tsx';
import { resolveLayout } from '../../features/pages/layout.ts';
import { ArrowLeft, BookOpen, Check, ChevronDown, EllipsisVertical, GripVertical, Library, LoaderCircle, Pencil, Plus, Search, Share2, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { ROUTES } from '../../constants/routes.ts';
import { DEFAULT_SHELF_ICON, ReadingIcon, ReadingIconPicker } from './ReadingIconPicker.tsx';
import { DEFAULT_SWATCH } from '../../constants/swatches.ts';
import { StarRating } from './StarRating.tsx';
import { readingText, type ReadingText } from './readingText.ts';
import { todayISO } from '../../utils/date.ts';
import { saveAndClose } from '../../utils/saveAndClose.ts';
import { useReadingDrag } from './useReadingDrag.ts';
import { showStatusToast } from '../../components/layout/statusToast.ts';
import { ThemeIcon } from '../../theme/ThemeIcon.tsx';
import { useBackLayer } from '../Schedule/mobile/layers.ts';
import { Sheet } from '../Schedule/mobile/Sheet.tsx';
import { createAutosave, type AutosaveStatus } from '../Memo/memoAutosave.ts';
import { shareMemos } from '../Memo/memoShare.ts';
import '../Schedule/mobile/mobileCalendar.css';
import '../Memo/memo.css';
import { bookCategories, categoryLabel, matchesCategory, moveShelf, UNCLASSIFIED } from './readingInteractions.ts';
import './reading.css';
const ReadingErrorContext = createContext('');
const noLegacyBooks: ReturnType<typeof useLibrary>['books'] = [];
const noLegacyLogs: ReturnType<typeof useLibrary>['logs'] = [];
const empty: ReadingLibrary = { books: [], shelves: [], memberships: [] };
const tags = (value: string) => [...new Set(value.split(/[,，#\s]+/).map(t => t.trim()).filter(Boolean))];
const shelfColor = (name: string) => /^#[0-9a-f]{6}$/i.test(name) ? name : 'var(--blanky-colors-' + (name === 'textSecondary' ? 'text-secondary' : name) + ')';
function Cover({ book, decorative = false }: {
    book: BookMetadata;
    decorative?: boolean;
}) { const { t } = useI18n(); const [failed, setFailed] = useState(false); return <div className="reading-book-cover" data-theme-slot="reading-book-cover" aria-hidden={decorative || undefined}>{book.cover_url && !failed ? <img draggable={false} src={book.cover_url} alt={decorative ? '' : t('reading.coverAlt', { title: book.title })} loading="lazy" onError={() => setFailed(true)}/> : decorative ? <BookOpen size={16}/> : <span>{book.title}</span>}</div>; }
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
    const [searchingLibrary, setSearchingLibrary] = useState(false);
    const [openPanel, setOpenPanel] = useState<'navigation' | 'filters' | null>(null);
    const phone = useMediaQuery(PHONE_QUERY);
    const appHeader = phone && !repository && Boolean(matchPath(ROUTES.reading, location.pathname));
    const showFilters = Boolean(repository) && !bookId && !searchingLibrary && openPanel === 'filters';
    const navigationId = useId();
    const filtersId = useId();
    const navigationButton = useRef<HTMLButtonElement>(null);
    const filtersButton = useRef<HTMLButtonElement>(null);
    const searchButton = useRef<HTMLButtonElement>(null);
    const libraryInput = useRef<HTMLInputElement>(null);
    const restoreSearchFocus = useRef(false);
    useEffect(() => {
        if (bookId) return;
        if (searchingLibrary) libraryInput.current?.focus();
        else if (restoreSearchFocus.current) {
            searchButton.current?.focus();
            restoreSearchFocus.current = false;
        }
    }, [bookId, searchingLibrary]);
    const closeLibrarySearch = () => {
        restoreSearchFocus.current = true;
        setSearchingLibrary(false);
        setQuery('');
    };
    const chooseFilter = (id: string) => {
        setFilter(id);
        if (id === 'all' || text.statuses().some(([statusId]) => statusId === id)) setStatus('all');
        setOpenPanel(null);
        navigationButton.current?.focus();
    };
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
    // Phone 새 책장 (book detail and add sheet): the shelf editor's defaults; `bookId` also puts that book on it.
    const createShelf = async (name: string, bookId?: string) => {
        let id: string | null = null;
        const ok = await act(async () => {
            const shelf = await repo.createShelf({ name, description: '', icon: DEFAULT_SHELF_ICON, color: DEFAULT_SWATCH, sort_order: data.shelves.length });
            if (!shelf) throw new Error(t('reading.errors.shelfMissing'));
            if (bookId) await repo.addBookToShelf(bookId, shelf.id);
            id = shelf.id;
        });
        return ok ? id : null;
    };
    const drag = useReadingDrag((item, target) => {
        if (item.kind === 'shelf') reorder(moveShelf(data.shelves, item.id, target).map(s => s.id));
        else if (data.books.some(b => b.id === item.id) && data.shelves.some(s => s.id === target)) {
            void act(() => repo.addBookToShelf(item.id, target)).then(ok => { if (ok) setNotice(text.say('addedToShelf')); });
        }
    }, busy);
    const addBook = async (book: BookMetadata, status: ReadingStatus, shelves: string[]) => { const ok = await act(async () => { const id = await repo.addBook(book, status, shelves); if (id && status === 'reading') { const saved = await repo.getUserBook(id); if (saved.reading_status === 'reading' && !saved.started_at) await repo.updateBook(id, { started_at: todayISO() }); } }); return !!ok; };
    const draggingBook = drag.active?.kind === 'book';
    const showNavigation = !bookId && !searchingLibrary && (openPanel === 'navigation' || draggingBook);
    const closeNavigation = () => {
        setOpenPanel(null);
        navigationButton.current?.focus({ preventScroll: true });
    };
    const categories = [...new Set(data.books.flatMap(bookCategories))].sort((a,b) => a.localeCompare(b));
    const activeCategory = category === 'all' || category === UNCLASSIFIED || categories.includes(category) ? category : 'all';
    const selected = data.shelves.find(s => s.id === filter);
    const readingStatuses = text.statuses();
    const allLabel = repository ? text.say('all') : text.say('allReading');
    const filterLabel = selected?.name ?? readingStatuses.find(([id]) => id === filter)?.[1] ?? allLabel;
    const matchesFilter = (b: LibraryBook) => filter === 'all' || b.reading_status === filter || data.memberships.some(m => m.shelf_id === filter && m.user_book_id === b.id);
    const term = query.trim().toLocaleLowerCase(locale);
    const filtered = data.books.filter(b => searchingLibrary
        ? (b.book.title + ' ' + b.book.author).toLocaleLowerCase(locale).includes(term)
        : matchesFilter(b) && (status === 'all' || b.reading_status === status) && matchesCategory(b, activeCategory));
    const canDragBooks = filter === 'all' && !searchingLibrary && data.shelves.length > 0;
    const current = data.books.find(b => b.id === bookId);
    return <ReadingErrorContext.Provider value={error}><div className="reading-page" data-theme-slot="reading-page" data-app-bar={appHeader || undefined}
        onKeyDown={event => {
            if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || search || shelfEditor || confirm || bookId) return;
            if (searchingLibrary) closeLibrarySearch();
            else if (openPanel) {
                setOpenPanel(null);
                (showNavigation ? navigationButton : filtersButton).current?.focus();
            }
        }}>
 {bookId ? null : <div className="reading-top" data-dragging={draggingBook || undefined}>
 <div className="reading-folders-dim" data-open={showNavigation || undefined} aria-hidden="true" onClick={closeNavigation}/>
 {!heading || searchingLibrary ? <h1 className="sr-only">{heading ?? t('reading.title')}</h1> : null}
 <header data-theme-slot="page-header" className={appHeader ? 'reading-heading mobile-tab-header' : 'reading-heading'}>
 {searchingLibrary ? <div className="reading-library-search" role="search">
 <button type="button" className="reading-header-icon" aria-label={t('close')} onClick={closeLibrarySearch}><ArrowLeft size={22} aria-hidden="true"/></button>
 <input ref={libraryInput} type="search" enterKeyHint="search" aria-label={text.say('searchLibrary')} placeholder={text.say('searchLibraryPlaceholder', { author: text.inline('author') })} value={query} onChange={e => setQuery(e.target.value)}/>
 {query ? <button type="button" className="reading-header-icon" aria-label={t('clearSearch')} onClick={() => { setQuery(''); libraryInput.current?.focus(); }}><X size={20} aria-hidden="true"/></button> : null}
 </div> : <>
 {appHeader ? <MobileMoreLink/> : null}
 {heading ? <div className="reading-custom-heading"><h1>{heading}</h1><p className="reading-muted">{text.word('tagline')}</p></div> : null}
 <button ref={navigationButton} type="button" data-tour="reading-folders" className={appHeader ? 'reading-heading-title mobile-tab-title' : 'reading-heading-title'} aria-expanded={showNavigation} aria-controls={navigationId} onClick={() => setOpenPanel(showNavigation ? null : 'navigation')}>
   {selected ? <ReadingIcon value={selected.icon}/> : null}<span>{filterLabel}</span>
   <small>{text.number(data.books.filter(matchesFilter).length)}</small><ChevronDown size={18} aria-hidden="true"/>
 </button>
 {repository ? <button ref={filtersButton} type="button" className="reading-header-icon reading-filter-button" data-filtered={status !== 'all' || activeCategory !== 'all' || undefined} aria-expanded={showFilters} aria-controls={filtersId} aria-label={text.say('filters')} onClick={() => setOpenPanel(showFilters ? null : 'filters')}><SlidersHorizontal size={18} strokeWidth={1.7} aria-hidden="true"/></button> : null}
 <button ref={searchButton} data-tour="reading-search" type="button" className="reading-header-icon mcal-ib" aria-label={text.say('searchLibrary')} onClick={() => { setOpenPanel(null); setSearchingLibrary(true); }}><Search size={22} strokeWidth={1.8} aria-hidden="true"/></button>
 {appHeader && isSupabaseConfigured ? <NotificationBell align="right"/> : null}
 {!appHeader ? <button data-tour="add-book" className="btn btn-ghost reading-header-add" onClick={() => setSearch(true)}>+ {text.say('addSearch')}</button> : null}
 </>}
 </header>
 <nav id={navigationId} className="reading-folders reading-folders-disclosure" data-open={showNavigation || undefined} inert={!showNavigation} data-theme-slot="reading-sidebar" aria-label={text.say('shelvesLabel')}>
 <div className="reading-status-filters" role="group" aria-label={text.say('filterLabel', { name: text.word('status') })}>{[['all', allLabel] as const, ...readingStatuses].map(([id, label]) => <button key={id} aria-pressed={filter === id} className={filter === id ? 'reading-nav selected' : 'reading-nav'} onClick={() => chooseFilter(id)}>{label}<span>{text.number(id === 'all' ? data.books.length : data.books.filter(b => b.reading_status === id).length)}</span></button>)}</div>
 <div className="reading-shelf-heading">{repository ? text.say('myShelves') : text.cap(text.shelf)}<button className="btn btn-ghost" onClick={() => setShelfEditor('new')} aria-label={text.say('newShelf')}>+</button></div>
 {data.shelves.map((s, index) => <div className={'reading-shelf' + (drag.target===s.id?' reading-drop-target':'') + (drag.active?.id===s.id?' reading-dragging':'')} data-theme-slot="reading-shelf" data-reading-shelf-id={s.id} key={s.id}>
 <button type="button" className="reading-drag-handle" disabled={busy} aria-label={text.say('reorderShelf',{name:s.name})} title={text.say('reorderHint')} onPointerDown={e=>drag.start(e,{kind:'shelf',id:s.id,label:s.name})} onClick={drag.click} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();const next=index+(e.key==='ArrowUp'?-1:1);if(data.shelves[next])reorder(moveShelf(data.shelves,s.id,data.shelves[next].id).map(s=>s.id))}}}><GripVertical size={14} aria-hidden="true"/></button>
 <button aria-pressed={filter === s.id} className={filter === s.id ? 'reading-nav selected' : 'reading-nav'} onClick={() => chooseFilter(s.id)}><span style={{color:shelfColor(s.color)}}><ReadingIcon value={s.icon}/></span>{s.name}<span>{text.number(data.memberships.filter(m => m.shelf_id === s.id).length)}</span></button><button className="reading-edit" aria-label={text.say('editShelfNamed', { name: s.name })} onClick={() => setShelfEditor(s)}>⋯</button></div>)}
 </nav>
 </div>}
 {repository ? <div id={filtersId} hidden={!showFilters} className="reading-library-filters">
 <select className="field" aria-label={text.say('filterLabel', { name: text.word('status') })} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{text.say('allStatuses')}</option>{readingStatuses.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
 <select className="field" aria-label={text.say('filterLabel', { name: text.word('category') })} value={activeCategory} onChange={e=>setCategory(e.target.value)}><option value="all">{text.say('allKinds')}</option>{categories.map(c=><option value={c} key={c}>{categoryLabel(c, t)}</option>)}<option value={UNCLASSIFIED}>{t('reading.noCategory')}</option></select>
 <button type="button" className="btn btn-line" disabled={busy} onClick={()=>void act(async()=>{const result=await repo.refreshCategories();setNotice(text.say('categoriesChecked',{count:text.count(result.updated)})+(result.remaining?' '+text.say('categoriesRemaining',{count:text.count(result.remaining,'이')}):''))})}>{text.say('loadCategories')}</button>
 </div> : null}
 {error ? <div role="alert" className="reading-error">{legacyTarget ? t('reading.openFailed') : error}<button className="btn btn-ghost" disabled={busy} onClick={retry}>{t('reading.retry')}</button></div> : null}
 {loading ? <div className="reading-loading" role="status"><LoaderCircle size={24} aria-hidden="true" className="motion-safe:animate-spin"/><span className="sr-only">{text.say('loading')}</span></div> : <section className="reading-content" data-book-detail={Boolean(bookId) || undefined}>
 {bookId ? (current ? <BookDetail key={current.id} book={current} basePath={basePath} labels={labels} text={text} appBar={phone} createShelf={createShelf} shelves={data.shelves} shelfIds={data.memberships.filter(m => m.user_book_id === current.id).map(m => m.shelf_id)} saveRecord={async patch => { await repo.updateBook(current.id, patch); await refresh(); }} saveMetadata={repo.updateBookMetadata ? metadata => act(() => repo.updateBookMetadata!(current.id, metadata)) : undefined} repo={repo} busy={busy} act={act} remove={() => { setConfirmBody(trashBook ? 'confirmTrashItemBody' : 'confirmDeleteBody'); setConfirm(() => async () => { await (trashBook ? trashBook(current.id) : repo.removeBook(current.id)); navigate(basePath); }); }}/> : <p>{text.say('itemMissing')} <Link to={basePath}>{text.say('backToLibrary')}</Link></p>) : <>
 {repository ? <div className="reading-list-heading">
 <h2>{searchingLibrary ? text.say('searchResults') : text.say(labels?.library?.trim() ? 'myLibrary' : 'myReadingLibrary')}</h2>
 <span role={searchingLibrary ? 'status' : undefined} className="reading-muted">{text.count(filtered.length)}</span>
 </div> : searchingLibrary ? <p className="sr-only" role="status">{text.say('searchResults')} {text.count(filtered.length)}</p> : null}
 {!searchingLibrary && selected?.description ? <p className="reading-muted reading-shelf-description">{selected.description}</p> : null}
 {notice || legacyMissing?<p role="status" className="reading-muted">{notice || t('reading.openMissing')}</p>:null}
 <div className="reading-book-grid" data-theme-slot="reading-book-grid">{filtered.map(b => <article className="reading-book-card" data-theme-slot="reading-book-card" key={b.id} draggable={false} onDragStart={e=>e.preventDefault()} onPointerDown={e=>{if(canDragBooks&&e.pointerType!=='touch')drag.start(e,{kind:'book',id:b.id,label:b.book.title})}} onClick={drag.click} data-reading-draggable={canDragBooks?'true':undefined}>
 {canDragBooks ? <button type="button" className="reading-book-drag-handle" aria-label={text.say('dragToShelf',{title:b.book.title})} onPointerDown={e=>{e.stopPropagation();drag.start(e,{kind:'book',id:b.id,label:b.book.title})}}><GripVertical size={16} aria-hidden="true"/></button> : null}
 <Link to={bookPath(b.id)} state={{ fromLibrary: true }}><Cover book={b.book} decorative/><div className="reading-book-summary"><h3>{b.book.title}</h3><p>{b.book.author || text.say('unknownAuthor', { author: text.inline('author') })}</p><p className="reading-book-status" data-status={b.reading_status}><span className="reading-status-dot" aria-hidden="true"/>{text.status(b.reading_status)}</p></div></Link>
 </article>)}</div>
 {!filtered.length ? <div className="reading-empty">{searchingLibrary ? <p>{text.say('emptySearchResults')}</p> : <><p>{text.say('emptyTitle')}</p><button className="btn btn-ghost" onClick={() => setSearch(true)}>{text.say('searchItem')}</button></>}</div> : null}
 </>}
 </section>}
 {!isSupabaseConfigured && !loading && !bookId && !searchingLibrary ? <p className="reading-muted reading-local-mode">{text.say('localMode')}</p> : null}
 {search ? (phone ? <PhoneAddSheet text={text} repo={repo} data={data} defaultShelf={selected?.id} busy={busy} close={() => setSearch(false)} add={addBook} createShelf={createShelf}/> : <SearchModal text={text} repo={repo} data={data} defaultShelf={selected?.id} busy={busy} close={() => setSearch(false)} add={addBook}/>) : null}
 {shelfEditor ? <ShelfModal text={text} shelf={shelfEditor === 'new' ? null : shelfEditor} order={data.shelves.length} busy={busy} close={() => setShelfEditor(null)} save={async (input) => { if (await act(() => shelfEditor === 'new' ? repo.createShelf(input) : repo.updateShelf(shelfEditor.id, input)))
        setShelfEditor(null); }} remove={shelfEditor === 'new' ? undefined : () => { const id = shelfEditor.id; setShelfEditor(null); setConfirmBody('confirmDeleteBody'); setConfirm(() => async () => { await repo.deleteShelf(id); setFilter('all'); }); }}/> : null}
 {confirm ? <Modal title={text.say('confirmDeleteTitle')} close={() => setConfirm(null)}><p>{text.say(confirmBody)}</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void act(confirm).then(ok => { if (ok)
        setConfirm(null); })}>{t('delete')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(null)}>{t('cancel')}</button></div></Modal> : null}
 {drag.active?<div className="reading-drag-preview" style={{left:drag.active.x+14,top:drag.active.y+14}} aria-hidden="true">{text.say(drag.active.kind==='book'?'addToShelf':'reorderShelves')} · {drag.active.label}</div>:null}
 {!repository && !bookId ? <AddFab hidden={search || searchingLibrary || showNavigation} onManual={() => setSearch(true)} manualLabel={text.say('addSearch')} tour="add-book"/> : null}
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
    const [draft, setDraft] = useState<ShelfInput>(shelf ?? { name: '', description: '', icon: DEFAULT_SHELF_ICON, color: DEFAULT_SWATCH, sort_order: order });
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const nameId = useId();
    const error = useContext(ReadingErrorContext);
    useEffect(() => {
        const dialog = dialogRef.current;
        const previous = document.activeElement;
        dialog?.showModal();
        return () => {
            dialog?.close();
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
        };
    }, []);
    return <dialog ref={dialogRef} className="reading-modal reading-shelf-dialog" data-theme-slot="modal" role="dialog" aria-labelledby={titleId}
        onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
        <header>
            <h2 id={titleId}>{text.say(shelf ? 'editShelf' : 'newShelf')}</h2>
            <button type="button" data-theme-slot="button" className="icon-btn" aria-label={text.t('close')} disabled={busy} onClick={close}><X size={18} aria-hidden="true"/></button>
        </header>
        {error ? <p role="alert" className="reading-error">{error}</p> : null}
        <form className="reading-form reading-shelf-form" onSubmit={event => { event.preventDefault(); if (!busy) void save({ ...draft, name: draft.name.trim() }); }}>
            <fieldset className="reading-shelf-fields" disabled={busy}>
                <div className="reading-shelf-name-field">
                    <label htmlFor={nameId}>{text.say('shelfName')}</label>
                    <div className="reading-shelf-name-row">
                        <input id={nameId} required maxLength={100} className="field" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })}/>
                        <ReadingIconPicker value={draft.icon} onChange={icon => setDraft(current => ({ ...current, icon }))} color={draft.color} onColor={color => setDraft(current => ({ ...current, color }))}/>
                    </div>
                </div>
                <label>{text.say('description')}<textarea className="field" rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
            </fieldset>
            <footer className="reading-shelf-actions">
                {remove ? <button type="button" data-theme-slot="button" className="btn btn-ghost reading-shelf-delete" disabled={busy} onClick={remove}><Trash2 size={15} aria-hidden="true"/>{text.say('deleteShelf')}</button> : null}
                <div>
                    <button type="button" data-theme-slot="button-secondary" className="btn btn-ghost" disabled={busy} onClick={close}>{text.t('cancel')}</button>
                    <button type="submit" data-theme-slot="button-primary" className="btn btn-primary" disabled={busy || !draft.name.trim()}>{shelf ? text.t('save') : text.say('create')}</button>
                </div>
            </footer>
        </form>
    </dialog>;
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
                if (await add(manualBook(title, author), 'want', defaultShelf ? [defaultShelf] : [])) { close(); return; }
                setBusy(false);
            } catch { setBusy(false); }
        }}>
            <label>{text.word('title')}<input required className="field" value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label>{text.word('author')}<input className="field" value={author} onChange={event => setAuthor(event.target.value)} /></label>
            <button className="btn btn-line" disabled={busy || !title.trim()}>{text.say('addItem')}</button>
        </form>
    </details>;
}
/** Metadata for a book typed in by hand (desktop 직접 추가 and the phone sheet's 직접 입력). */
const manualBook = (title: string, author: string): BookMetadata => ({ title: title.trim(), author, external_source: 'manual', external_id: crypto.randomUUID(),
    isbn10: null, isbn13: null, publisher: null, published_date: null, description: null, cover_url: null, page_count: null });
const RECENT_SEARCHES = 'blanky.reading.recentSearches';
/** The last 5 book searches, on this device only; storage that fails (private mode, quota) just keeps none. */
const readRecentSearches = (): string[] => {
    try {
        const value: unknown = JSON.parse(localStorage.getItem(RECENT_SEARCHES) ?? '[]');
        return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 5) : [];
    } catch { return []; }
};
const saveRecentSearch = (query: string) => {
    const next = [query, ...readRecentSearches().filter(item => item !== query)].slice(0, 5);
    try { localStorage.setItem(RECENT_SEARCHES, JSON.stringify(next)); } catch { /* Recent searches are a convenience only. */ }
    return next;
};
/**
 * Phone 책 추가 (<768px): a tall bottom sheet with 검색 | 직접 입력. A search result opens a confirm step
 * (status and shelf chips, ＋ 새 책장) whose system Back returns to the results; adding closes with a toast.
 */
function PhoneAddSheet({ text, repo, data, defaultShelf, busy, close, add, createShelf }: {
    text: ReadingText;
    repo: ReadingRepository;
    data: ReadingLibrary;
    defaultShelf?: string;
    busy: boolean;
    close: () => void;
    add: (b: BookMetadata, s: ReadingStatus, ids: string[]) => Promise<boolean>;
    createShelf: (name: string) => Promise<string | null>;
}) {
    const error = useContext(ReadingErrorContext);
    const [mode, setMode] = useState<'search' | 'manual'>('search');
    const [query, setQuery] = useState(''), [results, setResults] = useState<BookMetadata[]>([]), [searching, setSearching] = useState(false), [searched, setSearched] = useState(false), [searchError, setSearchError] = useState('');
    const [recent, setRecent] = useState(readRecentSearches);
    const [selected, setSelected] = useState<BookMetadata | null>(null);
    const [title, setTitle] = useState(''), [author, setAuthor] = useState('');
    const [status, setStatus] = useState<ReadingStatus>('want');
    const [shelfIds, setShelfIds] = useState<string[]>(defaultShelf ? [defaultShelf] : []);
    const request = useRef(0);
    const input = useRef<HTMLInputElement>(null);
    useEffect(() => () => { request.current++; }, []);
    // The sheet focuses itself when it opens; the search field takes over right after.
    useEffect(() => { if (mode === 'search' && !selected) requestAnimationFrame(() => input.current?.focus({ preventScroll: true })); }, [mode, selected]);
    useBackLayer(Boolean(selected), () => setSelected(null));
    const search = async (value: string) => {
        const q = value.trim();
        if (!q) return;
        const id = ++request.current;
        setQuery(q); setSearching(true); setSearchError(''); setSearched(false); setResults([]);
        setRecent(saveRecentSearch(q));
        input.current?.blur();
        try {
            const books = await repo.searchBooks(q);
            if (id === request.current) { setResults(books); setSearched(true); }
        }
        catch (e) { if (id === request.current) setSearchError(e instanceof Error ? e.message : text.say('searchFailed')); }
        finally { if (id === request.current) setSearching(false); }
    };
    const submit = async (book: BookMetadata) => {
        if (busy) return;
        if (!await add(book, status, shelfIds)) return;
        close();
        showStatusToast({ text: text.say('addedToLibraryNotice'), tone: 'saved' });
    };
    const toggle = (id: string) => setShelfIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
    const choices = <>
        <div className="reading-add-group"><p>{text.word('status')}</p><div className="reading-pd-chips" role="group" aria-label={text.word('status')}>{text.statuses().map(([id, label]) => <button key={id} type="button" className="reading-pd-chip" aria-pressed={status === id} onClick={() => setStatus(id)}>{label}</button>)}</div></div>
        <div className="reading-add-group"><p>{text.cap(text.shelf)} <span>· {text.say('multiSelect')}</span></p><div className="reading-pd-chips" role="group" aria-label={text.cap(text.shelf)}>
            {data.shelves.map(s => <button key={s.id} type="button" className="reading-pd-chip" aria-pressed={shelfIds.includes(s.id)} onClick={() => toggle(s.id)}>{shelfIds.includes(s.id) ? <Check size={14} strokeWidth={2.4} aria-hidden="true"/> : <span className="memo-phone-dot" style={{ background: shelfColor(s.color) }} aria-hidden="true"/>}{s.name}</button>)}
            <NewShelfRow chip text={text} busy={busy} create={name => createShelf(name).then(id => { if (id) setShelfIds(current => [...current, id]); return Boolean(id); })}/>
        </div></div>
    </>;
    const head = (heading: string, back?: () => void) => <div className="reading-add-head">
        {back ? <button type="button" className="memo-phone-icon" aria-label={text.say('backToResults')} onClick={back}><ArrowLeft size={22} strokeWidth={1.7} aria-hidden="true"/></button> : null}
        <h2>{heading}</h2>
        <button type="button" className="memo-phone-icon" aria-label={text.t('close')} onClick={close}><X size={22} strokeWidth={1.7} aria-hidden="true"/></button>
    </div>;
    const alert = error ? <p role="alert" className="reading-pd-error">{error}</p> : null;
    if (selected) return <Sheet title={text.say('addToLibrary')} onClose={close}><div className="reading-add">
        {head(text.say('addToLibrary'), () => setSelected(null))}
        <div className="reading-add-body">
            {alert}
            <div className="reading-add-book"><Cover book={selected}/><div><b>{selected.title}</b><small>{selected.author}</small><small>{[selected.publisher, selected.published_date?.slice(0, 4)].filter(Boolean).join(' · ')}</small></div></div>
            {choices}
        </div>
        <div className="reading-add-foot"><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit(selected)}>{busy ? text.say('adding') : text.say('addToLibrary')}</button></div>
    </div></Sheet>;
    return <Sheet title={text.say('addItem')} onClose={close}><div className="reading-add">
        {head(text.say('addItem'))}
        <div className="reading-add-mode" role="group" aria-label={text.say('addMethod')}>
            <button type="button" className="reading-pd-chip" aria-pressed={mode === 'search'} onClick={() => setMode('search')}>{text.t('search')}</button>
            <button type="button" className="reading-pd-chip" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>{text.say('manualEntry')}</button>
        </div>
        {mode === 'search' ? <>
            <form className="reading-add-search" role="search" onSubmit={event => { event.preventDefault(); void search(query); }}>
                <Search size={18} strokeWidth={1.8} aria-hidden="true"/>
                <input ref={input} type="search" enterKeyHint="search" autoComplete="off" maxLength={200} aria-label={text.say('searchQuery', { title: text.inline('title'), author: text.inline('author') })} placeholder={text.say('searchQuery', { title: text.inline('title'), author: text.inline('author') })} value={query} onChange={event => setQuery(event.target.value)}/>
                {query ? <button type="button" aria-label={text.t('clearSearch')} onClick={() => { setQuery(''); input.current?.focus(); }}><X size={16} strokeWidth={2} aria-hidden="true"/></button> : null}
            </form>
            <div className="reading-add-body">
                {alert}
                {searching ? <div role="status" aria-label={text.say('searching')}>{[0, 1, 2].map(i => <div className="reading-add-skeleton" key={i} aria-hidden="true"><i/><span><i/><i/></span></div>)}</div>
                    : searchError ? <p role="alert" className="reading-add-state">{searchError}</p>
                    : searched && !results.length ? <div className="reading-add-state"><BookOpen size={28} strokeWidth={1.5} aria-hidden="true"/><p>{text.say('noResults')}</p><button type="button" className="reading-pd-chip" onClick={() => { setTitle(query); setMode('manual'); }}>{text.say('enterManually')}</button></div>
                    : searched ? <>
                        <p className="reading-add-count" role="status">{text.say('resultCount', { count: text.number(results.length) })}</p>
                        {results.map(b => { const exists = data.books.some(x => sameBook(x.book, b)); return <button type="button" className="reading-add-result" key={b.external_source + b.external_id} disabled={exists} onClick={() => setSelected(b)}>
                            <Cover book={b} decorative/>
                            <span className="reading-add-text"><b>{b.title}</b><span>{b.author}</span><small>{[b.publisher, b.published_date?.slice(0, 4)].filter(Boolean).join(' · ')}</small></span>
                            {exists ? <span className="reading-add-owned"><Check size={14} strokeWidth={2.2} aria-hidden="true"/>{text.say('inLibrary')}</span> : <span className="reading-add-plus" aria-hidden="true"><Plus size={18} strokeWidth={2}/></span>}
                        </button>; })}
                    </>
                    : <>
                        {recent.length ? <div className="reading-add-recent"><h3>{text.say('recentSearches')}</h3><div className="reading-pd-chips">{recent.map(item => <button key={item} type="button" className="reading-pd-chip" onClick={() => void search(item)}>{item}</button>)}</div></div> : null}
                        <div className="reading-add-state"><Search size={28} strokeWidth={1.5} aria-hidden="true"/><p>{text.say('searchHint')}</p></div>
                    </>}
            </div>
        </> : <form className="reading-add-manual" onSubmit={event => { event.preventDefault(); if (title.trim()) void submit(manualBook(title, author)); }}>
            <div className="reading-add-body">
                {alert}
                <label className="reading-add-field">{text.word('title')}<input required className="field" placeholder={text.say('required')} enterKeyHint="next" value={title} onChange={event => setTitle(event.target.value)}/></label>
                <label className="reading-add-field">{text.word('author')}<input className="field" placeholder={text.say('optional')} value={author} onChange={event => setAuthor(event.target.value)}/></label>
                {choices}
            </div>
            <div className="reading-add-foot"><button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? text.say('adding') : text.say('addToLibrary')}</button></div>
        </form>}
    </div></Sheet>;
}
/** "11.02": the phone detail's compact local month.day. */
const shortDate = (iso: string) => { const date = new Date(iso); return String(date.getMonth() + 1).padStart(2, '0') + '.' + String(date.getDate()).padStart(2, '0'); };
function BookDetail({ book, repo, busy, act, remove, basePath = '/reading', labels, text, saveMetadata, saveRecord, shelves, shelfIds, createShelf, appBar = false }: {
    text: ReadingText;
    saveMetadata?: (metadata: Pick<BookMetadata, 'title' | 'author' | 'cover_url' | 'categories'>) => Promise<boolean | undefined>;
    /** Saves record fields and reloads the library; throws on failure so the phone autosave can show 다시 시도. */
    saveRecord: (patch: BookPatch) => Promise<void>;
    shelves: Shelf[];
    /** Shelves this book is on. */
    shelfIds: string[];
    /** Creates a shelf (and puts the book on it); resolves to its id, or null when it failed. */
    createShelf: (name: string, bookId?: string) => Promise<string | null>;
    /** Phone: MobileTopBar is hidden on a book (/reading/:id and a custom page's ?book=), so the ← · title · ⋮ bar and the tabs stick to the top. */
    appBar?: boolean;
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
    // Phone (<768px): an app bar with a ⋮ menu, a meta row, autosaved record fields and bottom sheets; desktop keeps the page form.
    const phone = useMediaQuery(PHONE_QUERY);
    const navigate = useNavigate();
    const fromLibrary = Boolean((useLocation().state as { fromLibrary?: boolean } | null)?.fromLibrary);
    const [menuOpen, setMenuOpen] = useState(false), [sheet, setSheet] = useState<'info' | 'shelf' | null>(null);
    const menuRef = useRef<HTMLDivElement>(null), moreRef = useRef<HTMLButtonElement>(null), menuId = useId();
    const [draft, setDraft] = useState<BookPatch>(() => ({ reading_status: book.reading_status, rating: book.rating, started_at: book.started_at, finished_at: book.finished_at, review: book.review, tags: book.tags }));
    const record = useRef(draft);
    const [saveState, setSaveState] = useState<{ state: AutosaveStatus; error?: string }>({ state: 'idle' });
    // One autosave per open book; `sync` hands it the newest save callback after each render.
    const [{ autosave, sync }] = useState(() => {
        const latest = { saveRecord };
        return {
            autosave: createAutosave<BookPatch>({ save: patch => latest.saveRecord(patch), onStatus: (state, error) => setSaveState({ state, error }) }),
            sync: (next: typeof latest) => { Object.assign(latest, next); },
        };
    });
    useEffect(() => { sync({ saveRecord }); });
    /** Every record change is a full snapshot; `now` saves at once (chips, dates, stars), typing waits 800ms. */
    const change = (patch: BookPatch, now = false) => {
        record.current = { ...record.current, ...patch };
        setDraft(record.current);
        autosave.change(record.current);
        if (now) void autosave.flush();
    };
    // Leaving the book (another route) or the app going to the background saves what is waiting at once.
    useEffect(() => {
        const hide = () => { if (document.visibilityState === 'hidden') void autosave.flush(); };
        document.addEventListener('visibilitychange', hide);
        return () => {
            document.removeEventListener('visibilitychange', hide);
            void autosave.flush();
        };
    }, [autosave]);
    useBackLayer(menuOpen, () => setMenuOpen(false));
    useEffect(() => {
        if (!menuOpen) return;
        menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || event.isComposing) return;
            setMenuOpen(false);
            moreRef.current?.focus({ preventScroll: true });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [menuOpen]);
    // ← saves first; a failed save keeps the book open with 다시 시도. Opened from the library it steps back
    // (so the system Back lands in the same place), opened from elsewhere it replaces this entry with the library.
    const back = async () => {
        if (!await autosave.flush()) return;
        if (fromLibrary) navigate(-1);
        else navigate(basePath, { replace: true });
    };
    const share = async () => {
        setMenuOpen(false);
        const meta = book.book;
        const body = [meta.author, [meta.publisher, meta.published_date?.slice(0, 4)].filter(Boolean).join(' · '), record.current.review].filter(Boolean).join('\n');
        const result = await shareMemos([{ title: meta.title, body }]);
        if (result === 'copied') showStatusToast({ text: text.say('sharedCopied'), tone: 'saved' });
        if (result === 'failed') showStatusToast({ text: text.say('shareFailed'), tone: 'failed' });
    };
    const removeBook = async () => {
        setMenuOpen(false);
        await autosave.flush();
        remove();
    };
    // 새 책장 in the shelf sheet: the workspace creates it (shelf editor defaults) with this book already on it.
    const addNewShelf = (name: string) => createShelf(name, book.id).then(id => { if (id) showStatusToast({ text: text.say('addedToNamedShelf', { name }), tone: 'saved' }); return Boolean(id); });
    const toggleShelf = (id: string) => void act(() => shelfIds.includes(id) ? repo.removeBookFromShelf(book.id, id) : repo.addBookToShelf(book.id, id));
    const information = <div className="reading-information"><dl>{[[text.word('title'), book.book.title], [text.word('author'), book.book.author], [text.t('reading.publisher'), book.book.publisher], [text.t('reading.published'), book.book.published_date], ['ISBN 13', book.book.isbn13], ['ISBN 10', book.book.isbn10], [text.word('category'), bookCategories(book).map(c => categoryLabel(c, text.t)).join(', ') || text.t('reading.noCategory')], [text.t('reading.source'), book.book.external_source]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? text.t('reading.noInfo')}</dd></div>)}</dl><p className="reading-prose">{book.book.description?.replace(/<[^>]*>/g, '') || text.say('noItemDescription')}</p></div>;
    const sortedHighlights = pageSort ? [...highlights].sort((a, b) => (a.page_number ?? Infinity) - (b.page_number ?? Infinity)) : highlights;
    const entryEditor = entry ? <EntryModal key={typeof entry === 'string' ? 'new' : entry.id} phone={phone} text={text} kind={isHighlight ? 'highlight' : 'note'} entry={entry === 'new' ? null : entry} busy={busy} close={() => setEntry(null)} onDelete={entry === 'new' ? undefined : () => { setConfirm(entry); setEntry(null); }} save={async (input) => { if (isHighlight) {
        const h = input as HighlightInput;
        await entryAct(() => entry === 'new' ? repo.createHighlight(book.id, h) : repo.updateHighlight(entry.id, h));
    }
    else {
        await entryAct(() => entry === 'new' ? repo.createReadingNote(book.id, input) : repo.updateReadingNote(entry.id, input));
    } }}/> : null;
    const confirmModal = confirm ? <Modal title={text.say('deleteEntry', { name: tabName[tab] })} close={() => setConfirm(null)}><p>{text.say('deleteEntryBody')}</p><div className="reading-actions"><button disabled={busy} className="btn btn-primary" onClick={() => void entryAct(() => 'source_type' in confirm ? repo.deleteHighlight(confirm.id) : repo.deleteReadingNote(confirm.id))}>{text.t('delete')}</button><button className="btn btn-ghost" onClick={() => setConfirm(null)}>{text.t('cancel')}</button></div></Modal> : null;
    if (phone) {
        const meta = book.book;
        const year = meta.published_date?.slice(0, 4);
        const total = book.total_pages ?? 0;
        const onShelves = shelves.filter(s => shelfIds.includes(s.id));
        const shelfName = onShelves.length ? onShelves[0].name + (onShelves.length > 1 ? ' +' + text.number(onShelves.length - 1) : '') : text.say('noShelf');
        const saving = saveState.state === 'pending' || saveState.state === 'saving';
        const entries: (Highlight | ReadingNote)[] = isHighlight ? sortedHighlights : notes;
        const listTab = tab === 'highlight' || tab === 'memo';
        return <article className="reading-detail reading-pd" data-theme-slot="reading-detail" data-app-bar={appBar || undefined}>
            <div className="memo-pe-top reading-pd-top">
                <button type="button" className="memo-phone-icon" aria-label={text.say('backToLibrary')} onClick={() => void back()}><ArrowLeft size={22} strokeWidth={1.7} aria-hidden="true"/></button>
                <h2 className="reading-pd-title">{meta.title}</h2>
                <button ref={moreRef} type="button" className="memo-phone-icon" aria-label={text.say('more')} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen(open => !open)}><EllipsisVertical size={22} strokeWidth={1.7} aria-hidden="true"/></button>
                {menuOpen ? <>
                    <div className="memo-pe-menu-dim" aria-hidden="true" onClick={() => setMenuOpen(false)}/>
                    <div ref={menuRef} id={menuId} className="memo-pe-menu" role="menu" aria-label={text.say('detailActions')}>
                        {saveMetadata ? <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setSheet('info'); }}><Pencil size={18} strokeWidth={1.6} aria-hidden="true"/>{text.say('editItemInfo')}</button> : null}
                        <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setSheet('shelf'); }}><Library size={18} strokeWidth={1.6} aria-hidden="true"/>{text.say('moveShelf')}</button>
                        <button type="button" role="menuitem" onClick={() => void share()}><Share2 size={18} strokeWidth={1.6} aria-hidden="true"/>{text.say('share')}</button>
                        <button type="button" role="menuitem" className="memo-pe-danger" onClick={() => void removeBook()}><ThemeIcon name="delete" fallback={Trash2} size={18} strokeWidth={1.6} aria-hidden="true"/>{text.say('removeFromLibrary')}</button>
                    </div>
                </> : null}
            </div>
            <div className="memo-pe-meta reading-pd-meta">
                <button type="button" className="memo-pe-chip" aria-haspopup="dialog" aria-label={text.say('shelfChip', { name: shelfName })} onClick={() => setSheet('shelf')}>
                    <span className="memo-phone-dot" style={{ background: onShelves[0] ? shelfColor(onShelves[0].color) : 'var(--faint)' }} aria-hidden="true"/>
                    <span>{shelfName}</span>
                    <ChevronDown size={15} strokeWidth={1.7} aria-hidden="true"/>
                </button>
                <span className="memo-pe-date" title={text.date(book.created_at)}>{text.say('addedOn', { date: shortDate(book.created_at) })}</span>
                <span className="memo-pe-status" role="status" data-state={saveState.state}>
                    {saving ? text.t('saving') : saveState.state === 'saved' ? <><Check size={14} strokeWidth={2.4} aria-hidden="true"/>{text.t('saved')}</> : saveState.state === 'failed' ? text.say('saveFailed') : ''}
                </span>
                {saveState.state === 'failed' ? <button type="button" className="memo-pe-retry" title={saveState.error} onClick={() => void autosave.flush()}>{text.t('reading.retry')}</button> : null}
            </div>
            <header className="reading-pd-hero">
                <Cover book={meta}/>
                <div className="reading-pd-info">
                    <p className="reading-pd-author">{meta.author || text.say('unknownAuthor', { author: text.inline('author') })}</p>
                    {meta.publisher || year ? <p className="reading-muted">{[meta.publisher, year].filter(Boolean).join(' · ')}</p> : null}
                    {total > 0 ? <div className="reading-pd-progress"><span>{text.say('pageProgress', { current: text.number(book.current_page), total: text.number(total) })}</span><span className="reading-pd-bar" aria-hidden="true"><i style={{ width: readingProgress(book.current_page, total) + '%' }}/></span></div>
                        : book.current_page > 0 ? <p className="reading-muted" data-reading-last-page>{text.say('lastPage', { page: text.number(book.current_page) })}</p> : null}
                    <StarRating value={draft.rating ?? null} onChange={rating => change({ rating }, true)}/>
                </div>
            </header>
            <div role="tablist" aria-label={text.say('detailLabel')} className="reading-pd-tabs">{(['record', 'highlight', 'memo', 'info'] as const).map(t => <button type="button" role="tab" id={'reading-tab-' + t} aria-controls="reading-tab-panel" aria-selected={tab === t} key={t} onClick={() => { setTab(t); setEntry(null); }}>{tabName[t]}{t === 'highlight' || t === 'memo' ? <small>{text.number(t === 'highlight' ? highlights.length : notes.length)}</small> : null}</button>)}</div>
            {error ? <p role="alert" className="reading-pd-error">{error}</p> : null}
            <section role="tabpanel" id="reading-tab-panel" aria-labelledby={'reading-tab-' + tab} className="reading-pd-panel" data-list={listTab || undefined}>
                {tab === 'record' ? <PhoneRecord draft={draft} change={change} text={text}/> : tab === 'info' ? information : <>
                    <div className="reading-pd-list-head"><span>{text.say('entryCount', { count: text.number(entries.length) })}</span>{isHighlight ? <label className="reading-pd-sort">{text.t(pageSort ? 'reading.sortPage' : 'reading.sortRecent')}<ChevronDown size={15} strokeWidth={1.7} aria-hidden="true"/><select aria-label={text.t('reading.sortQuotes')} value={pageSort ? 'page' : 'time'} onChange={e => setPageSort(e.target.value === 'page')}><option value="time">{text.t('reading.sortRecent')}</option><option value="page">{text.t('reading.sortPage')}</option></select></label> : null}</div>
                    {entries.map(item => <button type="button" className="reading-pd-entry" data-theme-slot={isHighlight ? 'reading-highlight' : 'reading-note'} key={item.id} onClick={() => setEntry(item)}>
                        <span className={isHighlight ? 'reading-pd-quote' : 'reading-pd-plain'}>{item.content}</span>
                        {'note' in item && typeof item.note === 'string' && item.note ? <span className="reading-pd-note">{item.note}</span> : null}
                        <span className="reading-pd-entry-meta">{'page_number' in item && typeof item.page_number === 'number' && item.page_number ? <b>p.{item.page_number}</b> : null}<span>{shortDate(item.created_at)}{item.updated_at !== item.created_at ? ' · ' + text.say('edited', { date: shortDate(item.updated_at) }) : ''}</span>{item.tags.length ? <span>{item.tags.map(t => '#' + t).join(' ')}</span> : null}</span>
                    </button>)}
                    {!entries.length ? <p className="reading-empty">{text.say(isHighlight ? 'emptyHighlights' : 'emptyNotes')}</p> : null}
                </>}
            </section>
            {entryEditor}
            {sheet === 'info' && saveMetadata ? <BookMetadataEditor key={book.id + JSON.stringify(meta)} book={meta} text={text} busy={busy} save={saveMetadata} close={() => setSheet(null)}/> : null}
            {sheet === 'shelf' ? <Sheet title={text.cap(text.shelf)} onClose={() => setSheet(null)}>
                <div className="memo-move-list" role="group" aria-label={text.cap(text.shelf)}>
                    {shelves.map(s => { const on = shelfIds.includes(s.id); return <button key={s.id} type="button" role="checkbox" aria-checked={on} disabled={busy} className="memo-move-option" onClick={() => toggleShelf(s.id)}>
                        <span className="reading-pd-shelf-icon" style={{ color: shelfColor(s.color) }} aria-hidden="true"><ReadingIcon value={s.icon}/></span>
                        <span className="memo-pe-option-name">{s.name}</span>
                        {on ? <Check size={18} strokeWidth={2.2} aria-hidden="true" className="memo-pe-tick"/> : null}
                    </button>; })}
                    <NewShelfRow text={text} busy={busy} create={addNewShelf}/>
                </div>
            </Sheet> : null}
            {confirmModal}
            <AddFab hidden={!listTab || Boolean(entry) || menuOpen || Boolean(sheet) || Boolean(confirm)} onManual={() => setEntry('new')} manualLabel={text.say('addEntry', { name: tabName[tab] })}/>
        </article>;
    }
    return <article className="reading-detail" data-theme-slot="reading-detail"><Link className="reading-back inline-flex items-center gap-1.5" to={basePath}><ArrowLeft size={14} strokeWidth={1.5} className="block shrink-0" aria-hidden="true" /> {text.say('myLibrary')}</Link><header className="reading-detail-heading"><Cover book={book.book}/><div><h2>{book.book.title}</h2><p>{book.book.author}</p><p className="reading-muted">{book.book.publisher}</p><p>{text.status(book.reading_status)}</p>{book.current_page > 0 ? <p className="reading-muted" data-reading-last-page>{text.say('lastPage', { page: text.number(book.current_page) })}</p> : null}<StarRating value={book.rating}/></div></header>{saveMetadata ? <BookMetadataEditor key={book.id + JSON.stringify(book.book)} book={book.book} text={text} busy={busy} save={saveMetadata}/> : null}<div role="tablist" aria-label={text.say('detailLabel')} className="reading-tabs">{(['record', 'highlight', 'memo', 'info'] as const).map(t => <button role="tab" id={'reading-tab-' + t} aria-controls="reading-tab-panel" aria-selected={tab === t} key={t} onClick={() => { setTab(t); setEntry(null); }}>{tabName[t]}</button>)}</div>{error ? <p role="alert">{error}</p> : null}<section role="tabpanel" id="reading-tab-panel" aria-labelledby={'reading-tab-' + tab}>
 {tab === 'record' ? <RecordForm key={book.id} book={book} text={text} busy={busy} save={patch => act(() => repo.updateBook(book.id, patch))}/> : tab === 'info' ? information : <><div className="reading-list-heading"><h3>{isHighlight ? text.say('memorable') : (labels?.memo?.trim() ? text.memo : text.t('reading.notes'))}</h3>{isHighlight ? <select aria-label={text.t('reading.sortQuotes')} className="field" value={pageSort ? 'page' : 'time'} onChange={e => setPageSort(e.target.value === 'page')}><option value="time">{text.t('reading.sortRecent')}</option><option value="page">{text.t('reading.sortPage')}</option></select> : null}<button className="btn btn-primary" disabled={busy} onClick={() => setEntry('new')}>+ {text.say('addEntry', { name: tabName[tab] })}</button></div>{(isHighlight ? sortedHighlights : notes).map(item => <article className={isHighlight ? 'reading-highlight' : 'reading-note'} data-theme-slot={isHighlight ? 'reading-highlight' : 'reading-note'} key={item.id}>{'page_number' in item && typeof item.page_number === 'number' && item.page_number ? <p className="reading-muted">p.{item.page_number}</p> : null}<p className="reading-prose">{item.content}</p>{'note' in item && typeof item.note === 'string' && item.note ? <p className="reading-prose reading-muted">{item.note}</p> : null}<p className="reading-muted">{item.tags.map(t => '#' + t).join(' ')} · {text.date(item.created_at)}{item.updated_at !== item.created_at ? ' · ' + text.say('edited', { date: text.date(item.updated_at) }) : ''}</p><div className="reading-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setEntry(item)}>{text.say('modify')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(item)}>{text.t('delete')}</button></div></article>)}{!(isHighlight ? highlights : notes).length ? <p className="reading-empty">{text.say(isHighlight ? 'emptyHighlights' : 'emptyNotes')}</p> : null}</>}
 </section><button className="btn btn-ghost reading-remove" disabled={busy} onClick={remove}>{text.say('removeItem')}</button>
 {entryEditor}
 {confirmModal}
 </article>;
}
function BookMetadataEditor({ book, text: words, busy, save, close }: {
    book: BookMetadata;
    text: ReadingText;
    busy: boolean;
    save: (metadata: Pick<BookMetadata, 'title' | 'author' | 'cover_url' | 'categories'>) => Promise<boolean | undefined>;
    /** Phone: the editor is a bottom sheet (⋮ → 책 정보 수정) that closes after a successful save. */
    close?: () => void;
}) {
    const error = useContext(ReadingErrorContext);
    const [text, setText] = useState((book.categories ?? []).join(', '));
    const [title, setTitle] = useState(book.title);
    const [author, setAuthor] = useState(book.author);
    const [image, setImage] = useState(book.cover_url ?? '');
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (await save({ title, author, cover_url: image || null, categories: [...new Set(text.split(',').map(value => value.trim()).filter(Boolean))] })) close?.();
    };
    if (close) return <Sheet title={words.say('editItemInfo')} onClose={close}>
        <form className="reading-form reading-pd-sheet-form" onSubmit={event => void submit(event)}>
            {error ? <p role="alert" className="reading-error">{error}</p> : null}
            <div className="reading-pd-cover-edit"><Cover key={image} book={{ ...book, title: title || book.title, cover_url: image || null }}/><span className="reading-muted">{words.say('coverHint')}</span></div>
            <label>{words.word('title')}<input required className="field" value={title} onChange={event => setTitle(event.target.value)} /></label>
            <label>{words.word('author')}<input className="field" value={author} onChange={event => setAuthor(event.target.value)} /></label>
            <label>{words.word('image')}<input className="field" inputMode="url" value={image} onChange={event => setImage(event.target.value)} /></label>
            <label>{words.word('category')}<input aria-label={words.say('editName', { name: words.word('category') })} className="field" value={text} onChange={event => setText(event.target.value)} placeholder={words.say('categoryPlaceholder')} /></label>
            <div className="reading-pd-sheet-foot">
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>{words.t('cancel')}</button>
                <button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? words.t('saving') : words.t('save')}</button>
            </div>
        </form>
    </Sheet>;
    return <form className="reading-form reading-record my-5" onSubmit={event => void submit(event)}>
        <label>{words.word('title')}<input required className="field" value={title} onChange={event => setTitle(event.target.value)} /></label>
        <label>{words.word('author')}<input className="field" value={author} onChange={event => setAuthor(event.target.value)} /></label>
        <label>{words.word('image')}<input className="field" value={image} onChange={event => setImage(event.target.value)} /></label>
        <label className="min-w-0 flex-1 text-xs text-neutral-500">{words.word('category')}
            <input aria-label={words.say('editName', { name: words.word('category') })} className="field mt-1 w-full" value={text} onChange={event => setText(event.target.value)} placeholder={words.say('categoryPlaceholder')} />
        </label>
        <button className="btn btn-line" disabled={busy}>{words.say('saveItemInfo')}</button>
    </form>;
}
/** Last row of the phone shelf sheet: ＋ 새 책장 opens an inline name field; 만들기 creates the shelf with this book on it. */
/** ＋ 새 책장 opens an inline name field; 만들기 (or Enter) creates the shelf. A row in the detail's shelf sheet,
 *  a dashed chip among the add sheet's shelf chips. Not a <form>: it can sit inside the 직접 입력 form. */
function NewShelfRow({ text, busy, create, chip = false }: {
    text: ReadingText;
    busy: boolean;
    create: (name: string) => Promise<boolean>;
    chip?: boolean;
}) {
    const [name, setName] = useState<string | null>(null);
    if (name === null) return chip
        ? <button type="button" className="reading-pd-tag reading-pd-tag-add reading-pd-new-shelf" disabled={busy} onClick={() => setName('')}><Plus size={14} strokeWidth={2} aria-hidden="true"/>{text.say('newShelf')}</button>
        : <button type="button" className="memo-move-option reading-pd-new-shelf" disabled={busy} onClick={() => setName('')}><Plus size={20} strokeWidth={1.6} aria-hidden="true"/><span className="memo-pe-option-name">{text.say('newShelf')}</span></button>;
    const submit = () => { const value = name.trim(); if (value && !busy) void create(value).then(ok => { if (ok) setName(null); }); };
    return <div className="reading-pd-new-shelf-form" data-chip={chip || undefined}>
        <input autoFocus maxLength={100} className="field" aria-label={text.say('shelfName')} placeholder={text.say('shelfName')} enterKeyHint="done" value={name} onChange={event => setName(event.target.value)}
            onKeyDown={event => { if (event.key !== 'Enter' || event.nativeEvent.isComposing) return; event.preventDefault(); submit(); }}/>
        <button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={submit}>{text.say('create')}</button>
    </div>;
}
/** Phone 기록 tab: status chips, the dates as chips over the native date inputs, a borderless review and tag
 *  chips. Every change goes to the detail's autosave; taps save at once, the review after typing stops. */
function PhoneRecord({ draft, change, text }: {
    draft: BookPatch;
    change: (patch: BookPatch, now?: boolean) => void;
    text: ReadingText;
}) {
    const [tagInput, setTagInput] = useState(''), [addingTag, setAddingTag] = useState(false);
    const current = draft.tags ?? [];
    const addTags = () => {
        const added = tags(tagInput);
        setTagInput('');
        setAddingTag(false);
        if (added.some(tag => !current.includes(tag))) change({ tags: [...new Set([...current, ...added])] }, true);
    };
    const date = (key: 'started_at' | 'finished_at', label: string) => {
        const value = draft[key];
        return <label className="reading-pd-date" data-empty={!value || undefined}>
            <span>{value ? value.replaceAll('-', '.') : label}</span>
            <input type="date" aria-label={label} value={value ?? ''} onClick={event => { try { event.currentTarget.showPicker(); } catch { /* The tap still opens the picker where showPicker is missing. */ } }} onChange={event => change({ [key]: event.target.value || null }, true)}/>
        </label>;
    };
    return <div className="reading-pd-record">
        <div className="reading-pd-row"><span className="reading-pd-label">{text.word('status')}</span><div className="reading-pd-chips" role="group" aria-label={text.word('status')}>{text.statuses().map(([id, label]) => <button key={id} type="button" className="reading-pd-chip" aria-pressed={draft.reading_status === id} onClick={() => change({ reading_status: id, ...(id === 'reading' && !draft.started_at ? { started_at: todayISO() } : {}) }, true)}>{label}</button>)}</div></div>
        <div className="reading-pd-row"><span className="reading-pd-label">{text.say('period')}</span><div className="reading-pd-dates">{date('started_at', text.word('startedAt'))}<span aria-hidden="true">→</span>{date('finished_at', text.word('finishedAt'))}</div></div>
        <textarea className="reading-pd-review" aria-label={text.word('note')} placeholder={text.say('reviewPlaceholder')} value={draft.review ?? ''} onChange={event => change({ review: event.target.value })}/>
        <div className="reading-pd-row"><span className="reading-pd-label">{text.word('tags')}</span><div className="reading-pd-chips">
            {current.map(tag => <button key={tag} type="button" className="reading-pd-tag" aria-label={text.say('removeTag', { tag })} onClick={() => change({ tags: current.filter(item => item !== tag) }, true)}>#{tag}<X size={12} strokeWidth={2} aria-hidden="true"/></button>)}
            {addingTag ? <input autoFocus className="reading-pd-tag-input" aria-label={text.say('addTag')} enterKeyHint="done" value={tagInput} onChange={event => setTagInput(event.target.value)} onBlur={addTags}
                onKeyDown={event => { if (event.nativeEvent.isComposing || (event.key !== 'Enter' && event.key !== ',')) return; event.preventDefault(); addTags(); }}/> : <button type="button" className="reading-pd-tag reading-pd-tag-add" onClick={() => setAddingTag(true)}><Plus size={14} strokeWidth={2} aria-hidden="true"/>{text.say('addTag')}</button>}
        </div></div>
    </div>;
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
function EntryModal({ text, kind, entry, busy, close, save, phone = false, onDelete }: {
    text: ReadingText;
    kind: 'highlight' | 'note';
    entry: Highlight | ReadingNote | null;
    busy: boolean;
    close: () => void;
    /** Phone: a bottom sheet with 삭제 (saved entries) beside 저장 instead of the centered modal. */
    phone?: boolean;
    onDelete?: () => void;
    save: (input: HighlightInput | {
        content: string;
        tags: string[];
    }) => Promise<void>;
}) {
    const [content, setContent] = useState(entry?.content ?? ''), [page, setPage] = useState(entry && 'page_number' in entry ? String(entry.page_number ?? '') : ''), [note, setNote] = useState(entry && 'note' in entry ? entry.note : ''), [tagText, setTagText] = useState(entry?.tags.join(', ') ?? '');
    const error = useContext(ReadingErrorContext);
    const submit = (e: FormEvent) => { e.preventDefault(); const input = { content: content.trim(), tags: tags(tagText) }; void save(kind === 'note' ? input : { ...input, page_number: page ? Number(page) : null, note, source_type: entry && 'source_type' in entry ? entry.source_type : 'manual', source_url: entry && 'source_url' in entry ? entry.source_url : null, source_title: entry && 'source_title' in entry ? entry.source_title : null }); };
    const fields = <><label>{kind === 'highlight' ? text.say('memorable') : text.cap(text.say('memoContent'))}<textarea required rows={5} className="field" value={content} onChange={e => setContent(e.target.value)}/></label>{kind === 'highlight' ? <><label>{text.say('pageOptional')}<input type="number" min={1} step={1} className="field" value={page} onChange={e => setPage(e.target.value)}/></label><label>{text.say('highlightMemo')}<textarea className="field" value={note} onChange={e => setNote(e.target.value)}/></label></> : null}<label>{text.say('tags')}<input className="field" placeholder={text.say('noteTagsPlaceholder')} value={tagText} onChange={e => setTagText(e.target.value)}/></label></>;
    if (phone) return <Sheet title={text.say(entry ? 'editEntry' : 'addEntry', { name: kind === 'highlight' ? text.highlight : text.memo })} onClose={close}><form className="reading-form reading-pd-sheet-form" onSubmit={submit}>{error ? <p role="alert" className="reading-error">{error}</p> : null}{fields}<div className="reading-pd-sheet-foot">{onDelete ? <button type="button" className="btn btn-ghost reading-pd-delete" disabled={busy} onClick={onDelete}>{text.t('delete')}</button> : null}<button className="btn btn-primary" disabled={busy || !content.trim()}>{busy ? text.t('saving') : text.t('save')}</button></div></form></Sheet>;
    return <Modal title={text.say(entry ? 'editEntry' : 'addEntry', { name: kind === 'highlight' ? text.highlight : text.memo })} close={close} busy={busy}><form className="reading-form" onSubmit={submit}>{fields}<div className="reading-actions"><button className="btn btn-primary" disabled={busy || !content.trim()}>{busy ? text.t('saving') : text.t('save')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>{text.t('cancel')}</button></div></form></Modal>;
}
