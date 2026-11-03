# Grounding: reading / memo / diary chrome

Read-only facts from source. Designs must honor these.

## How it works

Wallpaper and pattern sit on `[data-theme-slot="app"]` via `src/theme/package/runtimeCss.ts`. `.blanky-themed .theme-app-layout` is already `background-color: transparent` so that wallpaper shows. Page chrome that paints `--bg` or `--surface` hides it.

Reading, memo, and diary each mount through `PageCanvas`. `page-body` is `bare` (no `.panel`). The white reading card in screenshots is `.reading-page` itself.

## Reading

Files: `src/pages/Reading/ReadingPage.tsx`, `src/pages/Reading/ReadingCatalog.tsx`, `src/pages/Reading/reading.css`.

- `.reading-page` (`data-theme-slot="reading-page"`) sets `background: var(--blanky-reading-page-background, var(--bg))`. `--bg` is the theme surface color, so the whole page is an opaque rectangle over the wallpaper.
- `.reading-sidebar` (`data-theme-slot="reading-sidebar"`) paints `var(--blanky-reading-sidebar-background, var(--blanky-sidebar-background, var(--surface)))` on the whole left column.
- `.reading-nav.selected` already uses `--accent-light`. Unselected nav has no fill until hover (`--hover`).
- `.reading-book-grid` and `.reading-book-card` already default to transparent via `--blanky-reading-book-*-background`.
- Layout is a 210px / 1fr grid with a right border on the sidebar. Mobile stacks and uses a bottom border.
- Tokens already exist for page, sidebar, shelf, grid, card, cover, detail, highlight, note. Custom CSS may target those slots because they are in `THEME_SLOTS`.

Target from the attached screenshot and spec: drop the page-wide fill so the theme wallpaper shows. Titles stay as text. Nav and shelf items keep per-item selected fill only. Keep search, filters, covers, and placement. Divide left/right with gap and a thin `--line`, not extra boxes.

## Memo

Files: `src/pages/Memo/MemoPage.tsx`, `src/pages/Memo/memo.css`.

- Left column is the first grid child. It currently has no panel. Search, folders, and the memo list sit on the wallpaper.
- Right editor is unchanged: `.memo-toolbar` and `.memo-writing-area` use `--surface`, `1px solid var(--line)`, radius 12px / 14px, padding 20px on the writing area.
- `.memo-layout > :first-child { max-height: var(--memo-height); overflow-y: auto }`. `--memo-height` is set from the editor form's `useLayoutEffect` so both columns match height.
- Title + "메모 작성" live in that first column today. Spec wants the white container to hold only search, categories, and the memo list. Heading stays outside.
- There is no memo slot in `THEME_SLOTS`. Custom CSS cannot legally target a new slot until it is added and sanitizer-listed.
- `hideFolders` / custom-page source reuses the same layout without `PageCanvas`.

Target: one left pane matching the editor's surface, radius, and padding. Internal regions split by gap or `--line`. List scrolls inside the pane. Do not change the right editor, search, select, or CRUD.

## Diary

Files: `src/pages/Diary/DiaryPage.tsx`, `src/pages/Diary/diary.css`.

- `.diary-page` has no fill. `.diary-workspace` (`data-theme-slot="diary-page"`) is the white split pane (`--surface`, border, radius). Heading sits outside. This is the reading-page target analog.
- `.diary-search` uses `--hover`. `.diary-search input` already sets `background: transparent`, but the input has `data-theme-slot="input"`.
- Global rule in `src/styles/index.css`: `.blanky-themed :is(.field, [data-theme-slot="input"]) { background-color: color-mix(in srgb, var(--blanky-surface) 92%, transparent) }`. Specificity 0,2,0 beats `.diary-search input` (0,1,1), so the inner field is near-white.
- Tags already override this: `.diary-page .diary-tags-field input[data-theme-slot='input'] { background: transparent; border: 0; outline: none; box-shadow: none }`.
- Focus on the search shell is `.diary-search:focus-within { box-shadow: 0 0 0 2px var(--accent-border) }`.

Target: make the inner input inherit the shell's `--hover`. Keep icon, placeholder, and search behavior. No extra border/outline stack. Keep the existing focus treatment.

## Theme system

- `themeVariables()` maps config colors onto `--bg`, `--surface`, `--hover`, `--accent-light`, `--blanky-*`.
- Do not hardcode white or gray. Use those tokens.
- `--blanky-reading-*-background` already lets a custom theme recolor reading regions if the CSS keeps the var() fallback chain.
- `FILL` in `runtimeCss.ts` maps package images onto slots. `diaryBackground` fills `diary-page`. There is no memo image key. Do not invent image pipeline work unless the design requires a new legal slot.

## Constraints

- Do not change data, events, filters, CRUD, or sidebar/app chrome.
- Do not add cards, shadows, or extra wrappers beyond the memo left pane the spec asks for.
- Keep existing mobile breakpoints.
- Current git branch `feat/theme-kinds` is dirty with unrelated work. Implementation must land on a fresh worktree off main, not this branch.
- `control-ui` from cursor-team-kit is not installed. Browser MCP is the live surface.

## Explorer confirmations

- `.reading-page` is the opaque slab. PageCanvas does not wrap it in `.panel`. Book cards are already transparent. Covers are the only book tiles.
- `themeVariables` never emits `--blanky-reading-*`. Those names only work if custom CSS or a future config group sets them. Package custom CSS cannot use `var()` (sanitizer rejects it). Custom themes recolor reading by targeting `[data-theme-slot="reading-page"]` with a hex, not by setting the fallback token.
- Activity search is the working chromed-input pattern. Outer well, inner input with `background: transparent` and **no** `data-theme-slot="input"`. Diary tags already override the slot. Diary search should follow Activity (drop the slot) or match the tags override. Dropping the slot is the stronger invariant: nested chromed controls are not themed input surfaces.
- `--hover` is `calendar.hoverColor`, not a dedicated well token. Keep using it for diary search to match current chrome.
- Memo editor radii are hardcoded 12px / 14px, not `var(--radius)`. Match those numbers so the new left pane lines up with the writing area.
- `--memo-height` is set only while `MemoEditor` is mounted. After wrapping, overflow must live on the pane that holds search + folders + list, not on a first-child that also contains the heading.
- `ReadingCatalog` shares `reading.css`. Transparent `.reading-page` must still look right there.

## Usage the caller already has

Reading nav selected class, memo folder `aria-current`, diary search `onChange`. Those stay. Chrome is CSS plus the smallest markup wrap on the memo left column.
