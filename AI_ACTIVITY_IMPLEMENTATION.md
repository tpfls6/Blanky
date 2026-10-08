# Home AI / Activity

## Existing implementation reused

- `packages/parse` rule parser and existing Edge Function AI fallback via `classifySchedule`.
- `createWorkItem`, time helpers, date selectors and category services.
- `packages/api` schedule CRUD and `listChanges`; tasks now use the same schedule store with `kind = task`.
- `LibraryProvider` shared state and per-user browser persistence. No React Query was present.
- Existing `schedule_changes` table and owner RLS. No duplicate activity table.
- Existing personal-calendar changes in the working tree were preserved.

## Flow

Home input → conversation intent routing → existing parser → `commitWork` → schedule service/repository → Supabase → returned saved entity → shared library state + response card.

`lastId` references the saved DB ID during the mounted Home conversation. Pronouns use that ID; ambiguous names request clarification. Supported changes include time, relative hour shifts, date, task deadline, title and completion. Cards allow manual editing, completion and confirmed deletion. Korean IME composition does not accidentally submit.

Activity groups entries by local date and shows source, action, live entity and before/after snapshots. Deleted entities use retained snapshots. The DB trigger writes snapshots in the same transaction as the mutation. On initial load, server items replace cached server items; existing browser-only items remain and move to the server when edited. Legacy category IDs resolve through existing category APIs.

Home, daily calendar and task views share provider state, so successful mutations immediately appear when switching views. Saving failures retain existing state and display a global error. Requests are serialized; initial hydration is awaited and results from a previous user cannot enter a new user's library.

## Added files

- `src/features/ai/conversation.ts`
- `src/services/schedule/workStore.ts`
- `src/components/schedule/WorkCard.tsx`
- `src/pages/Activity/ActivityPage.tsx`
- `packages/parse/src/conversation.test.ts`
- `packages/api/src/activity.test.ts`
- `supabase/migrations/20261007120000_ai_activity.sql`
- `supabase/tests/ai_activity.sql`
- This implementation note.

## Modified files for this feature

`package.json`, `packages/api/src/database.generated.ts`, `packages/api/src/scheduleRepository.ts`, `packages/types/src/schedule.ts`, `src/App.tsx`, `src/constants/routes.ts`, `src/constants/navigation.ts`, `src/components/layout/AppLayout.tsx`, `src/pages/Home/HomePage.tsx`, `src/state/library.tsx`, `src/state/useLibrary.ts`, `src/types/records.ts`.

## Verification

- `npm.cmd test`: 28 tests pass, including 8 new conversation/API scenarios.
- `npm.cmd run build`: succeeds; existing large-bundle warning remains.
- Feature files pass targeted ESLint. Whole-repository ESLint has unrelated existing errors in IconPicker, Sortable, CategoryPicker, SchedulePage and Settings/bits.
- Tested creation parsing, saved-ID follow-ups, duration/afternoon preservation, relative shift, completion, ambiguity, missing references, advanced-request refusal, daily query, task deadline, date/title changes, repository task fields and deleted snapshots.
- Browser interaction and live Supabase writes were not verified. Supabase CLI status was unavailable because it tried to write telemetry outside the permitted workspace; Docker was not found on PATH.
- SQL regression tests are supplied but have not been executed.

## Deployment and current limits

Apply `20261007120000_ai_activity.sql` after the existing personal-calendar migration before running against configured Supabase. This change does not apply or reset any database. Without Supabase configuration, the existing per-user browser store is used.

General-purpose chat, free-time recommendations, automatic rearrangement and weekly analysis are deferred. Intent routing is rule based and creation uses the existing parser/AI fallback. Natural-language deletion is deferred; cards support manual deletion. Conversation messages and last-entity context last only while Home stays mounted. Cross-device realtime subscriptions and automatic bulk migration of legacy browser items are not included. Older history rows without snapshots show their entity ID.

## Authentication integration follow-up

The previous login provider authenticated browser demo accounts only. A configured Supabase now uses `RemoteSessionProvider`, real Auth signup/login/logout, session restoration and Auth state subscriptions. Protected routes wait for session initialization. Profile and password updates use server Auth; server account deletion and the password recovery screen remain unavailable and report that explicitly. The browser-only provider still applies when Supabase is not configured.

Existing demo accounts do not automatically become Supabase accounts. Reload the app and sign in with a server account, or sign up and confirm email if confirmation is enabled. When the same email signs in, existing browser library data is retained under the authenticated UUID without overwriting an existing cache. Passwords are not copied into the server identity or its library.

Added `src/state/remoteSession.tsx`, `src/services/auth/account.ts`, `src/services/auth/legacyLibrary.ts` and `packages/api/src/authAccount.test.ts`. Updated authentication forms, account settings, route guards, session interfaces and hydration error clearing. Tests now total 32 and the build passes; actual interactive account login was not performed by the agent.
