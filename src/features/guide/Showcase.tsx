import { useState } from 'react'
import { BUILTIN_THEMES } from '@blanky/types'
import { themeVariables } from '../../theme/variables.ts'
import type { ChatCommand, InputExample } from './content.ts'
import { ComposerDemo, ResultDemo } from './Demo.tsx'
import { DemoWindow, type WindowView } from './DemoWindow.tsx'

const THEME_NAMES: Record<string, string> = { 'Blanky Default': '기본', 'Soft Pink': '소프트 핑크', 'Ocean Blue': '오션 블루', Dark: '다크' }
const themeName = (name: string) => THEME_NAMES[name] ?? name

const VIEWS: { id: WindowView; label: string }[] = [
  { id: 'schedule', label: '일정' },
  { id: 'movie', label: '영화 기록' },
  { id: 'study', label: '공부 관리' },
]

/** Pick a sentence, see what the composer turns it into. */
export function ExamplePicker({ id, examples, label = '입력 예시' }: { id: string; examples: InputExample[]; label?: string }) {
  const [index, setIndex] = useState(0)
  const example = examples[index]
  return (
    <div className="example-picker">
      <div role="group" aria-label={label} className="example-list">
        {examples.map((item, i) => (
          <button key={item.input} type="button" aria-pressed={index === i} aria-controls={id} onClick={() => setIndex(i)}>{item.input}</button>
        ))}
      </div>
      <div id={id} className="demo-panel" aria-live="polite">
        <div key={index} className="fade-swap">
          <p className="t-caption mb-2">입력</p>
          <ComposerDemo input={example.input} chip={example.chip} />
          <p className="t-caption mb-2 mt-6">저장 전 미리보기</p>
          <ResultDemo results={example.results} />
          {example.note ? <p className="t-caption mt-4 leading-relaxed">{example.note}</p> : null}
        </div>
      </div>
    </div>
  )
}

/** The official themes (and optionally a few page templates) applied to a picture of the app. */
export function ThemeTry({ templates = false }: { templates?: boolean }) {
  const [themeId, setThemeId] = useState(BUILTIN_THEMES[0].id)
  const [view, setView] = useState<WindowView>(templates ? 'movie' : 'schedule')
  const theme = BUILTIN_THEMES.find(item => item.id === themeId) ?? BUILTIN_THEMES[0]
  return (
    <div>
      <div className="option-bar">
        <div role="group" aria-label="테마">
          <span className="t-caption mr-2">테마</span>
          {BUILTIN_THEMES.map(item => (
            <button key={item.id} type="button" className="option" aria-pressed={item.id === themeId} onClick={() => setThemeId(item.id)}>
              <span className="option-swatch" style={{ background: item.config.colors.background, color: item.config.colors.primary }} aria-hidden="true" />
              {themeName(item.name)}
            </button>
          ))}
        </div>
        {templates ? (
          <div role="group" aria-label="템플릿">
            <span className="t-caption mr-2">템플릿</span>
            {VIEWS.map(item => <button key={item.id} type="button" className="option" aria-pressed={item.id === view} onClick={() => setView(item.id)}>{item.label}</button>)}
          </div>
        ) : null}
      </div>
      <figure className="mt-6" aria-label={`${themeName(theme.name)} 테마를 적용한 ${VIEWS.find(item => item.id === view)?.label} 화면`}>
        <DemoWindow view={view} className="blanky-themed" style={themeVariables(theme.config)} />
      </figure>
    </div>
  )
}

/** The theme tab of the store, built from the same swatch markup the store uses. */
export function ThemeShelf() {
  return (
    <ul className="theme-shelf" aria-label="스토어 테마 목록 예시">
      {BUILTIN_THEMES.map(theme => (
        <li key={theme.id}>
          <div className="theme-swatch" style={{ background: theme.config.colors.background }} aria-hidden="true">
            <div style={{ background: theme.config.sidebar.selectedBackground }} />
            <div><span style={{ background: theme.config.colors.primary }} /><span style={{ background: theme.config.schedule.background }} /><span style={{ background: theme.config.colors.surface }} /></div>
          </div>
          <p className="mt-2 text-sm font-medium">{themeName(theme.name)}</p>
          <p className="t-caption">무료 · 설치 후 적용</p>
        </li>
      ))}
    </ul>
  )
}

/** The repeat field of the analysis preview with Mon/Wed/Fri chosen. */
export function RepeatDemo() {
  return (
    <div className="demo-surface" aria-hidden="true">
      <p className="t-caption">반복</p>
      <p className="field mt-2 w-full text-sm">매주 · 요일 선택</p>
      <div className="mt-3 flex flex-wrap gap-1">{['월', '화', '수', '목', '금', '토', '일'].map((day, index) => <span key={day} className={[0, 2, 4].includes(index) ? 'chip chip-on' : 'chip'}>{day}</span>)}</div>
      <p className="t-caption mt-3">시작 날짜부터 반복합니다. 수정·삭제는 반복 일정 전체에 적용됩니다.</p>
    </div>
  )
}

/** Home chat requests, shown as the conversation they start. */
export function Conversation({ commands }: { commands: ChatCommand[] }) {
  return (
    <dl className="conversation">
      {commands.map(command => (
        <div key={command.input}>
          <dt><span className="guide-bubble">{command.input}</span></dt>
          <dd>{command.effect}</dd>
        </div>
      ))}
    </dl>
  )
}
