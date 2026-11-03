# Synthesis. Candidate 2 base, three grafts from 1

## Pick

Base is candidate 2. The candidates are the same shape. Wallpaper defaults, one memo sheet, diary specificity override, no new theme slot. Candidate 2 wins on two real bugs candidate 1 would ship.

1. Tailwind `block` / `hidden md:block` overrides CSS `display: flex`. The memo first column must use `flex flex-col` / `hidden md:flex md:flex-col`.
2. `.reading-detail` still falls back to `--bg`. Opening a book would restore the white slab. Default it to transparent.
3. The global themed input rule sets `background-color`. Diary must reset `background` and `background-color`.

## Cross-judge

[Cross-judge](0ee15676-c21f-4f0f-a885-4101dd4eb2f3) also picked candidate 2. Extra implementation constraint: Tailwind v4 unlayered `memo.css` beats utilities. Do not set `display` or `flex-direction` on `.memo-layout > :first-child` in CSS. Display lives only on Tailwind (`flex min-h-0 flex-col` / `hidden min-h-0 md:flex md:flex-col`). Column CSS is `max-height`, `min-height: 0`, `overflow: hidden`. Diary selector stays tags-identical: `.diary-page .diary-search input[data-theme-slot='input']`, and keep min-width / flex / font-size / color.

## Grafts from candidate 1

- Keep `--memo-height` writer as `MemoEditor` only. First child clamps. Pane scrolls. Both sketches agree.
- Class name stays `.memo-browse` (candidate 2). `memo-browse-pane` was clearer but is a synonym. Do not add both.
- ReadingCatalog `data-theme-slot="reading-sidebar"` is skipped. That file does not exist on `origin/main`.

## Rejected

- New `THEME_SLOTS` entry
- Shared `ChromePane` / `.memo-writing-area` reuse
- Editing `src/styles/index.css`
- Removing `data-theme-slot="input"` from diary search
- Keeping `--blanky-sidebar-background` in the reading sidebar chain

## Implement on

Worktree `C:\Users\serin\Github\Blanky-page-chrome`, branch `feat/reading-memo-diary-chrome` off `origin/main`.
