# Synthesis

Base. Dedicated Settings section at `/settings/google-calendar`. `ConnectionView` stays the only UI state. A small pure copy helper owns labels. First-import direction is the only direction control. Disconnect never deletes Google events.

Rejected. Leave the panel at the bottom of Schedule. Users already miss it. Rejected an ongoing sync-direction picker. The backend has none.

OAuth return path must match the new section. `google-calendar-oauth` currently hardcodes `/settings/schedule`.

## Usage

Settings nav shows Google Calendar. The page renders one `GoogleCalendarSection`. After Google consent the browser lands on the same page and calls `status()`.

```tsx
<GoogleCalendarSection />
```

Schedule keeps local timeline prefs only. A one-line link can point at `/settings/google-calendar`. It is navigation, not a second manager.

## Shape

`calendarPanel.ts` maps `ConnectionView` plus an optional extra message into copy the section renders. Illegal combinations stay in the union. `canConnect` is true for `disconnected`, `awaiting_consent`, and `needs_reauth`. Calendar pick exists only for `connected`. Ready shows account, calendar, last sync counts, auto-sync, manual sync, disconnect.

## Next implementation step

Add `GOOGLE_CALENDAR_SETTINGS_PATH`, the copy helper and its tests, then rewrite the section and move the Settings mount.
