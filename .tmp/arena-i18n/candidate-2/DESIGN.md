# App language with i18next

Blanky speaks Korean by default and English when the user picks it. Sidebar, settings chrome, and other shell copy go through namespaced catalogs. Dates follow the same locale. Personal titles, bodies, custom record names, category names, Google calendar summaries, and DB enums stay as stored.

This candidate commits to `i18next` plus `react-i18next`. Language still lives on `Settings.locale`, mirrored to `user_preferences.locale` and the settings JSON blob. No new table.

## Usage

Install `i18next` and `react-i18next`. Bundle both locale catalogs. Do not add HTTP backend or a language-detector plugin. Blanky already knows the locale.

Wrap the tree once, under `LibraryProvider`, so the binder can read `settings.locale` without remounting routes.

```tsx
// src/App.tsx
<SessionProvider>
  <LibraryProvider>
    <I18nBinder>
      <ThemeProvider>{/* existing providers and routes */}</ThemeProvider>
    </I18nBinder>
  </LibraryProvider>
</SessionProvider>
```

**Call site 1. Sidebar chrome.** Builtin rows translate. Record rows keep `record.name`.

```tsx
// src/components/layout/Sidebar.tsx
import { useTranslation } from 'react-i18next'

export function Sidebar() {
  const { t } = useTranslation('nav')
  const { settings, recordTypes } = useLibrary()
  const items = visibleNav(settings.nav, recordTypes)
  return (
    <aside className="theme-sidebar sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
      <BrandLogo className="px-2 text-neutral-900" />
      <nav className="mt-6 flex flex-1 flex-col gap-0.5" aria-label={t('menu')}>
        {items.map((item) => (
          <NavLink key={item.id} to={item.to} end={item.end} className="nav-link">
            {item.kind === 'chrome' ? t(item.id) : item.name}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
```

`MobileNav` uses the same `item.kind` split. Truncation stays `max-w-16`. Footer entries (`store`, `themes`, `custom`, `trash`, `settings`) are chrome ids, not hardcoded Korean.

**Call site 2. Settings → General → Language.** The control is a `field select`, matching duration selects. Option labels are native names (`한국어`, `English`) from `LOCALE_NATIVE_NAME`, not `t()`, so the control stays readable after a switch. Changing it updates settings only. The binder applies i18n. The page does not reload. Route and form state stay.

```tsx
// src/pages/Settings/GeneralSection.tsx
import { useTranslation } from 'react-i18next'
import { APP_LOCALES, LOCALE_NATIVE_NAME, parseAppLocale } from '../../i18n/index.ts'

export function GeneralSection() {
  const { t } = useTranslation('settings')
  const { settings, updateSettings } = useLibrary()
  return (
    <label className="block text-sm">
      {t('language.label')}
      <select
        className="field select mt-1 block w-40"
        value={settings.locale}
        onChange={(event) => updateSettings({ locale: parseAppLocale(event.currentTarget.value) })}
      >
        {APP_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_NATIVE_NAME[locale]}
          </option>
        ))}
      </select>
    </label>
  )
}
```

`SECTIONS` gains a `general` row. Default route stays `/settings/account`. Section titles and descriptions in the sidebar of Settings come from `settings:sections.*`.

**Call site 3. Dates.** Pages pass `settings.locale` into a pure formatter. They do not read `i18n.language`. Stored values stay ISO.

```tsx
// src/pages/Schedule/SchedulePage.tsx
const { settings } = useLibrary()
<h1 className="truncate text-base font-medium tracking-tight">
  {formatDate(selected, settings.locale, 'long')}
</h1>
```

`DiaryPage` replaces its `'ko-KR'` helper with the same `formatDate(..., 'long')`. `ActivityPage` groups with `formatDate(..., 'short')`. Google Calendar last-sync copy uses catalog interpolation plus `formatDateTime`.

A missing catalog key never prints `settings.language.label`. `fallbackLng` is `ko`. Both catalogs ship in the bundle. A DEV parity check fails the boot if `en` lacks a `ko` key.

## Type sketch

```ts
// src/i18n/locales.ts

export const APP_LOCALES = ['ko', 'en'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

/** BCP 47 tags for Intl. Derived from APP_LOCALES. Adding a locale without a tag fails the typecheck. */
export const BCP47 = { ko: 'ko-KR', en: 'en-US' } as const satisfies Record<AppLocale, string>
export const LOCALE_NATIVE_NAME = { ko: '한국어', en: 'English' } as const satisfies Record<AppLocale, string>

/**
 * Parse wire, JSON, or localStorage values.
 * Unknown, empty, and unsupported tags become 'ko'.
 * `en`, `en-US`, and `en-GB` become `en`.
 */
export function parseAppLocale(raw: unknown): AppLocale {
  throw new Error('not implemented')
}

/** First visit only. `navigator.language` matching `en*` → `en`. Everything else → `ko`. */
export function detectBrowserLocale(): AppLocale {
  throw new Error('not implemented')
}
```

```ts
// src/i18n/instance.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { APP_LOCALES } from './locales.ts'
import chromeKo from './catalogs/ko/chrome.json'
import navKo from './catalogs/ko/nav.json'
import settingsKo from './catalogs/ko/settings.json'
import chromeEn from './catalogs/en/chrome.json'
import navEn from './catalogs/en/nav.json'
import settingsEn from './catalogs/en/settings.json'

/**
 * Singleton. Resources are inlined. changeLanguage is sync for these catalogs.
 * Pages must not call changeLanguage. I18nBinder is the only writer.
 */
void i18n.use(initReactI18next).init({
  resources: {
    ko: { chrome: chromeKo, nav: navKo, settings: settingsKo },
    en: { chrome: chromeEn, nav: navEn, settings: settingsEn },
  },
  lng: 'ko',
  fallbackLng: 'ko',
  supportedLngs: [...APP_LOCALES],
  defaultNS: 'chrome',
  ns: ['chrome', 'nav', 'settings'],
  interpolation: { escapeValue: false },
  returnNull: false,
  returnEmptyString: false,
  parseMissingKeyHandler: () => '',
  load: 'currentOnly',
  react: { useSuspense: false },
})

export { i18n }

/** DEV only. Throws if en is missing a ko key, or if nav.json keys ≠ BuiltinNavId. */
export function assertCatalogParity(): void {
  throw new Error('not implemented')
}
```

```ts
// src/i18n/i18next.d.ts
import 'i18next'
import type chromeKo from './catalogs/ko/chrome.json'
import type navKo from './catalogs/ko/nav.json'
import type settingsKo from './catalogs/ko/settings.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'chrome'
    resources: {
      chrome: typeof chromeKo
      nav: typeof navKo
      settings: typeof settingsKo
    }
  }
}
```

```tsx
// src/i18n/I18nBinder.tsx
import { useLayoutEffect, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { useLibrary } from '../state/useLibrary.ts'
import { useSession } from '../state/useSession.ts'
import { i18n } from './instance.ts'
import { BCP47, detectBrowserLocale } from './locales.ts'

/**
 * Projects Settings.locale onto the i18n instance and <html lang>.
 * Logged-out chrome uses detectBrowserLocale, not DEFAULT_SETTINGS.
 * Do not put key={locale} on this provider. That would wipe form state.
 */
export function I18nBinder({ children }: { children: ReactNode }) {
  const { user } = useSession()
  const { settings } = useLibrary()
  const locale = user ? settings.locale : detectBrowserLocale()

  useLayoutEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale)
    document.documentElement.lang = BCP47[locale]
  }, [locale])

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
```

```ts
// src/i18n/formatDate.ts
import { BCP47, type AppLocale } from './locales.ts'

export type DateStyle = 'long' | 'monthDay' | 'monthYear' | 'short'

/**
 * Display only. `iso` is a calendar date (`YYYY-MM-DD`) in local time.
 * Does not read settings.timezone. Does not rewrite stored values.
 */
export function formatDate(iso: string, locale: AppLocale, style: DateStyle): string {
  throw new Error('not implemented')
}

/** Instants such as last-sync `updatedAt`. */
export function formatDateTime(iso: string, locale: AppLocale): string {
  throw new Error('not implemented')
}
```

```ts
// src/i18n/index.ts
export { APP_LOCALES, BCP47, LOCALE_NATIVE_NAME, detectBrowserLocale, parseAppLocale, type AppLocale } from './locales.ts'
export { formatDate, formatDateTime, type DateStyle } from './formatDate.ts'
export { I18nBinder } from './I18nBinder.tsx'
export { i18n } from './instance.ts'
```

Pages import `useTranslation` from `react-i18next`. They import `formatDate`, `AppLocale`, and `APP_LOCALES` from `src/i18n/index.ts`. They do not import catalogs or `changeLanguage`.

```ts
// src/types/records.ts  (delta)
export type Settings = {
  // existing fields unchanged
  locale: AppLocale
  /**
   * ISO instant of the last user locale choice.
   * Empty string means never chosen (legacy or default).
   * Compared as UTC ISO text. Empty loses to any real timestamp.
   */
  localeUpdatedAt: string
}

export const DEFAULT_SETTINGS: Settings = {
  // existing defaults
  locale: 'ko',
  localeUpdatedAt: '',
}
```

`UserPreference.locale` in `packages/types/src/preference.ts` stays `string`. That is the wire type. `parseAppLocale` is the only door into `AppLocale`.

```ts
// src/services/preferences/index.ts  (delta)

export function normalizePreferences(value: unknown): UserPreferences {
  // existing field parsing, plus:
  // locale: parseAppLocale(raw.locale)
  // localeUpdatedAt: typeof raw.localeUpdatedAt === 'string' ? raw.localeUpdatedAt : ''
  throw new Error('not implemented')
}

/** No local or remote prefs yet. Uses detectBrowserLocale and stamps localeUpdatedAt. */
export function bootstrapPreferences(recordIds?: string[]): UserPreferences {
  throw new Error('not implemented')
}

export function toStoredPreference(userId: string, settings: Settings): UserPreference {
  // locale: settings.locale  (stop hardcoding 'ko')
  // settings blob includes locale and localeUpdatedAt
  throw new Error('not implemented')
}

export function settingsFromPreference(preference: UserPreference): UserPreferences {
  // normalizePreferences({
  //   ...preference.settings,
  //   locale: (preference.settings as { locale?: unknown }).locale ?? preference.locale,
  //   ...other existing field copies
  // })
  throw new Error('not implemented')
}

/**
 * Login merge for locale only.
 * If local.localeUpdatedAt > remote.localeUpdatedAt, keep local locale fields.
 * Take every other field from remote, then syncNav.
 * Caller retries pushPreferences when local locale wins, so a failed earlier push heals.
 */
export function mergePulledSettings(local: Settings, remote: Settings): Settings {
  throw new Error('not implemented')
}

export async function pushPreferences(settings: Settings): Promise<boolean> {
  // existing swallow-on-error, but return false on failure / skip, true on save
  throw new Error('not implemented')
}

export async function pullPreferences(): Promise<UserPreferences | null> {
  throw new Error('not implemented')
}
```

```ts
// src/state/library.tsx  (delta)

const updateSettings = useCallback((patch: Partial<Settings>) => {
  setData((current) => {
    const next = { ...current.settings, ...patch }
    if (patch.locale !== undefined && patch.locale !== current.settings.locale) {
      next.localeUpdatedAt = new Date().toISOString()
    }
    return { ...current, settings: next }
  })
}, [])

const resetPreferences = useCallback(() => {
  setData((current) => {
    const next = defaultPreferences(current.recordTypes.map((item) => item.id))
    next.locale = current.settings.locale
    next.localeUpdatedAt = current.settings.localeUpdatedAt
    return { ...current, settings: next }
  })
}, [])

// pull effect, after remote arrives:
// settings: mergePulledSettings(settingsRef.current, remote)
// if local locale won, void pushPreferences(merged)
```

```ts
// src/constants/navigation.ts  (delta)

export const NAV_CHROME_IDS = [
  'home',
  'activity',
  'schedule',
  'diary',
  'reading',
  'memo',
  'custom',
  'settings',
  'trash',
  'store',
  'themes',
] as const
export type BuiltinNavId = (typeof NAV_CHROME_IDS)[number]

export type NavItem =
  | {
      id: BuiltinNavId
      kind: 'chrome'
      to: string
      icon: LucideIcon
      end?: boolean
    }
  | {
      id: string
      kind: 'record'
      name: string
      to: string
      icon: LucideIcon
      color?: string
    }

export function visibleNav(
  nav: readonly NavPref[],
  recordTypes: readonly CustomRecordType[],
): NavItem[] {
  throw new Error('not implemented')
}

export function navCaption(
  id: string,
  recordTypes: readonly CustomRecordType[],
): { kind: 'chrome'; id: BuiltinNavId } | { kind: 'record'; name: string } {
  throw new Error('not implemented')
}
```

`NavSection` renders `caption.kind === 'chrome' ? t(caption.id) : caption.name`. Custom names never pass through `t`.

```ts
// src/utils/date.ts  (delta)
// Delete koreanLongDate, longDate, monthDay, monthTitle once callers use formatDate.
// Keep parseISODate, todayISO, shiftISO, daySpan. Those are calendars, not copy.
```

Catalog shape (not a full copy). `nav` keys equal `BuiltinNavId` plus `menu` and `records`. Native language names live in `LOCALE_NATIVE_NAME`, not in catalogs.

```json
{
  "menu": "주요 메뉴",
  "records": "Records",
  "home": "홈",
  "schedule": "일정",
  "store": "스토어",
  "themes": "내 테마",
  "trash": "휴지통",
  "settings": "설정"
}
```

`chrome` holds buttons, empty states, toasts, auth status, confirm copy. `settings` holds section chrome and Google Calendar sentences with `{{imported}}` interpolation. Brand word `Blanky` does not appear as a translatable value.

## Module map

```
src/i18n/
  index.ts                 public exports listed above
  locales.ts               AppLocale union, parse, detect, BCP47
  instance.ts              i18n.init, assertCatalogParity
  I18nBinder.tsx           settings.locale → changeLanguage + html lang
  formatDate.ts            Intl wrappers
  i18next.d.ts             typed t() from ko JSON
  catalogs/ko/{chrome,nav,settings}.json
  catalogs/en/{chrome,nav,settings}.json

src/types/records.ts       Settings.locale + localeUpdatedAt
src/services/preferences/  parse at this boundary, mergePulledSettings, write column
src/state/library.tsx      stamp localeUpdatedAt, merge on pull, preserve locale on reset
src/constants/navigation.ts  NavItem kind split, NAV_CHROME_IDS
src/pages/Settings/        GeneralSection, SECTIONS += general
src/App.tsx                I18nBinder under LibraryProvider
src/utils/date.ts          calendar helpers only, after caller migration
package.json               i18next, react-i18next
```

Call chain for a language change, three files.

1. `GeneralSection` calls `updateSettings({ locale })`.
2. `library.tsx` stamps `localeUpdatedAt`, writes localStorage, calls `pushPreferences`.
3. `I18nBinder` sees `settings.locale` and calls `i18n.changeLanguage`. Subscribers re-render.

Call chain for login pull, two files.

1. `library.tsx` loads local settings, then `pullPreferences`.
2. `mergePulledSettings` in preferences keeps a newer local locale, then a retry push heals remote.

## Problem

The shell mixes English and Korean labels. There is no translation layer. `user_preferences.locale` already exists as `text not null default 'ko'`, and `UserPreference.locale` is `string`, but `toStoredPreference` writes `'ko'` every time and `settingsFromPreference` drops the column. Web settings live in `Settings` with no locale field. Login pull overwrites the whole settings object after local load, and `pushPreferences` swallows errors, so a later remount can restore stale remote locale. Dates hardcode `'ko-KR'` or `'en-US'` by file. Custom record names and user bodies must not enter the translator. The public import list has to stay small, `AppLocale` has to be a closed union, and unknown stored tags have to be parsed at the preference boundary.

## Shape

`AppLocale` is `'ko' | 'en'`. Catalogs are data. i18next owns lookup, interpolation, fallback, and subscriber re-render. `Settings.locale` owns the choice. The i18n instance is a projection of that choice, not a second source.

Validation sits at two boundaries. `parseAppLocale` handles storage, DB, and browser language. `normalizePreferences` is the only function that turns unknown JSON into `Settings`. Inside the app, `locale` is `AppLocale`. `UserPreference.locale` stays `string` and is not re-exported to pages.

`localeUpdatedAt` encodes the failed-push rule. Empty string means unset. A user choice writes `toISOString()`. Merge compares the two strings and keeps the newer locale fields without touching theme, nav, or timezone. That is field-level merge at the read boundary, not a lock.

`NavItem` is a union so a record name cannot be fed to `t` without a type error. Builtin ids are the nav catalog keys. One list, `NAV_CHROME_IDS`, plus a DEV check against `nav.json`.

Dates use `Intl` through `formatDate`. Timezone settings stay independent. `koreanLongDate` and the English helpers go away in the same change as their callers.

What callers import is small on purpose. Pages get `useTranslation`, `updateSettings({ locale })`, and `formatDate`. Complexity that stays behind those three is catalog loading, fallback, typed keys, locale parsing, column mirroring, and the pull clock. Pages do not see `changeLanguage`, JSON modules, or `UserPreference`.

Suspense for i18n stays off. Catalogs are bundled, so a language switch does not wait on a fetch and does not remount the tree.

## Synthesis decision

pending arena pick

## Tradeoffs accepted

- We accept two new npm packages in exchange for namespaced catalogs, typed keys, interpolation, and instant subscriber updates without a home-grown lookup.
- We accept a persistence field `localeUpdatedAt` on `Settings` in exchange for field-level locale merge without a new table or a second localStorage key.
- We accept a one-time `resolveJsonModule` or JSON import of catalogs in exchange for files translators can edit without touching TypeScript.
- We accept that logged-out chrome follows the browser, then jumps to `settings.locale` after login. Existing users are Korean even on an English browser.
- We accept an empty string from `parseMissingKeyHandler` if both catalogs lack a key. The DEV parity check is the real guard. Production should not hit this.
- We accept leaving `packages/parse` unchanged. Korean and English date phrases already match. A parser rewrite waits for a measured miss.

## Alternatives considered

- Tiny custom locale module (`t()` plus JSON, no new packages, owned only by Settings). It hides less. Every caller still needs a lookup, a fallback policy, interpolation, and a React subscription, and those would grow into a second i18next. Rejected for this candidate.
- `react-intl` / FormatJS. Richer ICU, larger stack, and it still needs the same preference clock. Rejected because i18next matches namespaced JSON and `useTranslation` with less wiring.
- A dedicated `LocaleProvider` that stores language beside Settings. Split ownership. Two writers, two persistence paths. Rejected. Language is a user preference and stays on Settings.
- Keying the tree on `locale` to force a remount. It would drop form state and violate instant apply. Rejected.

## Open questions and risks

- How far should the first implementation translate beyond sidebar, Settings chrome, auth status, and dates? This sketch's catalogs cover all shell copy, but a page-by-page sweep can still land after the binder works.
- Do mobile clients already read `user_preferences.locale` as a free string? If they write tags other than `ko` and `en`, `parseAppLocale` will fold them to `ko` until those tags join `APP_LOCALES`.
- Bundle size of i18next plus react-i18next is unmeasured here. If the added weight is too large for the shell, synthesis should prefer the custom module.

## Next implementation step

Add `src/i18n/` with locales, bundled catalogs, the binder, and `Settings.locale` plumbing through `normalizePreferences` / `toStoredPreference` / `mergePulledSettings`, then switch Sidebar and General to `useTranslation` before touching other pages.
