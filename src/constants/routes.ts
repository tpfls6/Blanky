export const ROUTES = {
  home: '/',
  schedule: '/schedule',
  diary: '/diary',
  reading: '/reading',
  memo: '/memo',
  settings: '/settings',
  custom: '/custom',
  record: (typeId: string) => `/records/${typeId}`,
  login: '/login',
  signup: '/signup',
  forgot: '/forgot',
} as const
