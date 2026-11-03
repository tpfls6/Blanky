## Problem

Blanky already owns Google Calendar sync on the server. The Settings UI does not. `GoogleCalendarSection` sits last on `/settings/schedule`, so a user has to scroll past every Schedule preference to find it. The same component mixes `ConnectionView` with a free-form `message` string, hides the connected account behind last-sync text, and leaves `awaiting_consent` without a retry. Disconnect asks two yes/no questions and never says Google events stay. The sketch has to make the existing pipeline findable and honest without a new Settings section, without a new OAuth landing, and without inventing calendar re-pick or an ongoing sync direction.

## Usage (caller's view)

`SettingsPage` mounts one component as the first child of the Schedule `Section`. It does not hold calendar state.

```tsx
// src/pages/Settings/SettingsPage.tsx, schedule body
<Section>
  <GoogleCalendarSettings />
  {/* existing week-start, hours, density, notification rows stay as they are */}
</Section>
```

The Schedule nav description names the connection, because that is how a user finds it in the sidebar.

```ts
{ id: 'schedule', label: 'Schedule', description: 'Google Calendar 연결과 타임라인 기본값을 설정합니다.', icon: CalendarDays }
```

The component is a thin shell. Tests and the card both consume the same projection.

```tsx
// src/pages/Settings/GoogleCalendarSettings.tsx
export function GoogleCalendarSettings() {
  const { panel, notice } = useGoogleCalendarSettings()
  return <CalendarCard panel={panel} notice={notice} />
}
```

A later agent writes a test against `projectCalendarPanel`, not against the Edge Function.

```ts
const panel = projectCalendarPanel(
  {
    status: 'ready',
    accountEmail: 'ada@example.com',
    calendarSummary: 'Personal',
    autoSync: true,
    lastSync,
  },
  { calendars: [], busy: null, disconnectPrompt: null, actions },
)

expect(panel.status).toBe('ready')
expect(panel.accountEmail).toBe('ada@example.com')
expect(panel.sync).toEqual(expect.any(Function))
// bind is not on this variant. A ready card cannot call select_calendar.
```

What the user sees, by `ConnectionView.status`:

- `disconnected`. Short intro. One connect button. No calendar list, no direction, no disconnect.
- `awaiting_consent`. "Google에서 권한을 허용하면 이 화면으로 돌아옵니다." Retry connect. Same `startConnect` as first connect.
- `connected`. Account email. Calendar pick. First-import direction with a one-line note that later sync is two-way. Bind button.
- `ready`. Account, bound calendar name (not a picker), last sync time and counts, last sync error if present, manual sync, auto-sync switch, disconnect.
- `needs_reauth`. Account, bound calendar name, reconnect, disconnect.
- `error`. Mapped Korean text. Connect only when the code can recover that way. `GOOGLE_ENV_MISSING` and `UNAUTHENTICATED` show copy and no connect.

Disconnect opens one dialog. The first sentence is the remote-delete policy. Google events stay. The two real choices are keep imported Blanky rows or delete them.

## Shape

`ConnectionView` remains the only connection state machine. The UI adds a projection, not a second status enum.

**Data.** `CalendarPanel` is a discriminated union keyed by `ConnectionView['status']`, plus a panel-only `loading` variant. Each variant carries the fields that status already has and the actions that status may fire. `bind` exists only on `connected`. `sync` and `setAutoSync` exist only on `ready`. `disconnect` exists only on `ready` and `needs_reauth`. `calendars` exist only on `connected`. A card that switches on `panel.status` cannot offer an unsupported control, per type-system-discipline and encode-lessons-in-structure.

`Notice` is a sibling of the panel. A sync count or a failed click is not written into `ConnectionView`. The current `statusLine(view, extra)` merge is the thing this deletes.

`BusyAction` is the hook's single in-flight tag. User sync and the five-minute auto-sync both call one `runSync`. If a command is already running, the second call returns. One writer, per separate-before-serializing-shared-state.

`DisconnectPrompt` is local UI on the variants that can disconnect. It is not a connection status.

`BindDraft` lives inside the `connected` card. It dies when the view leaves `connected`. Default calendar is the primary choice, else the first. Default direction is `from_google`.

**Flow.** `useGoogleCalendarSettings` is the only module that calls `getCalendarSyncClient()`. On mount it reads `status()`. If the view is `connected`, it then reads `listCalendars()`. Connect navigates to `authUrl`. The OAuth callback already returns to `/settings/schedule`. Because the card is the first block, the user lands on calendar pick without a new route. Auto-sync runs only when the view is `ready`, `autoSync` is true, and `lastSync.at` is older than five minutes. Disconnect sends `DisconnectDisposition` and replaces the view with whatever `disconnect` returns.

`projectCalendarPanel` is a pure exhaustive switch. It is the load-bearing function. Korean copy and error mapping live next to it in one `copy` map keyed by `CalendarErrorCode`. The React card is a switch that renders fields the panel already has.

**Findability.** No new Settings nav item. Schedule already claims calendar defaults. The card moves to the first Schedule block and the sidebar description names Google Calendar. The card has `id="google-calendar"` so a later in-app link can jump here. That is the whole Settings change.

**Public interface.** Callers import `GoogleCalendarSettings`. Tests import `projectCalendarPanel` and `useGoogleCalendarSettings`. Everything else stays in those two files. The hook hides OAuth navigation, calendar-list timing, auto-sync freshness, busy serialization, and error mapping. SettingsPage does not grow coordination. The public interface is small because the projection ate the policy, per laziness-protocol and minimize-reader-load.

**Deliberately not done.** No `/settings/calendar` route. No calendar re-pick after `ready`. No ongoing direction control. No client-side Google API. No new Edge Function. No second `ConnectionView`. `loading` is panel-only and is never sent to the server.

## Synthesis decision

Candidate-2 only. The arena picker fills this section.

## Tradeoffs accepted

- We accept a projection type that mirrors `ConnectionView` in exchange for compile-time removal of illegal controls. A later agent that copies the nearest card cannot add a calendar picker to `ready` without fighting the type.
- We accept moving the card above Schedule preferences in exchange for findability without a new Settings section. A user who only wants week-start now scrolls past one card.
- We accept keeping the auto-sync switch, even though the product list does not name it, in exchange for exposing a command the backend already supports. Hiding it would invent a second, narrower ready view.
- We accept a panel-only `loading` variant in exchange for not forging a `disconnected` flash on first paint.
- We accept one hook as the sole writer, with a busy tag, in exchange for not giving the auto-sync effect its own client calls.

## Alternatives considered

- A new Settings nav item or `/settings/calendar` page. That would hide the connection behind a dedicated route and force SettingsPage to grow a section. OAuth still lands on `/settings/schedule`, so calendar pick would live on two pages or the landing page would have to redirect. The public interface gets larger and ownership splits. Rejected.
- Capability flags on a single panel object (`canSync`, `canBind`, `canDisconnect`). Callers must remember which flags go together. That is a parallel boolean machine next to `ConnectionView`. The interface looks smaller and hides less. Rejected per model-the-domain.
- A command reducer (`dispatch({ type: 'sync' })`) in front of the client. SettingsPage would stay small, but every legal-command rule would be a runtime guard. The card could still render a sync button on `connected` and fail on click. Rejected. Types should refuse the button.
- Leave the card last and add a "Google Calendar" jump chip at the top of Schedule. The chip is a second way to reach the same block, and the live status still sits below the fold after OAuth. Rejected per experience-first.
- Two sequential confirm dialogs for disconnect, as today. Shorter to code. The Google-keep policy never appears as a fact the user must read. Rejected.

## Open questions and risks

- Should the Schedule reset-preferences control also disconnect Google Calendar, or does reset stay limited to local preference fields?
- If `listCalendars` fails while the view is `connected`, do we stay on the pick card with a notice, or do we treat that as a connection `error`?
- Is Korean the only locale this card needs to ship, or does copy need to join an existing i18n table before implementation?

## Next implementation step

Add `projectCalendarPanel` and the `CalendarPanel` union, then replace `GoogleCalendarSection` with a card that only renders what the panel type allows, mounted first in the Schedule section.
