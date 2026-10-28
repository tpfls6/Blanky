export const DATA_VIEWS = ['table', 'card', 'gallery', 'calendar', 'kanban', 'chart'] as const
export const BLANKY_SOURCES = ['schedule', 'todo', 'diary', 'memo', 'reading', 'activity'] as const

export type DataView = (typeof DATA_VIEWS)[number]
export type BlankySource = (typeof BLANKY_SOURCES)[number]
