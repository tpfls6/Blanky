import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { ENTRY_OPTIONS, type EntryType } from '../../types/records.ts'
import { useLibrary } from '../../state/useLibrary.ts'

const HOME_TYPES: { id: EntryType; label: string }[] = [
  { id: 'auto', label: '자동 분류' },
  ...ENTRY_OPTIONS.map((option) => ({
    id: option.id,
    label: option.id === 'reading' ? '독서' : option.label,
  })),
]

export function HomePage() {
  const { settings, saveCapture } = useLibrary()
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<EntryType | ''>('auto')
  const [notice, setNotice] = useState('')
  const type: EntryType | '' =
    !settings.autoClassify && picked === 'auto' ? '' : settings.autoClassify && picked === '' ? 'auto' : picked
  const types = settings.autoClassify ? HOME_TYPES : HOME_TYPES.filter((option) => option.id !== 'auto')

  useEffect(() => {
    if (notice !== '저장되었습니다.') return
    const timer = window.setTimeout(() => setNotice(''), 2500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const save = () => {
    if (type === '') {
      setNotice('유형을 선택해 주세요.')
      return
    }
    const error = saveCapture(text, type)
    if (error) {
      setNotice(error)
      return
    }
    setText('')
    setNotice('저장되었습니다.')
  }

  const grow = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <div className="composer">
          <label htmlFor="home-entry" className="sr-only">
            자유 입력
          </label>
          <textarea
            id="home-entry"
            value={text}
            rows={3}
            placeholder="작성하고 싶은 내용을 자유롭게 입력하세요."
            onChange={(event) => {
              setText(event.target.value)
              grow(event.target)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setText('')
                setNotice('')
                event.currentTarget.style.height = 'auto'
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                save()
              }
            }}
            className="min-h-24 w-full resize-none bg-transparent text-base leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-300"
          />
          <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="입력 유형">
              {types.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={type === option.id}
                  onClick={() => setPicked(option.id)}
                  className={type === option.id ? 'chip chip-on' : 'chip'}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!text.trim()}
              className="icon-btn-primary"
              data-tip="저장"
              aria-label="저장"
            >
              <ArrowUp className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs text-neutral-300">Enter 저장 · Shift + Enter 줄바꿈 · Esc 지우기</p>
        <p className="mt-2 min-h-5 text-sm text-neutral-500" role="status">
          {notice}
        </p>
      </div>
    </div>
  )
}
