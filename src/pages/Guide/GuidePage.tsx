import { useEffect, useState, type ReactNode } from 'react'
import { PAGE_TOURS, replayHref, type PageTourId } from '../../features/onboarding/tourState.ts'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { ROUTES } from '../../constants/routes.ts'
import { useSession } from '../../state/useSession.ts'
import { CLEANUP_COMMANDS, EDIT_COMMANDS, FAQ, GUIDE_SECTIONS, INPUT_EXAMPLES, INPUT_STEPS, PACKAGE_FILES, RECORD_EXAMPLES, RECORD_GUIDES, RECURRING_STEPS, STORE_STEPS, THEME_STEPS, WRITING_TIPS } from '../../features/guide/content.ts'
import { StepList } from '../../features/guide/Demo.tsx'
import { loadBrandFont } from '../../features/guide/font.ts'
import { useReveal } from '../../features/guide/reveal.ts'
import { Conversation, ExamplePicker, RepeatDemo, ThemeShelf, ThemeTry } from '../../features/guide/Showcase.tsx'
import { PublicHeader } from '../Landing/PublicHeader.tsx'

const TOUR_NAMES: Record<PageTourId, string> = { home: '홈', diary: '일기', reading: '독서', memo: '메모', store: '스토어', custom: '커스텀', settings: '설정' }

loadBrandFont()

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Highlights the section being read; a hash jump wins until the reader scrolls on. */
function useCurrentSection(hash: string) {
  const fromHash = (value: string) => GUIDE_SECTIONS.find(section => section.id === decodeURIComponent(value.slice(1)))?.id
  const [current, setCurrent] = useState<string>(() => fromHash(hash) ?? GUIDE_SECTIONS[0].id)
  const [seenHash, setSeenHash] = useState(hash)
  if (hash !== seenHash) {
    setSeenHash(hash)
    const id = fromHash(hash)
    if (id) setCurrent(id)
  }
  useEffect(() => {
    let frame = 0
    // The section whose top has passed a third of the screen; the last one once it is fully in view.
    const update = () => {
      frame = 0
      const sections = GUIDE_SECTIONS.map(section => document.getElementById(section.id)).filter(element => element !== null)
      const last = sections.at(-1)
      if (!last) return
      const line = window.innerHeight / 3
      const reading = last.getBoundingClientRect().bottom <= window.innerHeight + 4 ? last : sections.filter(element => element.getBoundingClientRect().top <= line).at(-1)
      if (reading) setCurrent(reading.id)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    // Capture catches whichever element scrolls: the window for guests, the app's main pane when signed in.
    document.addEventListener('scroll', schedule, { capture: true, passive: true })
    return () => { document.removeEventListener('scroll', schedule, { capture: true }); cancelAnimationFrame(frame) }
  }, [])
  return current
}

function OpenLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="text-link mt-4 inline-flex items-center gap-1 text-sm">{children}<ArrowUpRight aria-hidden="true" size={14} /></Link>
}

export function GuidePage() {
  const { user } = useSession()
  const { hash } = useLocation()
  const current = useCurrentSection(hash)
  const root = useReveal<HTMLDivElement>()

  useEffect(() => {
    const id = decodeURIComponent(hash.slice(1))
    if (!id) return
    const target = document.getElementById(id)
    if (!target) return
    target.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }, [hash])

  const toc = (className: string) => GUIDE_SECTIONS.map(section => <a key={section.id} href={`#${section.id}`} className={className} aria-current={current === section.id ? 'true' : undefined}>{section.title}</a>)

  const body = (
    <div ref={root} className="guide-root page-enter mx-auto flex w-full max-w-5xl items-start gap-10 px-4 py-10 text-[var(--fg)] sm:px-6 md:px-10 md:py-16 lg:gap-14">
      <nav aria-label="가이드 목차" className="guide-toc sticky top-20 hidden w-48 shrink-0 lg:block">
        <p className="t-caption px-3 pb-3">목차</p>
        {toc('')}
      </nav>
      <div className="min-w-0 flex-1">
        <header>
          <p className="t-label">사용 가이드</p>
          <h1 className="t-title mt-3">Blanky, 이렇게 써요.</h1>
          <p className="t-lead mt-3">기능별로 실제 화면과 순서를 정리했어요. 예시 문장은 그대로 입력해도 같은 방식으로 분석돼요.</p>
          {user ? <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"><span className="text-neutral-400">화면별 안내 다시 보기</span>{PAGE_TOURS.map(page => <Link key={page} className="text-link" to={replayHref(page)}>{TOUR_NAMES[page]}</Link>)}</p> : null}
          <nav aria-label="가이드 목차" className="guide-chips mt-8">{toc('')}</nav>
        </header>

        <div className="mt-12">
          <Section id="input" title="자연어로 일정 · 할 일 입력" lead="평소 말하듯 적으면 저장하기 전에 분석 미리보기가 열려요.">
            <div data-reveal><StepList steps={INPUT_STEPS} /></div>
            <div data-reveal><ExamplePicker id="guide-input-demo" examples={INPUT_EXAMPLES} /></div>
            <div data-reveal>
              <h3 className="t-heading">작성 팁</h3>
              <ul className="guide-list mt-4 text-sm leading-relaxed text-[var(--muted)]">{WRITING_TIPS.map(tip => <li key={tip}>{tip}</li>)}</ul>
            </div>
          </Section>

          <Section id="recurring" title="반복 일정 · 여러 요일" lead="“매주”를 넣어 적고, 미리보기에서 요일을 골라요.">
            <div data-reveal><StepList steps={RECURRING_STEPS} /></div>
            <figure className="demo-panel" data-reveal>
              <RepeatDemo />
              <figcaption className="t-caption mt-3">월·수·금을 함께 선택한 모습</figcaption>
            </figure>
          </Section>

          <Section id="edit" title="수정 · 삭제 · 중복 정리" lead="일정 화면에서 항목을 눌러 직접 고치거나, 홈 입력창에 이렇게 요청해요.">
            <figure className="demo-panel" data-reveal aria-label="홈 대화 예시"><Conversation commands={EDIT_COMMANDS} /></figure>
            <div data-reveal>
              <h3 className="t-heading">중복 · 겹침 정리</h3>
              <p className="t-body mt-2 text-[var(--muted)]">정리 요청은 바로 지우지 않고 지울 목록을 먼저 보여 줘요. “실행”을 눌렀을 때만 반영되고, “취소”하면 아무것도 바뀌지 않아요.</p>
            </div>
            <figure className="demo-panel" data-reveal aria-label="정리 요청 예시"><Conversation commands={CLEANUP_COMMANDS} /></figure>
            <p className="t-caption" data-reveal>같은 제목이 여러 개면 날짜와 제목을 함께 적어 달라고 안내해요. 여러 항목을 한 문장으로 동시에 바꾸는 요청은 아직 지원하지 않아요.</p>
          </Section>

          <Section id="records" title="일기 · 독서 · 메모" lead="하루의 기록은 홈에서 바로, 자세한 정리는 각 화면에서 해요.">
            <div data-reveal><ExamplePicker id="guide-record-demo" examples={RECORD_EXAMPLES} label="기록 예시" /></div>
            <div className="notebook" data-reveal>
              {RECORD_GUIDES.map(guide => (
                <section key={guide.id} aria-labelledby={`record-${guide.id}`}>
                  <h3 id={`record-${guide.id}`} className="t-heading">{guide.title}</h3>
                  <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-[var(--muted)]">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
                  {user ? <OpenLink to={guide.to}>{guide.title} 열기</OpenLink> : null}
                </section>
              ))}
            </div>
          </Section>

          <Section id="store" title="스토어 설치 · 적용" lead="다른 사람이 만든 테마와 템플릿을 미리 보고 설치해요.">
            <div data-reveal><StepList steps={STORE_STEPS} />{user ? <OpenLink to={ROUTES.store}>스토어 열기</OpenLink> : null}</div>
            <figure className="demo-panel" data-reveal><ThemeShelf /></figure>
          </Section>

          <Section id="theme" title="테마 커스텀" lead="색상과 이미지, 아이콘, 폰트로 나만의 테마를 만들어요. 아래에서 기본 테마를 바꿔 보세요.">
            <div data-reveal><StepList steps={THEME_STEPS} />{user ? <OpenLink to={ROUTES.myThemes}>내 테마 열기</OpenLink> : null}</div>
            <div data-reveal><ThemeTry /></div>
          </Section>

          <Section id="files" title=".blanky · .blankytpl 파일" lead="테마와 템플릿은 파일로 주고받을 수 있어요.">
            <dl className="border-b border-line" data-reveal>
              {PACKAGE_FILES.map(file => (
                <div key={file.ext} className="grid gap-2 border-t border-line py-5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt><code className="rounded bg-[var(--hover)] px-1.5 py-0.5 text-sm">{file.ext}</code></dt>
                  <dd className="text-sm leading-relaxed">
                    <p>{file.what}</p>
                    <p className="mt-2 text-[var(--muted)]"><span className="font-medium text-[var(--fg)]">가져오기</span> · {file.import}</p>
                    <p className="mt-1 text-[var(--muted)]"><span className="font-medium text-[var(--fg)]">공유</span> · {file.export}</p>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="t-caption" data-reveal>가져오기 전 파일을 검사하고 미리보기를 보여 줘요. 형식이 맞지 않거나 손상된 파일은 설치하지 않아요.</p>
          </Section>

          <Section id="faq" title="자주 묻는 질문">
            <div className="guide-faq" data-reveal>{FAQ.map(item => <details key={item.q}><summary>{item.q}</summary><p className="pb-4 text-sm leading-relaxed text-[var(--muted)]">{item.a}</p></details>)}</div>
          </Section>
        </div>
      </div>
    </div>
  )

  if (user) return body
  return (
    <div className="guide-root min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <PublicHeader />
      <main>{body}</main>
    </div>
  )
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} className="guide-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1} className="t-title outline-none">{title}</h2>
      {lead ? <p className="t-lead mt-3">{lead}</p> : null}
      <div className="guide-flow">{children}</div>
    </section>
  )
}
