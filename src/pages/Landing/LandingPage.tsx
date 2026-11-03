import { Link } from 'react-router-dom'
import { ROUTES } from '../../constants/routes.ts'
import { INPUT_EXAMPLES } from '../../features/guide/content.ts'
import { DemoWindow } from '../../features/guide/DemoWindow.tsx'
import { loadBrandFont } from '../../features/guide/font.ts'
import { useReveal } from '../../features/guide/reveal.ts'
import { ExamplePicker, ThemeTry } from '../../features/guide/Showcase.tsx'
import { PublicHeader } from './PublicHeader.tsx'
import './landing.css'

loadBrandFont()

function SectionHead({ id, label, title, body }: { id: string; label: string; title: string; body: string }) {
  return (
    <div data-reveal>
      <p className="t-label">{label}</p>
      <h2 id={id} className="t-title mt-3">{title}</h2>
      <p className="t-lead mt-3">{body}</p>
    </div>
  )
}

function Records() {
  return (
    <div className="notebook mt-12" data-reveal>
      <article>
        <p className="t-caption">일기</p>
        <h3 className="t-heading mt-3">산책하며 생각 정리</h3>
        <p className="t-caption mt-1">오늘 · 오후 9:12</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">일찍 퇴근한 날. 공원을 한 바퀴 걷고 나니 머릿속이 조금 가벼워졌다.</p>
        <p className="t-caption mt-3">#일상 #산책</p>
      </article>
      <article>
        <p className="t-caption">독서</p>
        <div className="mt-3 flex gap-4">
          <span className="landing-cover">노르웨이의 숲</span>
          <div className="min-w-0">
            <h3 className="t-heading">노르웨이의 숲</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">무라카미 하루키</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-accent-text"><span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />읽는 중</p>
          </div>
        </div>
        <p className="landing-quote">산책하는 장면이 오래 남는다. 다음 장은 주말에.</p>
      </article>
      <article>
        <p className="t-caption">메모</p>
        <h3 className="t-heading mt-3">주간 회고 아이디어</h3>
        <ul className="mt-3 space-y-1 text-sm leading-relaxed text-[var(--muted)]">
          <li>잘한 일 하나, 아쉬운 일 하나</li>
          <li>다음 주에 꼭 할 일 세 가지</li>
        </ul>
        <p className="t-caption mt-3">#기획</p>
      </article>
    </div>
  )
}

export function LandingPage() {
  const root = useReveal<HTMLDivElement>()
  return (
    <div ref={root} className="guide-root page-enter min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <PublicHeader />
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-wrap">
            <h1 id="landing-title" className="t-display">적으면,<br />정리되는 하루.</h1>
            <p className="t-lead mt-5">일정과 할 일, 일기와 메모를 한 권의 노트처럼 쓰는 개인 플래너예요.</p>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Link to={ROUTES.signup} className="btn btn-primary btn-large">시작하기</Link>
              <Link to={ROUTES.login} className="btn btn-ghost btn-large">로그인</Link>
            </div>
          </div>
          <figure className="landing-wrap landing-hero-shot" data-reveal aria-label="Blanky 일정 화면: 오늘의 시간표와 할 일 목록">
            <DemoWindow />
          </figure>
        </section>

        <div className="landing-wrap">
          <section className="landing-section" aria-labelledby="landing-input">
            <SectionHead id="landing-input" label="자연어 일정" title="말하듯 적으면, 일정이 돼요." body="저장하기 전에 날짜와 시간을 한 번 더 확인할 수 있어요." />
            <div className="mt-10" data-reveal><ExamplePicker id="landing-demo" examples={INPUT_EXAMPLES.slice(0, 3)} /></div>
          </section>

          <section className="landing-section" aria-labelledby="landing-records">
            <SectionHead id="landing-records" label="기록" title="일기, 독서, 메모를 한곳에." body="하루의 생각과 읽은 책, 문득 떠오른 메모를 같은 노트에 남겨요." />
            <Records />
          </section>

          <section className="landing-section" aria-labelledby="landing-custom">
            <SectionHead id="landing-custom" label="커스텀" title="내 취향대로 꾸미는 공간." body="테마로 색을 바꾸고, 템플릿으로 필요한 페이지를 더해요. 스토어에서 다른 사람이 만든 테마와 템플릿도 설치할 수 있어요." />
            <div className="mt-10" data-reveal><ThemeTry templates /></div>
          </section>
        </div>

        <section className="landing-final" aria-labelledby="landing-start">
          <div className="landing-wrap" data-reveal>
            <h2 id="landing-start" className="t-title">오늘의 첫 줄을 적어 보세요.</h2>
            <p className="t-lead mt-3">가입하면 첫 화면에서 짧은 안내가 열려요. 처음이라면 사용 가이드를 먼저 봐도 좋아요.</p>
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Link to={ROUTES.signup} className="btn btn-primary btn-large">시작하기</Link>
              <Link to={ROUTES.guide} className="btn btn-line btn-large">사용 가이드</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="landing-wrap flex flex-wrap items-center justify-between gap-2 py-6 t-caption">
          <span>© Blanky</span>
          <Link to={ROUTES.guide} className="transition-colors duration-200 hover:text-[var(--fg)]">사용 가이드 · 자주 묻는 질문</Link>
        </div>
      </footer>
    </div>
  )
}
