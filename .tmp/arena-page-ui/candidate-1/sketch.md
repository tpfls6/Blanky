# Candidate 1. Subtract fills, one memo pane, diary selector weight

## Problem

Reading, memo, and diary sit on a wallpapered `[data-theme-slot="app"]`. `.theme-app-layout` is already transparent. Page chrome that paints `--bg` or `--surface` hides that wallpaper.

Reading's opaque card is `.reading-page` itself. Its fallback is `--blanky-reading-page-background, var(--bg)`. The left column then paints again through `--blanky-reading-sidebar-background` falling back to `--blanky-sidebar-background` then `--surface`. Nav and shelf rows already use `--accent-light` when selected. The column fill is the extra box.

Memo is the inverse. Search, folders, and the list sit on wallpaper. The right editor already uses `--surface`, `1px solid var(--line)`, 14px radius, and 20px padding on `.memo-writing-area`. The spec wants that same pane around browse controls only. The heading and 메모 작성 stay outside, the way diary's heading sits outside `.diary-workspace`. `--memo-height` is written by `MemoEditor`'s `useLayoutEffect` onto `.memo-layout`. Today `.memo-layout > :first-child` both clamps and scrolls. After the wrap, the first child still clamps to the editor. The pane scrolls.

Diary search is a `--hover` shell around an input that also has `data-theme-slot="input"`. `.blanky-themed :is(.field, [data-theme-slot="input"])` is specificity 0,2,0 and beats `.diary-search input` at 0,1,1. Tags already win with `.diary-page .diary-tags-field input[data-theme-slot='input']`. Search needs the same weight. Do not change data, events, filters, or CRUD. Do not add cards, shadows, or a memo theme slot.

## Usage (caller's view)

Consumers already mount these class names and slots. This change does not add a chrome API. Pages keep importing their CSS. Callers keep passing the same props.

**Reading.** Keep `.reading-page`, `.reading-layout`, `.reading-sidebar`, `.reading-nav`, and `.reading-nav.selected`. After the CSS fallback change, the wallpaper shows through the page and the left column. Selected rows still fill with `--accent-light`. Search, filters, covers, and drag stay on the existing nodes.

```tsx
<div className="reading-page" data-theme-slot="reading-page">
  <header data-theme-slot="page-header" className="reading-heading">
    <div><h1>{t('reading.title')}</h1><p>읽고, 기억하고, 나만의 책장에 담아요.</p></div>
    <button className="btn btn-primary" onClick={() => setSearch(true)}>+ 책 추가 · 검색</button>
  </header>
  <div className="reading-layout">
    <aside className="reading-sidebar" data-theme-slot="reading-sidebar" aria-label="독서 책장">
      <button className={filter === id ? 'reading-nav selected' : 'reading-nav'} onClick={() => { setFilter(id); navigate('/reading') }}>{label}</button>
    </aside>
    <main className="reading-content">{/* toolbar, covers, unchanged */}</main>
  </div>
</div>
```

`ReadingCatalog` uses the same `.reading-page` / `.reading-sidebar` / `.reading-nav.selected` classes, so it inherits the transparent chrome without a catalog-specific edit.

**Memo.** `MemoPage` and `hideFolders` custom-page `source` share one tree. Wrap search, folders, and the list in `.memo-browse-pane`. Leave the heading row a sibling. Do not touch `MemoEditor`, `source.add` / `save` / `remove`, or the `--memo-height` writer.

```tsx
<div className="memo-layout grid w-full gap-8 md:grid-cols-[260px_minmax(0,1fr)]">
  <div className={selected ? 'hidden md:block' : 'block'}>
    <div data-theme-slot="page-header" className="flex items-center justify-between">
      <h1 className="text-2xl font-medium tracking-tight">{heading}</h1>
      <button data-theme-slot="button-primary" type="button" className="btn btn-primary">{/* 메모 작성, same onClick */}</button>
    </div>
    <div className="memo-browse-pane">
      <input data-theme-slot="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색" className="field w-full" />
      {hideFolders ? null : <nav className="memo-folders" aria-label="메모 카테고리 폴더">{/* aria-current folders unchanged */}</nav>}
      <p className="memo-list-label">{/* same label + count */}</p>
      <ul className="mt-2">{/* same list buttons and CRUD */}</ul>
    </div>
  </div>
  <div className={selected ? 'memo-editor-column block' : 'memo-editor-column hidden md:block'}>
    {/* MemoEditor unchanged */}
  </div>
</div>
```

Drop `mt-6` on the search input. Pane padding (20px) is the inset. Folder `aria-current`, query `onChange`, and list CRUD stay on the same elements.

**Diary.** Keep the label, icon, `data-theme-slot="input"`, placeholder, `value` / `onChange`, clear button, and `.diary-search:focus-within`. Only the CSS selector that paints the inner input changes.

```tsx
<label className="diary-search">
  <ThemeIcon name="search" fallback={Search} size={15} aria-hidden="true" />
  <input
    data-theme-slot="input"
    aria-label="기록 검색"
    placeholder="기록 검색…"
    value={search}
    onChange={e => setSearch(e.target.value)}
  />
  {search && <button data-theme-slot="button" type="button" aria-label="검색 지우기" onClick={() => setSearch('')}>×</button>}
</label>
```

A custom theme still recolors reading through `[data-theme-slot="reading-page"]` and `[data-theme-slot="reading-sidebar"]`, memo through `--surface` / `--line` (the same tokens as `.memo-writing-area`), and diary search through `[data-theme-slot="input"]` plus the shell's `--hover`.

## Shape

**Data structure.** Page chrome is three paint layers, not three one-off page styles.

| Layer | Paint | Where it applies |
| --- | --- | --- |
| wallpaper | transparent, app wallpaper shows | `.reading-page`, `.reading-sidebar`, memo heading row, `.diary-page` (already) |
| pane | `--surface`, `1px solid var(--line)`, 14px radius, 20px padding | `.memo-browse-pane`, `.memo-writing-area` (already), `.diary-workspace` (already, keep its own radius token) |
| selected | `--accent-light` on the item only | `.reading-nav.selected`, `.memo-folder[aria-current=page]`, diary entries (already) |

A region is one layer. Reading page+sidebar cannot also be a pane. Nav selected cannot paint the column. Encoded in `ChromeLayer` in `types.ts`. There is no runtime parser. CSS is the implementation. per `principle-model-the-domain` and `principle-foundational-thinking`.

**Reading.** Subtract. Change the page fallback from `--bg` to `transparent`. Change the sidebar fallback from `--blanky-sidebar-background, var(--surface)` to `transparent`. Keep `--blanky-reading-page-background` and `--blanky-reading-sidebar-background` as the first lookup so a parent that sets those variables still wins. Drop `--blanky-sidebar-background` from the reading column. That token belongs to `.theme-sidebar`. Using it here is what makes the left column an opaque box. per `principle-subtract-before-you-add` and `principle-laziness-protocol`.

Keep `.reading-layout` `gap: 36px` and the sidebar `border-right: 1px solid var(--line)`. After the fill is gone, that pair is the split. Do not add a divider node, an inner card, or extra column padding. Mobile keeps `border-right: 0` and `border-bottom: 1px solid var(--line)` at `max-width: 700px`. Titles stay text in `.reading-heading h1`. Covers, toolbar, and drag attributes stay.

**Memo.** One wrapper class, `.memo-browse-pane`. Paint it with the four writing-area tokens copied into that class. Do not extract a shared `.memo-surface` class. Writing-area also has flex, overflow, and `:focus-within` glow that a browse list must not inherit. Duplicating four declarations hides that trap. per `principle-minimize-reader-load`.

`--memo-height` stays a CSS variable on `.memo-layout`, written only by `MemoEditor`. The first grid child still gets `max-height: var(--memo-height)`. Change it from `overflow-y: auto` to a column flex with `overflow: hidden`. The pane gets `flex: 1`, `min-height: 0`, and `overflow-y: auto`. Heading stays visible. The list scrolls inside the pane. When no editor is mounted the variable is unset, `max-height` is ignored, and the pane grows. That is today's empty-right behavior. per `principle-separate-before-serializing-shared-state` and `principle-make-operations-idempotent`.

Do not add `memo-pane` to `THEME_SLOTS`. Custom package CSS may only target listed slots. `.memo-writing-area` has no slot today. Adding a slot only on the browse pane would let themes recolor the list independently of the editor they must match. Recolor both by changing `colors.surface` / `colors.border`, which `themeVariables()` already maps to `--surface` and `--line`. Do not add a FILL key or image pipeline. per `principle-laziness-protocol` and `principle-boundary-discipline`.

`hideFolders` returns the same `page` tree without `PageCanvas`. The wrap lives in that tree, so custom-page memo gets the same pane.

**Diary.** The fault is selector weight, not the `input` slot. Strengthen the existing `.diary-search input` rule to `.diary-page .diary-search input[data-theme-slot='input']` (0,3,1) and keep `background: transparent`, `border: 0`, `outline: none`, `box-shadow: none`. That matches the tags override. Leave `.diary-search { background: var(--hover) }` and `.diary-search:focus-within` alone. Do not edit `src/styles/index.css`. A global `:not(.diary-search input)` would teach `index.css` about diary. Do not remove `data-theme-slot="input"`. Themes would lose the legal inner-input hook. per `principle-fix-root-causes` and `principle-encode-lessons-in-structure`.

**Interface depth.** Public interface is existing page classes plus one memo class name. Callers do not coordinate a chrome helper. Height pairing, wallpaper fallbacks, and input specificity stay in the three page stylesheets. Tracing is CSS file, then the matching `tsx` if markup moved. No fourth module.

**Deliberately not done.** No `ChromePane` component. No token registry. No `THEME_SLOTS` edit. No `runtimeCss.ts` FILL change. No data/event/filter/CRUD edits. No new card or shadow. No hardcoded `#fff` / gray. `reading-detail` keeps `--bg`. Book-cover `--shadow` stays. Memo editor JS stays.

**Invariants.**

1. Wallpaper layer defaults are `transparent`, never `--bg` or `--surface`.
2. Selected fill lives on the item class, never on the column.
3. `.memo-browse-pane` paint equals `.memo-writing-area` paint. Four tokens, same values.
4. `--memo-height` has one writer, `MemoEditor`.
5. Diary search inner fill is transparent. The shell keeps `--hover`.
6. Custom CSS still reaches reading via existing slots, memo via `--surface`/`--line`, diary inner input via `input`.

Validation is CSS cascade plus the existing sanitizer at the package boundary. Pages trust tokens. per `principle-boundary-discipline` and `principle-type-system-discipline`.

## Synthesis decision

This file is candidate 1. Arena synthesis happens after the sibling candidate. Internally this shape beat the alternatives under Alternatives considered. The base is subtract-on-reading, sibling-wrap-on-memo, selector-weight-on-diary.

## Tradeoffs accepted

- We accept duplicating four writing-area paint declarations on `.memo-browse-pane` in exchange for not sharing `:focus-within` glow or flex overflow with the list.
- We accept that custom package CSS cannot target the memo pane as its own slot in exchange for keeping the pane locked to the editor's `--surface` / `--line` and leaving `THEME_SLOTS` unchanged.
- We accept keeping `--blanky-reading-*-background` as an unused-until-set first lookup in exchange for not breaking any parent that already sets those variables.
- We accept a one-div memo wrap in exchange for heading-outside-pane without a new layout component.
- We accept leaving `ReadingCatalog`'s aside without `data-theme-slot="reading-sidebar"` (pre-existing) in exchange for not expanding slot markup in this change. Class-based transparency still applies.

## Alternatives considered

**Shared `ChromePane` React component wrapping reading, memo, and diary.** Public interface would be a prop bag for "has heading / has pane / has selected items". Callers would learn a layout framework to do what CSS classes already do. Complexity would leak into every page. Reading must not be a pane, so the component would grow a mode flag. Rejected as a shallow module and as temporal decomposition.

**Add `memo-pane` to `THEME_SLOTS` and put it on the browse wrapper.** That hides nothing. It exposes a new legal target that FILL does not paint and that `.memo-writing-area` does not share. Themes could then paint the list a different color from the editor. Rejected. The spec wants those two regions paired.

**Change the global `.blanky-themed :is(.field, [data-theme-slot="input"])` rule to skip nested inputs.** Callers of `index.css` would own diary's composite-shell rule. Home composer and other nested `input` slots would change without being in spec. Rejected for split ownership.

**Remove `data-theme-slot="input"` from the diary search field.** That would dodge the 0,2,0 rule by deleting the hook custom CSS uses. Tags kept the slot and won on specificity. Search should do the same. Rejected.

**Keep reading sidebar's `--blanky-sidebar-background` fallback, only clear `.reading-page`.** The left column would still be an opaque `--surface` strip. The spec wants per-item selected fill only. Rejected.

**Make `.memo-layout > :first-child` the pane (background on the column, heading inside).** Heading would sit on `--surface` with the list. Diary's heading-outside pattern would not hold. Rejected. per `principle-experience-first` and `principle-redesign-from-first-principles`.

**Extract `.memo-surface` and apply it to writing-area plus browse pane.** One class would tempt copying writing-area focus styles onto the list. The four-token duplication is the smaller interface. Rejected.

## Open questions and risks

- Should a later theme release add one slot used by both `.memo-writing-area` and `.memo-browse-pane`, so package CSS can recolor the pair without changing `colors.surface` for the whole app?
- Home's composer also puts `data-theme-slot="input"` on a nested transparent field. Should that get the same specificity treatment in a follow-up, or is diary the only composite `--hover` shell that must match?
- When `--memo-height` is unset (no selected memo, editor unmounted), is growing the left column with the list still the right empty-state, including on `hideFolders` custom pages?

## Next implementation step

Edit `src/pages/Reading/reading.css` so `.reading-page` and `.reading-sidebar` default to transparent, then confirm wallpaper shows with selected nav fill still on `.reading-nav.selected`.
