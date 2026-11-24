export const ROUTES = {
  home: '/',
  /** Where the app opens: the schedule screen (home was folded into it). */
  start: '/schedule',
  /** The schedule screen with the quick-add composer (the former home input) open. */
  quickAdd: '/schedule?add=quick',
  more: '/more',
  /** Phone bottom bar, More shortcuts and hidden menus in one drag-and-drop screen. */
  menuLayout: '/more/menu',
  activity: '/activity',
  schedule: '/schedule',
  recurring: '/schedule/recurring',
  diary: '/diary',
  reading: '/reading',
  memo: '/memo',
  settings: '/settings',
  custom: '/custom',
  trash: '/trash',
  store: '/store',
  storeTemplates: '/store?tab=templates',
  themeEditor: '/customize/theme',
  myThemes: '/custom?tab=themes',
  themeDetail: (id: string) => '/store/themes/' + id,
  templateDetail: (id: string) => '/store/templates/' + id,
  templateLibrary: '/store/templates/library',
  templatePublish: '/store/templates/publish',
  creator: (id: string) => '/creator/' + id,
  record: (typeId: string) => `/records/${typeId}`,
  page: (id: string) => `/pages/${id}`,
  login: '/login',
  signup: '/signup',
  forgot: '/forgot',
  welcome: '/welcome',
  guide: '/guide',
} as const

export function isCustomWorkspace(pathname: string): boolean {
  return pathname === ROUTES.custom || pathname.startsWith('/pages/')
}
