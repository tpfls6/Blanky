import type { Category, CategoryNode } from '../../types/src/category.ts'

/** Flat category rows to a parent/child tree. The repository stays a list. */
export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>()
  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] })
  }

  const roots: CategoryNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortNodes = (list: CategoryNode[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko'))
    for (const node of list) sortNodes(node.children)
  }
  sortNodes(roots)
  return roots
}
