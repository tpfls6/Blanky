# Candidate 2. Wallpaper-first defaults, local CSS, one memo wrap

## Problem

Reading, memo, and diary sit on a transparent `.theme-app-layout` so the wallpaper on `[data-theme-slot="app"]` can show. Page chrome still paints over it.

`.reading-page` defaults to `--bg`. `.reading-sidebar` defaults through `--blanky-sidebar-background`, which `themeVariables()` always sets from the app sidebar color. Changing only the last `--surface` fallback leaves the left column opaque. Status nav already paints `--accent-light` on `.reading-nav.selected`. The library view should look like text and selected rows on wallpaper, split by the existing gap and a 1px `--line`.

Memo's left column has no sheet. Search, folders, and the list sit on wallpaper. The right editor writing area already uses `--surface`, `1px solid var(--line)`, 14px radius, and 20px padding. The spec wants that sheet around search plus categories plus the list, with the heading and 메모 작성 outside. `--memo-height` is written by `MemoEditor`'s `useLayoutEffect` onto `.memo-layout` and read by `.memo-layout > :first-child`. Wrap markup must keep that pairing and the `hidden md:` column swap. `hideFolders` custom pages reuse the same tree.

Diary search already sets `.diary-search input { background: transparent }`. `.blanky-themed :is(.field, [data-theme-slot="input"])` sets `background-color` at specificity 0,2,0 and wins. Tags already beat it with `.diary-page .diary-tags-field input[data-theme-slot='input']`. Search needs the same override, not a new widget.

Custom CSS may only target `THEME_SLOTS`. Reading already has slots. Memo writing-area has none. `validValue` rejects `var()` in package CSS, so package authors recolor with hex on a slot, or with theme config tokens such as `--surface`. Do not add a memo slot that lets the list diverge from the editor. Do not touch data, events, filters, or CRUD.

## Usage (caller's view)

Callers keep the same React APIs. Chrome is CSS plus one wrap on the memo list column. After the change, these three sites still compile and still do the same work.

**Reading.** `ReadingPage` and `ReadingCatalog` keep `.reading-page`, `.reading-layout`, `.reading-sidebar`, and `.reading-nav.selected`. Filters, search, covers, and drag stay. Wallpaper shows because the page and sidebar defaults become transparent. A package still paints those regions with `[data-theme-slot="reading-page"]` and `[data-theme-slot="reading-sidebar"]`.

```tsx
// src/pages/Reading/ReadingPage.tsx (unchanged markup)
<div className="reading-page" data-theme-slot="reading-page">
  <header data-theme-slot="page-header" className="reading-heading">…</header>
  <div className="reading-layout">
    <aside className="reading-sidebar" data-theme-slot="reading-sidebar">
      <button className={filter === id ? 'reading-nav selected' : 'reading-nav'} onClick={…}>
        {label}<span>{count}</span>
      </button>
      {/* shelves still use .reading-nav.selected and --accent-light */}
    </aside>
    <main className="reading-content">{/* toolbar, grid, covers unchanged */}</main>
  </div>
</div>
```

**Memo.** `MemoPage` and `MemoPage({ source })` share this tree. Heading and 메모 작성 stay the first-column header. Search, folders, label, and list move into `.memo-browse`. `hideFolders` still omits the nav. The editor form still writes `--memo-height`. No CRUD or `onChange` edits.

```tsx
// src/pages/Memo/MemoPage.tsx
<div className="memo-layout grid w-full gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
  <div className={selected ? 'hidden min-h-0 md:flex md:flex-col' : 'flex min-h-0 flex-col'}>
    <div data-theme-slot="page-header" className="flex items-center justify-between">
      <h1 className="text-2xl font-medium tracking-tight">{heading}</h1>
      <button data-theme-slot="button-primary" type="button" className="btn btn-primary" onClick={add}>
        메모 작성
      </button>
    </div>
    <div className="memo-browse">
      <input data-theme-slot="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="검색" className="field w-full" />
      {hideFolders ? null : <nav className="memo-folders" aria-label="메모 카테고리 폴더">{/* aria-current unchanged */}</nav>}
      <p className="memo-list-label">…</p>
      <ul className="mt-2">{/* same li / select / delete handlers */}</ul>
    </div>
  </div>
  <div className={selected ? 'memo-editor-column block' : 'memo-editor-column hidden md:block'}>
    {/* MemoEditor frozen */}
  </div>
</div>
```

**Diary.** Markup, icon, placeholder, `onChange`, and `.diary-search:focus-within` stay. The inner input keeps `data-theme-slot="input"` so package CSS on the input slot still reaches it.

```tsx
// src/pages/Diary/DiaryPage.tsx (unchanged)
<label className="diary-search">
  <ThemeIcon name="search" fallback={Search} size={15} aria-hidden="true" />
  <input data-theme-slot="input" aria-label="기록 검색" placeholder="기록 검색…" value={search} onChange={e => setSearch(e.target.value)} />
</label>
```

## Shape

The domain is which regions occlude wallpaper. Encode that as `ChromePaint` in `types.ts`. Three paints exist. Wallpaper (transparent default, optional `--blanky-*` override). Item selected (`--accent-light` on the row only). Sheet (`--surface` plus `--line`, used by diary workspace already and by the new memo browse pane).

**Reading. Subtract the occluding defaults.** Per subtract-before-you-add and redesign-from-first-principles, wallpaper is the default fill. Page background becomes `var(--blanky-reading-page-background, transparent)`. Sidebar background becomes `var(--blanky-reading-sidebar-background, transparent)`. Drop `--blanky-sidebar-background` and `--surface` from the sidebar chain. Those tokens always resolve to a color in a themed app, so they are the bug, not a fallback. Keep `--blanky-reading-sidebar-background` so a parent or future config can still paint that slot's own token. Package CSS on `reading-page` and `reading-sidebar` still wins through `runtimeCss`. `.reading-nav.selected` and `.reading-drop-target` keep `--accent-light`. Covers, grid, cards, search, and filters stay. `.reading-layout` keeps `gap: 36px` and the sidebar `border-right: 1px solid var(--line)`. Mobile keeps the bottom border at 700px. No extra column, no card around either pane.

Book detail uses `.reading-detail` with `--bg` today. That would restore a page-wide rectangle as soon as a book opens. Default it to transparent the same way, keeping `--blanky-reading-detail-background`. Highlights and notes stay `--surface` cards. They are content, not chrome.

`ReadingCatalog` uses the same classes. Add `data-theme-slot="reading-sidebar"` on its aside so custom-page reading can recolor that column the same way. Do not change its buttons or search.

**Memo. One pane class, height pairing retargeted inside the first grid child.** Per laziness-protocol, do not extract a shared sheet component and do not reuse `.memo-writing-area`. That class owns editor flex, focus-within glow, and child title rules. Copy the four visual tokens onto `.memo-browse` and leave the editor file frozen.

`--memo-height` has one writer (`MemoEditor`) and one reader (left column CSS). Per separate-before-serializing-shared-state, do not add a second setter. The first grid child still consumes `--memo-height` as `max-height`. Change it from `overflow-y: auto` to a flex column with `overflow: hidden`. `.memo-browse` takes `flex: 1; min-height: 0; overflow-y: auto`. Heading stays visible. The list scrolls inside the sheet. Tailwind `block` would override `display: flex`, so the first column classes become `flex flex-col` / `hidden md:flex md:flex-col`. Drop `mt-6` on the search input. Pane padding supplies the gap.

Internal memo regions keep existing `--line` splits (folder border, list `border-t`). No new cards or shadows. `hideFolders` is the same wrap with the nav omitted.

No new `THEME_SLOTS` entry. The editor is already only recolorable through `--surface`. The browse pane uses the same tokens, so a theme's surface color recoats both. A new slot would let package CSS paint the list different from the editor, which violates the match requirement. Per boundary-discipline, sanitizer and `FILL` stay untouched.

**Diary. Beat the global input longhand the way tags already do.** Per fix-root-causes, the fault is specificity, not the slot. Add `.diary-page .diary-search input[data-theme-slot='input']` (and the tagless input sibling) with `background: transparent; background-color: transparent; border: 0; outline: none; box-shadow: none`. That is 0,3,1 against the global 0,2,0. Do not edit `index.css`. Do not strip `data-theme-slot="input"`. Package CSS on `input` still applies through the runtime selector, same as every other field.

CSS is the single source of token values. `types.ts` names tokens and markup. It does not restate pixel values as a second list. Applying the CSS twice is a no-op. Per make-operations-idempotent, there is no JS transition to get half-wrong.

**Interface depth.** Public surface is three class names (`.reading-page` / `.reading-sidebar` defaults, `.memo-browse`, diary search override) and one wrap. Complexity lives in the cascade (sidebar token chain, height flex, input specificity). Callers do not import a chrome helper. Trace path is at most `MemoPage.tsx` → `memo.css` → `MemoEditor` height setter. Reading and diary are one CSS file each.

**Deliberately out of scope.** Data, events, filters, CRUD, app sidebar, `runtimeCss` `FILL`, new image keys, new cards, shadows, hardcoded white or gray.

## Synthesis decision

Runner candidate 2. Arena fills this after comparing candidates.

## Tradeoffs accepted

- We accept duplicating four visual declarations on `.memo-browse` in exchange for leaving `.memo-writing-area` and `MemoEditor` frozen.
- We accept that package CSS cannot target the memo browse pane by slot, in exchange for keeping list and editor on one `--surface` and skipping sanitizer or `THEME_SLOTS` edits.
- We accept that a theme's app-sidebar color no longer paints the reading left column, in exchange for wallpaper showing. Authors who want that fill write `[data-theme-slot="reading-sidebar"] { background: #… }`.
- We accept Tailwind flex classes on the memo first column, in exchange for `--memo-height` still matching the editor while the heading stays outside the scrolling sheet.

## Alternatives considered

- **Shared `PageSheet` / chrome primitive.** Hides token copying behind a component. Exposes a new import, props, and a second way to build a sheet next to raw CSS. Callers would have to learn the helper and the existing editor class. Rejected on interface depth and laziness-protocol.
- **Add `memo-browse` to `THEME_SLOTS`.** Lets package CSS recolor the list without forking `MemoPage`. Also lets the list diverge from the editor, and it forces sanitizer plus docs updates for a region the spec says should match `--surface`. Rejected.
- **Reuse `.memo-writing-area` on the list.** Smallest class add. Pulls focus-within glow, editor flex, and `.memo-editor .memo-title` coupling onto the list. Rejected.
- **Transparent fallbacks that still include `--blanky-sidebar-background`.** Looks like token reuse. The middle token is always set, so the column stays opaque. Rejected after tracing `themeVariables()`.
- **Remove `data-theme-slot="input"` from diary search.** Fixes the fill with no CSS. Package CSS on `input` can no longer reach the field, and it is a second pattern next to tags. Rejected.
- **Edit the global `.blanky-themed :is(.field, [data-theme-slot="input"])` rule** with `:not(.diary-search input)`. Moves diary policy into `index.css`. Every nested shell then needs a global exception. Rejected. Tags already own the local override pattern.
- **1px grid track or extra divider element for reading.** Extra box. The current gap plus `border-right` already is a thin `--line`. Rejected.

## Open questions and risks

- Should highlight and note cards on the reading detail view stay `--surface` while the detail chrome goes transparent? This sketch says yes. If the desired screenshot is a single white article, say so before implementation.
- Tailwind `hidden md:flex` must keep winning over `memo.css` `display: flex` on small screens when a memo is selected. If a later utility order flips that, the list would show beside the editor on mobile.
- `--memo-height` is unset when no memo is selected. The left column then grows with content, same as today. Confirm that empty-state height is acceptable with the new sheet padding.

## Next implementation step

In `reading.css`, change `.reading-page` and `.reading-sidebar` (and `.reading-detail`) fallbacks to `transparent` and drop `--blanky-sidebar-background` from the sidebar chain, then wrap `.memo-browse` and add the diary search override.

## Module map

```
src/pages/Reading/reading.css          # page/sidebar/detail defaults, keep gap + --line
src/pages/Reading/ReadingPage.tsx      # no markup change
src/pages/Reading/ReadingCatalog.tsx   # add data-theme-slot="reading-sidebar" only
src/pages/Memo/MemoPage.tsx            # flex column + .memo-browse wrap
src/pages/Memo/memo.css                # first-child flex, .memo-browse sheet + scroll
src/pages/Diary/diary.css              # search input override, tags-level specificity
src/pages/Diary/DiaryPage.tsx          # no markup change
packages/types/src/themePackage.ts     # THEME_SLOTS unchanged
src/theme/package/runtimeCss.ts        # FILL unchanged
src/styles/index.css                   # global input rule unchanged
```

## Red-flag screen

- Shallow module. No new public API. The CSS files hide cascade policy.
- Information leakage. Memo sheet tokens are copied, not exported. CSS remains the source of truth.
- Temporal decomposition. None. Regions own paint, not load/validate/save stages.
- Pass-through. None.
- Split ownership. `--memo-height` still has one writer.
- Two ways. Diary uses the tags override pattern only. No global `:not()` and no slot removal.
- Importable internals. No new module to import.
- Hand-synced list. No second `THEME_SLOTS` copy. Token values live in CSS only.
