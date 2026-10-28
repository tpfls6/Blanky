import type { AppLocale } from './locale.ts'
import enAuth from './locales/en/auth.json' with { type: 'json' }
import enCalendar from './locales/en/calendar.json' with { type: 'json' }
import enCommon from './locales/en/common.json' with { type: 'json' }
import enDiary from './locales/en/diary.json' with { type: 'json' }
import enHome from './locales/en/home.json' with { type: 'json' }
import enNavigation from './locales/en/navigation.json' with { type: 'json' }
import enPages from './locales/en/pages.json' with { type: 'json' }
import enSchedule from './locales/en/schedule.json' with { type: 'json' }
import enSettings from './locales/en/settings.json' with { type: 'json' }
import koAuth from './locales/ko/auth.json' with { type: 'json' }
import koCalendar from './locales/ko/calendar.json' with { type: 'json' }
import koCommon from './locales/ko/common.json' with { type: 'json' }
import koDiary from './locales/ko/diary.json' with { type: 'json' }
import koHome from './locales/ko/home.json' with { type: 'json' }
import koNavigation from './locales/ko/navigation.json' with { type: 'json' }
import koPages from './locales/ko/pages.json' with { type: 'json' }
import koSchedule from './locales/ko/schedule.json' with { type: 'json' }
import koSettings from './locales/ko/settings.json' with { type: 'json' }

export type Catalog = Record<string, unknown>

export const catalogs: Record<AppLocale, Catalog> = {
  ko: {
    ...koCommon,
    nav: koNavigation,
    settings: koSettings,
    home: koHome,
    schedule: koSchedule,
    diary: koDiary,
    calendar: koCalendar,
    auth: koAuth,
    ...koPages,
  },
  en: {
    ...enCommon,
    nav: enNavigation,
    settings: enSettings,
    home: enHome,
    schedule: enSchedule,
    diary: enDiary,
    calendar: enCalendar,
    auth: enAuth,
    ...enPages,
  },
}
