# Graph Report - Blanky  (2026-10-01)

## Corpus Check
- 126 files · ~49,329 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 2, .example 1, .webmanifest 1)

## Summary
- 934 nodes · 2380 edges · 41 communities (39 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7e01d8c3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api/src/index.ts
- registry.ts
- parse.ts
- App.tsx
- layout.ts
- getSupabaseClient
- preferences/index.ts
- utils/work.ts
- SchedulePage.tsx
- compilerOptions
- library.tsx
- accent.ts
- package.json
- utils/date.ts
- react
- compilerOptions
- compilerOptions
- devDependencies
- useLibrary
- api/package.json
- entries.ts
- schema.ts
- utils/src/index.ts
- auto-commit.mjs
- dependencies
- parse/package.json
- types/package.json
- utils/package.json
- vite.config.ts
- Builder.tsx
- scripts
- view.tsx
- tsconfig.json
- vite-env.d.ts
- SettingsPage.tsx
- types/index.ts
- IconPicker.tsx
- LibraryProvider
- Blanky
- features/records/index.ts
- properties.tsx

## God Nodes (most connected - your core abstractions)
1. `react` - 31 edges
2. `useLibrary()` - 31 edges
3. `AppError` - 29 edges
4. `LibraryProvider()` - 25 edges
5. `mapDbError()` - 21 edges
6. `DailyBoard()` - 21 edges
7. `getSupabaseClient()` - 21 edges
8. `compilerOptions` - 20 edges
9. `isRecord()` - 19 edges
10. `parseScheduleText()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `React Native + Expo 추가` --references--> `createSupabaseClient()`  [INFERRED]
  README.md → packages/api/src/supabase.ts
- `LibraryProvider()` --indirect_call--> `cloneBlock()`  [INFERRED]
  src/state/library.tsx → src/features/records/schema.ts
- `scheduleColumns()` --calls--> `AppError`  [EXTRACTED]
  packages/api/src/scheduleRepository.ts → packages/api/src/errors.ts
- `promoteRules()` --calls--> `rulesFromFeedback()`  [EXTRACTED]
  packages/api/src/feedbackRepository.ts → packages/parse/src/learn.ts
- `parsed()` --calls--> `parseScheduleText()`  [EXTRACTED]
  packages/parse/src/parse.test.ts → packages/parse/src/parse.ts

## Import Cycles
- None detected.

## Communities (41 total, 2 thin omitted)

### Community 0 - "api/src/index.ts"
Cohesion: 0.05
Nodes (94): errorFromInvoke(), mapParsedSchedule(), PARSE_SCHEDULE_FUNCTION, parseScheduleFromText(), readClock(), readDay(), readKind(), TABLES (+86 more)

### Community 1 - "registry.ts"
Cohesion: 0.13
Nodes (19): DEFAULT_SWATCH, SWATCHES, createBlock(), defaultProps(), GROUP_LABEL, INSERT_MENU, InsertItem, MenuGroup (+11 more)

### Community 2 - "parse.ts"
Cohesion: 0.05
Nodes (79): PARSE_CONFIG, blank(), buildFeedback(), FeedbackDraft, FeedbackSample, RULE_MIN_HITS, rulesFromFeedback(), SavedSchedule (+71 more)

### Community 3 - "App.tsx"
Cohesion: 0.08
Nodes (41): react-dom, react-router-dom, App(), GuestOnly(), RequireAuth(), AuthFrame(), AppLayout(), MobileNav() (+33 more)

### Community 4 - "layout.ts"
Cohesion: 0.13
Nodes (27): addBlock(), ALL_TYPES, block(), BLOCK_LABEL, BlockType, catalog(), coerceBlock(), CORE_TYPES (+19 more)

### Community 5 - "getSupabaseClient"
Cohesion: 0.12
Nodes (34): ref_blanky_api, ref_blanky_parse, @blanky/types, parseScheduleFromText(), getCurrentUserId(), signInWithPassword(), signOut(), createCategory() (+26 more)

### Community 6 - "preferences/index.ts"
Cohesion: 0.13
Nodes (25): navLabel(), NavSection(), clock(), defaultPreferences(), DENSITIES, flag(), HOME_INPUTS, isRecord() (+17 more)

### Community 7 - "utils/work.ts"
Cohesion: 0.06
Nodes (50): ref_blanky_utils, CATEGORIES, createSeed(), day(), work(), CategoryKind, RepeatRule, WorkInput (+42 more)

### Community 8 - "SchedulePage.tsx"
Cohesion: 0.11
Nodes (27): TaskCheckbox(), TaskCheckboxProps, byTime(), DailyBoard(), draftFromItem(), eventDates(), groupTasks(), holdsDay() (+19 more)

### Community 9 - "compilerOptions"
Cohesion: 0.08
Nodes (25): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+17 more)

### Community 10 - "library.tsx"
Cohesion: 0.18
Nodes (23): freshLibrary(), nowIso(), normalizeLayouts(), CustomRecordType, FieldValue, structureKey(), asRecord(), loadLibrary() (+15 more)

### Community 11 - "accent.ts"
Cohesion: 0.13
Nodes (22): CustomAccent(), applyAppearance(), prefersDark(), Accent, ACCENT_IDS, accentById(), accentHex(), AccentId (+14 more)

### Community 12 - "package.json"
Cohesion: 0.13
Nodes (18): @supabase/supabase-js, name, private, type, version, eslint, @eslint/js, eslint-plugin-react-hooks (+10 more)

### Community 13 - "utils/date.ts"
Cohesion: 0.16
Nodes (13): MiniCalendar(), MiniCalendarProps, MONDAY, SUNDAY, src_utils_date_adddays, daySpan(), src_utils_date_formatisodate, koreanLongDate() (+5 more)

### Community 14 - "react"
Cohesion: 0.16
Nodes (16): lucide-react, react, Drag, nearestIndex(), Pending, Sortable(), CategoryPicker(), CategoryPickerProps (+8 more)

### Community 15 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+9 more)

### Community 16 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+9 more)

### Community 17 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss, @tailwindcss/vite (+7 more)

### Community 18 - "useLibrary"
Cohesion: 0.22
Nodes (16): EmptyState(), resolveLayout(), DiaryEditor(), DiaryPage(), readTags(), tagText(), BookFields(), BookForm() (+8 more)

### Community 19 - "api/package.json"
Cohesion: 0.20
Nodes (9): dependencies, @blanky/types, @supabase/supabase-js, exports, @supabase/supabase-js, name, private, type (+1 more)

### Community 20 - "entries.ts"
Cohesion: 0.33
Nodes (10): captureTarget(), CustomRecord, ResolvedType, addCustom(), addReading(), applyCapture(), guessType(), parseReading() (+2 more)

### Community 21 - "schema.ts"
Cohesion: 0.17
Nodes (20): asRecord(), assert(), BLOCK_TYPES, cloneBlock(), coerceRecordType(), ensureTitle(), FIELD_BLOCKS, FoundBlock (+12 more)

### Community 22 - "utils/src/index.ts"
Cohesion: 0.25
Nodes (9): Category, CategoryNode, buildCategoryTree(), ClockRange, findOpenSlots(), formatClock(), parseClock(), ref_node_assert (+1 more)

### Community 23 - "auto-commit.mjs"
Cohesion: 0.25
Nodes (5): payload, root, ref_node_child_process, ref_node_fs, ref_node_path

### Community 24 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, @fullcalendar/react, lucide-react, react, react-dom, react-router-dom, @supabase/supabase-js, temporal-polyfill

### Community 25 - "parse/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 26 - "types/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 27 - "utils/package.json"
Cohesion: 0.33
Nodes (5): exports, name, private, type, version

### Community 28 - "vite.config.ts"
Cohesion: 0.33
Nodes (4): ref_node_url, @tailwindcss/vite, vite, @vitejs/plugin-react

### Community 29 - "Builder.tsx"
Cohesion: 0.21
Nodes (17): GROUPS, MenuList(), MenuSearch(), RecordBuilder(), filterMenu(), groupLabel(), canPlace(), contains() (+9 more)

### Community 30 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, db:reset, db:start, db:stop, db:types, dev, lint (+2 more)

### Community 31 - "view.tsx"
Cohesion: 0.18
Nodes (11): Block, RenderMode, BlockBody(), BlockContext, grow(), InlineText(), labelOf(), optionBy() (+3 more)

### Community 34 - "SettingsPage.tsx"
Cohesion: 0.17
Nodes (12): TextField(), TextFieldProps, Choice(), ConfirmDialog(), Section(), SwitchRow(), CategorySection(), SECTIONS (+4 more)

### Community 35 - "types/index.ts"
Cohesion: 0.13
Nodes (13): src_types_schedule_category, src_types_schedule_devicepushtoken, src_types_schedule_naturallanguageschedulerequest, src_types_schedule_priority, src_types_schedule_pushplatform, src_types_schedule_schedule, src_types_schedule_scheduleaimetadata, src_types_schedule_schedulechange (+5 more)

### Community 36 - "IconPicker.tsx"
Cohesion: 0.25
Nodes (11): IconItem, IconPicker(), IconPickerProps, loadRecent(), placePanel(), saveRecent(), filterIcons(), iconByName() (+3 more)

### Community 37 - "LibraryProvider"
Cohesion: 0.52
Nodes (11): mirrorCategoryCreate(), mirrorCategoryDelete(), mirrorCategoryReorder(), mirrorCategoryUpdate(), mirrorRecordDelete(), mirrorRecordSave(), mirrorRecordTypeDelete(), mirrorRecordTypeSave() (+3 more)

### Community 38 - "Blanky"
Cohesion: 0.18
Nodes (10): Blanky, PWA, React Native + Expo 추가, 기술 스택, 디렉터리, 설치 방법, 실행 방법, 향후 구현 예정 기능 (+2 more)

### Community 39 - "features/records/index.ts"
Cohesion: 0.53
Nodes (8): CustomRecordRenderer(), blankValues(), flatten(), hydrateValues(), requiredError(), selfCheckRecords(), titleFrom(), RecordPage()

### Community 40 - "properties.tsx"
Cohesion: 0.24
Nodes (5): BlockProperties(), ColorDots(), isInput(), text(), CheckItem

## Knowledge Gaps
- **220 isolated node(s):** `root`, `payload`, `name`, `private`, `version` (+215 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 281 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `registry.ts`, `SettingsPage.tsx`, `App.tsx`, `IconPicker.tsx`, `layout.ts`, `features/records/index.ts`, `properties.tsx`, `SchedulePage.tsx`, `library.tsx`, `package.json`, `utils/date.ts`, `useLibrary`, `Builder.tsx`, `view.tsx`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Why does `@blanky/types` connect `getSupabaseClient` to `types/index.ts`, `api/package.json`, `preferences/index.ts`, `utils/work.ts`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `ParsedSchedule` connect `parse.ts` to `api/src/index.ts`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `root`, `payload`, `name` to the rest of the system?**
  _220 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.054324206866579745 - nodes in this community are weakly interconnected._
- **Should `registry.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13230769230769232 - nodes in this community are weakly interconnected._
- **Should `parse.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.051111111111111114 - nodes in this community are weakly interconnected._