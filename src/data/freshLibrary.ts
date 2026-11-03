import type { LibraryData } from '../types/records.ts'
import { DEFAULT_SETTINGS } from '../types/records.ts'

/**
 * A new account starts empty. Pages draw their own examples while they have nothing to show,
 * so no sample schedules, diaries, memos, books or categories are ever written for the user.
 */
export function freshLibrary(): LibraryData {
  return {
    categories: [],
    items: [],
    captures: [],
    diaries: [],
    memos: [],
    books: [],
    logs: [],
    recordTypes: [],
    records: [],
    trash: [],
    settings: { ...DEFAULT_SETTINGS, nav: DEFAULT_SETTINGS.nav.map((item) => ({ ...item })), savedAccents: [], onboardingPages: [] },
    pageLayouts: {},
    pageGaps: {},
    customPages: [],
    pageTemplates: [],
  }
}
