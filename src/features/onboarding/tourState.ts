import { ROUTES } from '../../constants/routes.ts'

export const PAGE_TOURS = ['home', 'diary', 'reading', 'memo', 'store', 'custom', 'settings'] as const
export type PageTourId = (typeof PAGE_TOURS)[number]

export const TOUR_PARAM = 'tour'

/** Where each page's guide opens again; `?tour=1` on that page replays it. */
export const TOUR_ROUTES: Record<PageTourId, string> = {
  home: ROUTES.home,
  diary: ROUTES.diary,
  reading: ROUTES.reading,
  memo: ROUTES.memo,
  store: ROUTES.store,
  custom: ROUTES.custom,
  settings: '/settings/general',
}

export function replayHref(page: PageTourId): string {
  return `${TOUR_ROUTES[page]}?${TOUR_PARAM}=1`
}

type TourSettings = { onboardingDone: boolean; onboardingPages: string[] }

/** The home guide predates per-page tracking, so the old flag still counts for it. */
export function isTourDone(settings: TourSettings, page: PageTourId): boolean {
  return settings.onboardingPages.includes(page) || (page === 'home' && settings.onboardingDone)
}

/** The settings patch that records a finished (or skipped) guide; null when nothing changes. */
export function finishTour(settings: TourSettings, page: PageTourId): Partial<TourSettings> | null {
  const pages = settings.onboardingPages.includes(page) ? settings.onboardingPages : [...settings.onboardingPages, page]
  const homeFlag = page === 'home' && !settings.onboardingDone
  if (pages === settings.onboardingPages && !homeFlag) return null
  return homeFlag ? { onboardingPages: pages, onboardingDone: true } : { onboardingPages: pages }
}

/** Device copy of the finished guides: survives an unreachable server and catches the account up later. */
export function deviceTourKey(base: string, page: PageTourId): string {
  return page === 'home' ? base : `${base}.${page}`
}
