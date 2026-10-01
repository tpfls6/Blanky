import type { ReactNode } from 'react'

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium tracking-tight text-neutral-900">Blanky</p>
        <h1 className="mt-10 text-2xl font-medium tracking-tight text-neutral-900">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
