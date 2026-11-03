export const ROUTES = {
  home: '/',
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
