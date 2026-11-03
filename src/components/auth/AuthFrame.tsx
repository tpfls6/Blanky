import { Link } from 'react-router-dom'
import { BrandLogo } from '../common/BrandLogo.tsx'
import { ROUTES } from '../../constants/routes.ts'
import type { ReactNode } from 'react'

export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-16">
      <div className="page-enter w-full max-w-sm">
        <Link to={ROUTES.welcome} aria-label="Blanky 소개"><BrandLogo className="text-neutral-900" /></Link>
        <h1 className="mt-10 text-2xl font-medium tracking-tight text-neutral-900">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  )
}
