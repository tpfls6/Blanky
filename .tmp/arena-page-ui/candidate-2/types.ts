/**
 * Candidate 2 chrome contract.
 *
 * CSS files own token values. This file names the paints, slots, and markup
 * so an implementer cannot invent a second set of colors or a second height writer.
 *
 * Derived from the three call sites in sketch.md. Usage wins if they disagree.
 */

// ---------------------------------------------------------------------------
// Tokens. Names only. Values live in page CSS and themeVariables().
// ---------------------------------------------------------------------------

/** Wallpaper and pattern already paint this slot. Page chrome must not cover it by default. */
export const APP_WALLPAPER_SLOT = 'app' as const

export const READING_REGION_TOKENS = {
  page: '--blanky-reading-page-background',
  sidebar: '--blanky-reading-sidebar-background',
  shelf: '--blanky-reading-shelf-background',
  grid: '--blanky-reading-book-grid-background',
  card: '--blanky-reading-book-card-background',
  cover: '--blanky-reading-book-cover-background',
  detail: '--blanky-reading-detail-background',
  highlight: '--blanky-reading-highlight-background',
  note: '--blanky-reading-note-background',
} as const

export const SHARED_TOKENS = {
  bg: '--bg',
  surface: '--surface',
  hover: '--hover',
  line: '--line',
  accentLight: '--accent-light',
  memoHeight: '--memo-height',
} as const

/**
 * Set by themeVariables() from config.sidebar.background.
 * Always a color in a themed app. Must not be a reading-sidebar default.
 */
export const APP_SIDEBAR_BACKGROUND_TOKEN = '--blanky-sidebar-background' as const

export const READING_THEME_SLOTS = [
  'reading-page',
  'reading-sidebar',
  'reading-shelf',
  'reading-book-grid',
  'reading-book-card',
  'reading-book-cover',
  'reading-detail',
  'reading-highlight',
  'reading-note',
] as const

export const DIARY_THEME_SLOTS = ['diary-page', 'diary-list', 'diary-entry', 'input'] as const

/** No memo-* slot. Browse pane recoats through --surface, same as .memo-writing-area. */
export const MEMO_THEME_SLOT = null

// ---------------------------------------------------------------------------
// Paint policy. Illegal chrome (page-wide fill as the default) is unrepresentable.
// ---------------------------------------------------------------------------

export type WallpaperPaint = {
  kind: 'wallpaper'
  /**
   * Optional region token. Fallback must be the string transparent, never
   * --bg, --surface, or --blanky-sidebar-background.
   */
  overrideToken?: (typeof READING_REGION_TOKENS)[keyof typeof READING_REGION_TOKENS]
  fallback: 'transparent'
}

export type ItemSelectedPaint = {
  kind: 'item-selected'
  token: typeof SHARED_TOKENS.accentLight
}

export type SheetPaint = {
  kind: 'sheet'
  background: typeof SHARED_TOKENS.surface
  border: typeof SHARED_TOKENS.line
  /** Copy from .memo-writing-area in memo.css. Do not restate the pixel values here. */
  radiusSource: '.memo-writing-area'
  paddingSource: '.memo-writing-area'
}

export type ContentCardPaint = {
  kind: 'content-card'
  backgroundToken: typeof READING_REGION_TOKENS.highlight | typeof READING_REGION_TOKENS.note
  fallback: typeof SHARED_TOKENS.surface
}

export type ChromePaint = WallpaperPaint | ItemSelectedPaint | SheetPaint | ContentCardPaint

export type ReadingRegion =
  | 'page'
  | 'sidebar'
  | 'nav'
  | 'nav-selected'
  | 'shelf-row'
  | 'grid'
  | 'card'
  | 'cover'
  | 'detail'
  | 'highlight'
  | 'note'
  | 'split'

export const READING_PAINT: Record<ReadingRegion, ChromePaint | { kind: 'split-line' }> = {
  page: { kind: 'wallpaper', overrideToken: READING_REGION_TOKENS.page, fallback: 'transparent' },
  sidebar: { kind: 'wallpaper', overrideToken: READING_REGION_TOKENS.sidebar, fallback: 'transparent' },
  nav: { kind: 'wallpaper', fallback: 'transparent' },
  'nav-selected': { kind: 'item-selected', token: SHARED_TOKENS.accentLight },
  'shelf-row': { kind: 'wallpaper', overrideToken: READING_REGION_TOKENS.shelf, fallback: 'transparent' },
  grid: { kind: 'wallpaper', overrideToken: READING_REGION_TOKENS.grid, fallback: 'transparent' },
  card: { kind: 'wallpaper', overrideToken: READING_REGION_TOKENS.card, fallback: 'transparent' },
  cover: { kind: 'item-selected', token: SHARED_TOKENS.accentLight },
  detail: { kind: 'wallpaper', overrideToken: READING_REGION_TOKENS.detail, fallback: 'transparent' },
  highlight: { kind: 'content-card', backgroundToken: READING_REGION_TOKENS.highlight, fallback: SHARED_TOKENS.surface },
  note: { kind: 'content-card', backgroundToken: READING_REGION_TOKENS.note, fallback: SHARED_TOKENS.surface },
  split: { kind: 'split-line' },
}

export type MemoRegion = 'heading' | 'browse' | 'editor-writing' | 'editor-toolbar'

export const MEMO_PAINT: Record<MemoRegion, ChromePaint | { kind: 'none' }> = {
  heading: { kind: 'none' },
  browse: {
    kind: 'sheet',
    background: SHARED_TOKENS.surface,
    border: SHARED_TOKENS.line,
    radiusSource: '.memo-writing-area',
    paddingSource: '.memo-writing-area',
  },
  'editor-writing': {
    kind: 'sheet',
    background: SHARED_TOKENS.surface,
    border: SHARED_TOKENS.line,
    radiusSource: '.memo-writing-area',
    paddingSource: '.memo-writing-area',
  },
  'editor-toolbar': { kind: 'none' },
}

export type DiarySearchPaint = {
  shell: typeof SHARED_TOKENS.hover
  input: 'transparent'
  focusWithin: '.diary-search:focus-within'
}

export const DIARY_SEARCH_PAINT: DiarySearchPaint = {
  shell: SHARED_TOKENS.hover,
  input: 'transparent',
  focusWithin: '.diary-search:focus-within',
}

// ---------------------------------------------------------------------------
// Markup. Class names the three call sites already use or must add.
// ---------------------------------------------------------------------------

export const READING_CLASSES = {
  page: 'reading-page',
  layout: 'reading-layout',
  sidebar: 'reading-sidebar',
  nav: 'reading-nav',
  navSelected: 'selected',
  content: 'reading-content',
  toolbar: 'reading-toolbar',
  grid: 'reading-book-grid',
  detail: 'reading-detail',
} as const

export const MEMO_CLASSES = {
  layout: 'memo-layout',
  browse: 'memo-browse',
  folders: 'memo-folders',
  folder: 'memo-folder',
  listLabel: 'memo-list-label',
  writingArea: 'memo-writing-area',
  editorColumn: 'memo-editor-column',
} as const

export const DIARY_CLASSES = {
  page: 'diary-page',
  search: 'diary-search',
  workspace: 'diary-workspace',
} as const

/**
 * First grid child of .memo-layout.
 * Must be a flex column so heading stays put and .memo-browse scrolls.
 * Tailwind `block` overrides CSS display. Use flex, not block.
 */
export type MemoBrowseColumnClass =
  | 'flex min-h-0 flex-col'
  | 'hidden min-h-0 md:flex md:flex-col'

/** Invariant. Search, folders, list label, and ul are descendants of .memo-browse. Heading is not. */
export type MemoBrowseContents = {
  search: 'inside'
  folders: 'inside'
  listLabel: 'inside'
  list: 'inside'
  heading: 'outside'
  composeButton: 'outside'
  editor: 'outside'
}

export const MEMO_BROWSE_CONTENTS: MemoBrowseContents = {
  search: 'inside',
  folders: 'inside',
  listLabel: 'inside',
  list: 'inside',
  heading: 'outside',
  composeButton: 'outside',
  editor: 'outside',
}

// ---------------------------------------------------------------------------
// Height pairing. One writer. CSS is the only reader.
// ---------------------------------------------------------------------------

/**
 * Written by MemoEditor useLayoutEffect onto .memo-layout.
 * Read by .memo-layout > :first-child as max-height.
 * Do not add another setter.
 */
export type MemoHeightBinding = {
  writer: 'MemoEditor.useLayoutEffect'
  property: typeof SHARED_TOKENS.memoHeight
  hostSelector: '.memo-layout'
  columnSelector: '.memo-layout > :first-child'
  scrollSelector: '.memo-browse'
}

export const MEMO_HEIGHT_BINDING: MemoHeightBinding = {
  writer: 'MemoEditor.useLayoutEffect',
  property: SHARED_TOKENS.memoHeight,
  hostSelector: '.memo-layout',
  columnSelector: '.memo-layout > :first-child',
  scrollSelector: '.memo-browse',
}

// ---------------------------------------------------------------------------
// Diary specificity. Copy the tags pattern, not a new global exception.
// ---------------------------------------------------------------------------

/**
 * Global rule in src/styles/index.css is 0,2,0 and sets background-color.
 * Local `.diary-search input` is 0,1,1 and loses.
 * Tags already win with .diary-page .diary-tags-field input[data-theme-slot='input'].
 */
export const DIARY_SEARCH_INPUT_SELECTOR =
  ".diary-page .diary-search input[data-theme-slot='input'], .diary-page .diary-search input" as const

export const DIARY_SEARCH_INPUT_RESET = {
  background: 'transparent',
  backgroundColor: 'transparent',
  border: '0',
  outline: 'none',
  boxShadow: 'none',
} as const

export const FROZEN = [
  'MemoEditor',
  'diary search onChange',
  'diary search placeholder',
  'diary search icon',
  'reading nav onClick',
  'reading toolbar filters',
  'memo folder aria-current',
  'memo CRUD',
  'THEME_SLOTS',
  'runtimeCss FILL',
  'src/styles/index.css input rule',
] as const

export const UNCHANGED_BREAKPOINTS = {
  reading: '700px',
  memo: 'md (767px hide/show)',
  diary: '1100px / 900px / 480px',
} as const

// ---------------------------------------------------------------------------
// Apply steps. not implemented. Implementers edit CSS and the one wrap.
// ---------------------------------------------------------------------------

/** Set reading page, sidebar, and detail defaults to transparent. Keep gap and --line split. */
export function applyReadingWallpaperChrome(): void {
  throw new Error('not implemented')
  // TODO reading.css
  // .reading-page { background: var(--blanky-reading-page-background, transparent); }
  // .reading-sidebar { background: var(--blanky-reading-sidebar-background, transparent); }
  // .reading-detail { background: var(--blanky-reading-detail-background, transparent); }
  // Do not keep --blanky-sidebar-background or --surface in the sidebar chain.
  // Keep border-right: 1px solid var(--line) and gap: 36px.
  // Keep @media (max-width: 700px) bottom border.
}

/** Add data-theme-slot="reading-sidebar" on ReadingCatalog's aside. */
export function applyReadingCatalogSidebarSlot(): void {
  throw new Error('not implemented')
}

/**
 * Wrap search, folders, and list in .memo-browse.
 * Switch the first column to flex.
 * Retarget overflow to the pane.
 */
export function applyMemoBrowsePane(): void {
  throw new Error('not implemented')
  // TODO MemoPage.tsx wrap per MEMO_BROWSE_CONTENTS
  // TODO drop mt-6 on the search input (pane padding replaces it)
  // TODO memo.css
  // .memo-layout > :first-child {
  //   max-height: var(--memo-height);
  //   display: flex;
  //   flex-direction: column;
  //   min-height: 0;
  //   overflow: hidden;
  // }
  // .memo-browse {
  //   flex: 1;
  //   min-height: 0;
  //   overflow-y: auto;
  //   padding: 20px;
  //   border: 1px solid var(--line);
  //   border-radius: 14px;
  //   background: var(--surface);
  // }
  // Copy those four visual values from .memo-writing-area. Do not import that class.
}

/** Beat the global input background-color the way diary tags already do. */
export function applyDiarySearchInputOverride(): void {
  throw new Error('not implemented')
  // TODO diary.css
  // ${DIARY_SEARCH_INPUT_SELECTOR} { background: transparent; background-color: transparent; border: 0; outline: none; box-shadow: none; }
  // Keep .diary-search { background: var(--hover) }
  // Keep .diary-search:focus-within
  // Do not edit src/styles/index.css
}

/** Custom themes recolor through existing slots and --surface. No new slot. */
export function assertNoNewThemeSlot(): void {
  throw new Error('not implemented')
  // THEME_SLOTS stays as in packages/types/src/themePackage.ts
  // Package CSS. [data-theme-slot="reading-page"] { background: #… }
  // Package CSS. [data-theme-slot="reading-sidebar"] { background: #… }
  // Theme config colors.surface recoats .memo-browse and .memo-writing-area together
  // Package CSS. [data-theme-slot="input"] still reaches the diary search field
}
