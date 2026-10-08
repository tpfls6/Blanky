export function moveById<T extends { id: string }>(items: readonly T[], fromId: string, toId: string): T[] {
  const from = items.findIndex((item) => item.id === fromId)
  const to = items.findIndex((item) => item.id === toId)
  if (from < 0 || to < 0 || from === to) return [...items]
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
