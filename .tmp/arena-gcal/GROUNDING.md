# How Google Calendar sync works

Verified from source in Blanky. Graphify-out exists and pointed at these files. Live Google OAuth was not run.

## Overview

Blanky already has a server-owned Google Calendar pipeline. The browser never talks to Google Calendar APIs and never sees the client secret or refresh token. `createCalendarSyncClient` in `packages/api/src/calendarSync/client.ts` invokes the `google-calendar` Edge Function. Google's OAuth code returns to `google-calendar-oauth`. Login (`signInWithGoogle`) is a separate client and does not request Calendar scopes.

The Settings UI already exists as `GoogleCalendarSection` at the bottom of `/settings/schedule`. It is easy to miss. Several supported states are under-rendered. `awaiting_consent` has no retry button, so a denied consent can leave the user stuck.

## Key concepts

- `ConnectionView` in `packages/types/src/calendarSync.ts` is the only UI-facing state. Variants: `disconnected`, `awaiting_consent`, `connected` (account linked, no calendar yet), `ready`, `needs_reauth`, `error`.
- `FirstImport` is `{ direction: 'from_google' | 'from_blanky' }`. It runs once when a calendar is bound. After that, `runSync` is two-way. There is no ongoing direction setting. Do not invent one in the UI.
- `DisconnectDisposition` is `{ importedRows: 'keep' | 'delete' }`. Disconnect deletes the connection and optionally imported Blanky rows. It does not delete Google events.
- Calendar cannot be changed after `ready`. `list_calendars` throws `NEEDS_CALENDAR` if already ready.
- Tokens live on the connection row, refreshed in `withTokens` / `refreshAccessToken`. Refresh failure marks `needs_reauth`.
- Duplicates are prevented by `google_calendar_event_links` plus the `blankyScheduleId` extended property.
- OAuth callback always redirects to `{origin}/settings/schedule` (`supabase/functions/google-calendar-oauth/index.ts`).

## How it works

1. Settings calls `status()`. Handler loads the user connection and returns `viewFromConnection`.
2. Connect calls `start_connect`. Server stores a hashed OAuth state and returns a Google consent URL. Browser navigates there.
3. Google hits `google-calendar-oauth` with `code` and `state`. Server exchanges the code, reads userinfo, stores tokens and email, redirects to `/settings/schedule`.
4. Status is now `connected`. UI lists calendars and asks for first-import direction.
5. `select_calendar` binds a Google calendar to a new Blanky external calendar, optionally clones personal events, then runs `runSync`.
6. Later `sync` and auto-sync (Settings open, last sync older than 5 minutes) run the same two-way reconcile.
7. Disconnect asks whether to keep or delete imported Blanky rows, then `disconnectConnection`.

## Where things live

- Types: `packages/types/src/calendarSync.ts`
- Domain + handler: `packages/api/src/calendarSync/{domain,handle,sync,reconcile,apply,store,oauth,googleApi,view,action,client,errors,env}.ts`
- Edge: `supabase/functions/google-calendar/index.ts`, `supabase/functions/google-calendar-oauth/index.ts`
- UI: `src/pages/Settings/GoogleCalendarSection.tsx`, mounted last in `SettingsPage.tsx` schedule body
- Client wrapper: `src/services/calendarSync/index.ts`
- Design primitives: `src/pages/Settings/bits.tsx` (`Section`, `Choice`, `SwitchRow`)
- Setup: `GOOGLE_CALENDAR_SETUP.md`
- Tests: `packages/api/src/calendarSync/handle.test.ts`, `reconcile.test.ts`. No Settings UI tests. No live Google run.

## Gotchas

- Do not expose an ongoing sync-direction picker. Only first import is directional.
- Do not expose calendar re-pick after ready unless you add a backend command. None exists.
- `ready` view has `accountEmail` and `calendarSummary`, but current `statusLine` hides the account behind last-sync text.
- `awaiting_consent` has no connect button. `start_connect` is allowed again from the handler.
- Disconnect must say Google events stay. Only Blanky imports can be deleted.
- Keep client secrets out of `VITE_` env. Errors use `GOOGLE_ENV_MISSING`.
- Do not redesign Settings. Make the existing connect flow findable and accurate.
- Existing schedule, task, and memo behavior must stay the same.

## Product constraints for the sketch

Required user-visible behavior:

1. Connect and disconnect
2. Status: connected / not connected / error
3. Connected Google account
4. Calendar pick (only while `connected`)
5. Sync direction only for first import
6. Manual sync
7. Last sync time and result
8. Error text and reconnect guidance
9. Intro + connect button before connect; details after connect
10. Findable from Settings without scrolling past every Schedule preference

## Rubric for picking a sketch

The picker scores these. Candidates do not see this list.

1. `ConnectionView` stays the single UI state machine. No parallel booleans.
2. Unsupported options are not shown.
3. Public surface stays small. SettingsPage does not grow new coordination.
4. OAuth return path still lands on a page that can finish calendar pick.
5. A later agent can implement from types and signatures alone.
