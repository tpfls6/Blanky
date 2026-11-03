## Problem

Blanky already owns a Google Calendar pipeline behind `ConnectionView` and `createCalendarSyncClient`. Settings only mounts that UI at the bottom of `/settings/schedule`, after every Schedule preference. The page is easy to miss. Several legal states render as dead ends. `awaiting_consent` has no retry even though `start_connect` is allowed again. Ready hides the account behind last-sync text. Disconnect asks two yes/no questions and never says Google events stay. The OAuth callback always returns to `/settings/schedule`, so any new home still has to finish calendar pick after that landing. The backend, Edge Functions, and `ConnectionView` stay. The job is a findable Settings home that shows real state and only the actions the handler already supports.

## Usage (caller's view)

A signed-in user opens Settings. The sidebar and the mobile section menu both list **Google Calendar**. That page is the only place that connects, picks a calendar, syncs, or disconnects. `/settings/schedule` keeps a one-line status that links here. After Google consent, the browser still lands on `/settings/schedule`. If setup is incomplete, that line sends the user to this page so they can pick a calendar.

SettingsPage grows two mounts and one section row. It does not call the sync client.

```tsx
import { Calendar } from 'lucide-react'
import {
  GOOGLE_CALENDAR_SECTION,
  GoogleCalendarPanel,
  GoogleCalendarScheduleLink,
} from './GoogleCalendarPanel.tsx'

const SECTIONS = [
  // existing rows
  { id: 'schedule', label: 'Schedule', description: '...', icon: CalendarDays },
  { ...GOOGLE_CALENDAR_SECTION, icon: Calendar },
  { id: 'categories', label: 'Categories', description: '...', icon: Tag },
] as const

// /settings/google-calendar
if (id === GOOGLE_CALENDAR_SECTION.id) {
  body = (
    <Section>
      <GoogleCalendarPanel />
    </Section>
  )
}

// /settings/schedule, above the preference blocks
body = (
  <Section>
    <GoogleCalendarScheduleLink />
    {/* week start, hours, density, notifications */}
  </Section>
)
```

The panel talks to the existing client only.

```tsx
const sync = getCalendarSyncClient()
const view = await sync.status()
if (view.status === 'connected') {
  const calendars = await sync.listCalendars()
  await sync.selectCalendar({
    googleCalendarId: calendars[0].id,
    firstImport: { direction: 'from_google' },
  })
}
if (view.status === 'ready') await sync.sync()
window.location.assign((await sync.startConnect()).authUrl)
await sync.disconnect({ importedRows: 'keep' })
```

`GoogleCalendarScheduleLink` calls `status()` once. If `shouldLeaveScheduleForSetup(view)` is true, it renders `<Navigate to={googleCalendarPath()} replace />`. Otherwise it shows the one-line status and a link to the same path.

## Shape

`ConnectionView` is the only connection state machine. The panel does not keep a second `connected` boolean, a leftover `message` that impersonates status, or a home-grown phase enum that repeats `view.status`.

Client-only load sits beside that view, not inside it.

```ts
type PanelState =
  | { kind: 'loading' }
  | { kind: 'blocked'; message: string }
  | { kind: 'live'; view: ConnectionView; /* ephemeral UI, see TYPES.ts */ }
```

`blocked` covers a missing Supabase browser client. That is not a server connection. A `status()` payload with `status: 'error'`, or a thrown client error that carries a `CalendarErrorCode`, stays a live `ConnectionView`.

**Control table.** `visibleControls(view)` is the single list of what the page may show. React renders that object. It does not branch on status in five places. Derived fields, not stored ones, per encode-lessons-in-structure.

| `view.status` | Intro | Consent | Account | Calendar pick / first import | Bound calendar | Auto sync / manual sync / last sync | Disconnect |
|---|---|---|---|---|---|---|---|
| `disconnected` | Yes | Connect | | | | | |
| `awaiting_consent` | | Retry | | | | | Leave |
| `connected` | | | Email | Yes | | | Leave |
| `ready` | | | Email | | Summary, not a picker | Yes | Policy |
| `needs_reauth` | | Reconnect | Email | | Summary | | Policy |
| `error` | | Retry when the code is recoverable | | | | | Leave |

Unsupported work is absent. No ongoing sync-direction control. No calendar re-pick after ready. `list_calendars` already throws `NEEDS_CALENDAR` once bound.

**Consent is one call.** Connect, retry, and reconnect all run `startConnect()` then `window.location.assign(authUrl)`. Copy changes. The client method does not.

**Disconnect policy.** Google events are never deleted. Only Blanky rows imported from Google can go. `ready` and `needs_reauth` open one dialog with keep, delete, and cancel. `awaiting_consent` and `connected` have no imported rows, so they confirm leave and send `{ importedRows: 'keep' }`. Two sequential confirms are gone.

**Ephemeral UI.** Calendar pick draft exists only when `view.status === 'connected'` (typed in `LivePanel`). `inflight` blocks a second submit of the same command. `notice` is the last command result. It is not connection status. After any command the panel calls `status()` and trusts that view, per make-operations-idempotent. A crash mid-pick remounts into `connected` or `ready` from the server.

**Auto-sync.** `shouldAutoSync(view, nowMs)` stays a 5 minute stale check on ready with `autoSync` on. It runs when the Google Calendar page opens, not when Schedule preferences open.

**Errors.** `noticeFromUnknown` is the parse boundary for thrown client errors. `CalendarErrorCode` maps to Korean copy there. The panel does not inspect raw `{ code }` objects, per boundary-discipline.

**Findability.** Google Calendar is a Settings section because that is how every other Settings topic is found. Schedule does not get a second full panel. The OAuth Edge Function is unchanged. Incomplete setup leaves `/settings/schedule` through the existing link component.

**Interface depth.** Public interface is `GOOGLE_CALENDAR_SECTION`, `GoogleCalendarPanel`, and `GoogleCalendarScheduleLink`. Hidden behind them: the control table, OAuth return rule, pick draft, disconnect policy, error copy, last-sync formatting, and auto-sync stale check. SettingsPage does not orchestrate commands. Transport types from the Edge Function do not leak into the page.

**Files.** Replace `GoogleCalendarSection.tsx` with two files. `googleCalendar.ts` holds the pure model. `GoogleCalendarPanel.tsx` holds the panel, the schedule link, and the policy dialog. Reuse `getCalendarSyncClient`, `Choice`, `SwitchRow`, `Section`, and `ConfirmDialog` for the simple leave confirm.

**Shared writes.** The schedule link and the panel each call `status()`. They do not share React state. The server connection row is the merge point, per separate-before-serializing-shared-state.

## Synthesis decision

Arena fills this after comparing candidates. This runner's claim is a dedicated Settings section plus a `ConnectionView`-derived control table. Schedule only links here.

## Tradeoffs accepted

- We accept a new Settings nav row in exchange for a name people can find without scrolling Schedule.
- We accept a client redirect after OAuth in exchange for leaving the Edge Function landing on `/settings/schedule`.
- We accept that Schedule no longer hosts connect or calendar pick, so a failed redirect still needs the one-line link.
- We accept a custom policy dialog instead of stretching `ConfirmDialog` to two confirms.
- We accept that auto-sync no longer runs just because someone opened Schedule preferences. The stale check belongs on the page that owns sync.
- We accept Korean copy living in `googleCalendar.ts` so the control table and the strings stay in one module.

## Alternatives considered

- **Keep the panel on Schedule and pin it to the top.** Callers still look for a nav name that does not exist. The mobile section menu still says Schedule. The page mixes connection work with week-start prefs. Rejected for findability.
- **Mount the full panel on both Schedule and a new section.** OAuth would finish on the landing page. Callers would have two places to change connect copy, pick UI, and disconnect policy. Rejected as two ways to do one task.
- **Add a generic Integrations section.** Only one integration exists. The extra hub adds a page that hides nothing and forces a second hop. Rejected as a larger public interface with less policy inside.
- **Change `google-calendar-oauth` to redirect at `/settings/google-calendar`.** That is the clean landing, but the task keeps the Edge Functions. Rejected.
- **Hash-scroll `#google-calendar` on Schedule.** The mobile `<select>` cannot name a hash. OAuth still drops the user into prefs chrome. Rejected as a weaker nav entry.
- **A CalendarSync React context.** One page consumes the client. A provider would be a pass-through layer. Rejected per laziness-protocol and minimize-reader-load.

## Open questions and risks

- If `google-calendar-oauth` later adds a query flag, should the schedule link keep redirecting on `connected`, or only when that flag is present?
- Should `needs_reauth` also redirect away from Schedule, or is the one-line "다시 연결 필요" enough so prefs stay reachable?
- Is a failed `status()` on Schedule allowed to skip the redirect, leaving the user on prefs with a dead link?

## Next implementation step

Write `visibleControls`, `shouldLeaveScheduleForSetup`, and `noticeFromUnknown` in `googleCalendar.ts` and cover them with table tests before the panel JSX.
