export function EmptyState({ children }: { children: string }) {
  return <p data-theme-slot="empty-state" className="py-8 text-sm text-neutral-400">{children}</p>
}
