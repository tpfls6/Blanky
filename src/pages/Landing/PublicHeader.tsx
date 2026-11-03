import { Link } from 'react-router-dom'
import { BrandLogo } from '../../components/common/BrandLogo.tsx'
import { ROUTES } from '../../constants/routes.ts'

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[var(--bg)]/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 md:px-10">
        <Link to={ROUTES.welcome} aria-label="Blanky 소개"><BrandLogo className="text-neutral-900" /></Link>
        <nav aria-label="시작하기" className="flex items-center gap-1 sm:gap-2">
          <Link to={ROUTES.guide} className="btn btn-ghost hidden sm:inline-flex">사용 가이드</Link>
          <Link to={ROUTES.login} className="btn btn-ghost">로그인</Link>
          <Link to={ROUTES.signup} className="btn btn-primary">시작하기</Link>
        </nav>
      </div>
    </header>
  )
}
