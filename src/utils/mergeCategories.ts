import type { WorkspaceCategory } from '../types/work.ts'

// Legacy browser categories use names as IDs; server categories use UUIDs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function mergeCategories(local: WorkspaceCategory[], remote: WorkspaceCategory[]) {
  const aliases = new Map<string, string>()
  const visiting = new Set<string>()
  const resolve = (id: string): string => {
    if (aliases.has(id)) return aliases.get(id)!
    if (remote.some(category => category.id === id) || UUID.test(id)) return id
    const category = local.find(category => category.id === id)
    if (!category || visiting.has(id)) return id
    visiting.add(id)
    const parentId = category.parentId ? resolve(category.parentId) : null
    const matches = remote.filter(row => row.name === category.name && row.parentId === parentId)
    visiting.delete(id)
    if (matches.length === 1) aliases.set(id, matches[0]!.id)
    return aliases.get(id) ?? id
  }
  for (const category of local) resolve(category.id)
  const remap = <T extends { categoryId: string | null }>(row: T): T =>
    row.categoryId && aliases.has(row.categoryId) ? { ...row, categoryId: aliases.get(row.categoryId)! } : row
  const categories = [
    ...local.filter(row => !aliases.has(row.id) && !remote.some(category => category.id === row.id))
      .map(row => ({ ...row, parentId: row.parentId ? aliases.get(row.parentId) ?? row.parentId : null })),
    ...remote.map(row => ({ ...local.find(category => resolve(category.id) === row.id), ...row })),
  ]
  return { categories, remap }
}
