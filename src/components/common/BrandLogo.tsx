export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-sm font-medium tracking-tight ${className}`}>
      <svg viewBox="0 0 100 120" className="h-7 w-6 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M0 0H100V75H90V10H10V111H57C67 111 70 102 81 102H100V111H81C72 111 69 120 57 120H0Z" />
      </svg>
      <span>Blanky</span>
    </span>
  )
}
