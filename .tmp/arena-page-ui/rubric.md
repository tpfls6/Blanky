# Rubric (judge and picker only; candidates must not see this)

Score 1-5 each.

1. Spec match. Reading is open over wallpaper. Memo left is one pane holding search, categories, list. Diary search inner fill matches the `--hover` shell.
2. Token reuse. No hardcoded white/gray. Existing `--surface`, `--hover`, `--accent-light`, `--line`, `--blanky-reading-*` used. New slots only if custom CSS cannot reach the region otherwise.
3. Behavior freeze. Search, filters, category select, memo CRUD, reading drag/nav, diary search events unchanged.
4. Interface depth. Small public surface. No new layout framework, shared primitive, or token registry unless it removes a real duplicated rule.
5. Theme extensibility. A custom theme file can still recolor each region without forking page components.
6. Mobile. Existing memo `md:` hide/show and diary/reading media queries still work. Left pane scrolls inside itself.
