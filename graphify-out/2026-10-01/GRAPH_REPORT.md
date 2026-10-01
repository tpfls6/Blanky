# Graph Report - Blanky  (2026-10-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 857 nodes · 2134 edges · 34 communities (31 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7e01d8c3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api/src/index.ts
- schema.ts
- parse.ts
- App.tsx
- layout.ts
- services/schedule/index.ts
- preferences/index.ts
- utils/work.ts
- SchedulePage.tsx
- compilerOptions
- library.tsx
- accent.ts
- package.json
- utils/date.ts
- parseQuick.ts
- compilerOptions
- compilerOptions
- devDependencies
- freshLibrary.ts
- api/package.json
- entries.ts
- LibraryProvider
- categoryTree.test.ts
- auto-commit.mjs
- dependencies
- parse/package.json
- types/package.json
- utils/package.json
- vite.config.ts
- categoryKind
- scripts
- parse-schedule/index.ts
- tsconfig.json
- vite-env.d.ts

## God Nodes (most connected - your core abstractions)
1. `useLibrary()` - 31 edges
2. `react` - 31 edges
3. `AppError` - 27 edges
4. `mapDbError()` - 20 edges
5. `DailyBoard()` - 20 edges
6. `compilerOptions` - 20 edges
7. `isRecord()` - 19 edges
8. `parseScheduleText()` - 19 edges
9. `lucide-react` - 17 edges
10. `readString()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `promoteRules()` --calls--> `rulesFromFeedback()`  [EXTRACTED]
  packages/api/src/feedbackRepository.ts → packages/parse/src/learn.ts
- `loadLibrary()` --calls--> `coerceRecordType()`  [EXTRACTED]
  src/state/library.tsx → src/features/records/schema.ts
- `RecordSection()` --indirect_call--> `exportTemplate()`  [INFERRED]
  src/pages/Settings/RecordSection.tsx → src/features/records/schema.ts
- `RecordPage()` --calls--> `useLibrary()`  [EXTRACTED]
  src/pages/Records/RecordPage.tsx → src/state/useLibrary.ts
- `RecordSection()` --calls--> `iconByName()`  [EXTRACTED]
  src/pages/Settings/RecordSection.tsx → src/constants/icons.ts

## Import Cycles
- None detected.

## Communities (34 total, 3 thin omitted)

### Community 0 - "api/src/index.ts"
Cohesion: 0.05
Nodes (92): errorFromInvoke(), mapParsedSchedule(), PARSE_SCHEDULE_FUNCTION, parseScheduleFromText(), readClock(), readDay(), readKind(), getCurrentUserId() (+84 more)

### Community 1 - "schema.ts"
Cohesion: 0.05
Nodes (79): DEFAULT_SWATCH, SWATCHES, GROUPS, MenuList(), MenuSearch(), RecordBuilder(), BlockProperties(), ColorDots() (+71 more)

### Community 2 - "parse.ts"
Cohesion: 0.05
Nodes (76): PARSE_CONFIG, blank(), buildFeedback(), FeedbackDraft, FeedbackSample, RULE_MIN_HITS, rulesFromFeedback(), SavedSchedule (+68 more)

### Community 3 - "App.tsx"
Cohesion: 0.06
Nodes (56): react, react-router-dom, GuestOnly(), RequireAuth(), AuthFrame(), IconPicker(), IconPickerProps, TextField() (+48 more)

### Community 4 - "layout.ts"
Cohesion: 0.08
Nodes (52): lucide-react, EmptyState(), CategoryPicker(), CategoryPickerProps, Option, addBlock(), ALL_TYPES, block() (+44 more)

### Community 5 - "services/schedule/index.ts"
Cohesion: 0.09
Nodes (29): ref_blanky_api, @blanky/types, react-dom, App(), rootElement, parseScheduleFromText(), getCurrentUserId(), signInWithPassword() (+21 more)

### Community 6 - "preferences/index.ts"
Cohesion: 0.13
Nodes (25): navLabel(), NavSection(), clock(), defaultPreferences(), DENSITIES, flag(), HOME_INPUTS, isRecord() (+17 more)

### Community 7 - "utils/work.ts"
Cohesion: 0.12
Nodes (23): CategoryKind, RepeatRule, createWorkItem(), endFromStart(), filterByWhen(), filterTasks(), groupTasks(), inCategory() (+15 more)

### Community 8 - "SchedulePage.tsx"
Cohesion: 0.13
Nodes (21): TaskCheckbox(), TaskCheckboxProps, byTime(), DailyBoard(), draftFromItem(), eventDates(), hourRange(), PlanRow() (+13 more)

### Community 9 - "compilerOptions"
Cohesion: 0.08
Nodes (24): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+16 more)

### Community 10 - "library.tsx"
Cohesion: 0.20
Nodes (20): PageBlock, PageId, CustomRecordType, FieldValue, LibraryContext, LibraryValue, Book, BookStatus (+12 more)

### Community 11 - "accent.ts"
Cohesion: 0.16
Nodes (19): CustomAccent(), Accent, ACCENT_IDS, accentById(), accentHex(), AccentId, ACCENTS, applyAccent() (+11 more)

### Community 12 - "package.json"
Cohesion: 0.13
Nodes (17): name, private, type, version, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+9 more)

### Community 13 - "utils/date.ts"
Cohesion: 0.15
Nodes (14): ref_blanky_utils, MiniCalendar(), MiniCalendarProps, MONDAY, SUNDAY, src_utils_date_adddays, daySpan(), src_utils_date_formatisodate (+6 more)

### Community 14 - "parseQuick.ts"
Cohesion: 0.19
Nodes (16): WorkKind, DATE_PHRASE, dateOnWeek(), Meridiem, mondayOf(), parseDatePhrase(), parseQuick(), QuickDraft (+8 more)

### Community 15 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+9 more)

### Community 16 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 17 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, tailwindcss, @tailwindcss/vite (+7 more)

### Community 18 - "freshLibrary.ts"
Cohesion: 0.29
Nodes (8): freshLibrary(), nowIso(), CATEGORIES, createSeed(), day(), work(), DEFAULT_SETTINGS, ReadingLog

### Community 19 - "api/package.json"
Cohesion: 0.20
Nodes (9): @supabase/supabase-js, dependencies, @blanky/types, @supabase/supabase-js, exports, name, private, type (+1 more)

### Community 20 - "entries.ts"
Cohesion: 0.38
Nodes (9): captureTarget(), ResolvedType, addCustom(), addReading(), applyCapture(), guessType(), parseReading(), selfCheckEntries() (+1 more)

### Community 21 - "LibraryProvider"
Cohesion: 0.22
Nodes (10): cloneBlock(), structureKey(), applyAppearance(), asRecord(), LibraryProvider(), loadLibrary(), normalizeCategory(), normalizeRecord() (+2 more)

### Community 22 - "categoryTree.test.ts"
Cohesion: 0.36
Nodes (5): Category, CategoryNode, buildCategoryTree(), ref_node_assert, ref_node_test

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

### Community 29 - "categoryKind"
Cohesion: 0.47
Nodes (6): groupTasks(), holdsDay(), scopeTasks(), selfCheckTaskGroups(), TaskFolders(), categoryKind()

### Community 30 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

## Knowledge Gaps
- **201 isolated node(s):** `CategoryRow`, `CustomRecordRow`, `CustomRecordTypeRow`, `FeedbackRow`, `PreferenceRow` (+196 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 260 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App.tsx` to `schema.ts`, `layout.ts`, `services/schedule/index.ts`, `SchedulePage.tsx`, `library.tsx`, `package.json`, `utils/date.ts`?**
  _High betweenness centrality (0.197) - this node is a cross-community bridge._
- **Why does `@blanky/types` connect `services/schedule/index.ts` to `library.tsx`, `api/package.json`, `utils/work.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `ParsedSchedule` connect `parse.ts` to `api/src/index.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `CategoryRow`, `CustomRecordRow`, `CustomRecordTypeRow` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api/src/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05442278860569715 - nodes in this community are weakly interconnected._
- **Should `schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05025699600228441 - nodes in this community are weakly interconnected._
- **Should `parse.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0537280701754386 - nodes in this community are weakly interconnected._