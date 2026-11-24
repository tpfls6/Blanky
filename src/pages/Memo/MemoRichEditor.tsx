import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, List, ListChecks, ListOrdered, Minus, Quote, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2, type LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { readMemoContent, writeMemoContent } from './memoContent.ts'

const STYLES = [{ level: 0, label: '본문' }, { level: 1, label: '제목 1' }, { level: 2, label: '제목 2' }, { level: 3, label: '제목 3' }] as const

/**
 * Rich memo body. Desktop shows the format toolbar above the text; `phone` puts it in one scrolling
 * icon row under the text (the editor column ends at the keyboard, so the row sits right above it),
 * with the paragraph styles behind an "Aa" button.
 */
export function MemoRichEditor({ initialBody, onChange, phone = false }: { initialBody: string; onChange: (body: string) => void; phone?: boolean }) {
  // These are initialization options. Replacing them on each keystroke makes
  // useEditor call setOptions/updateState while the browser is composing text.
  // A different memo mounts a new MemoEditor through its memo-id key.
  const [initialContent] = useState(() => readMemoContent(initialBody))
  const [extensions] = useState(() => [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
    TaskList,
    TaskItem.configure({ nested: true, a11y: { checkboxLabel: (node, checked) => `${node.textContent || '빈 항목'} ${checked ? '완료' : '미완료'}` } }),
  ])
  const [editorProps] = useState(() => ({ attributes: { class: 'memo-rich-content', role: 'textbox', 'aria-label': '메모 내용', 'aria-multiline': 'true' } }))
  const [stylesOpen, setStylesOpen] = useState(false)
  const stylesId = useId()
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: true,
    shouldRerenderOnTransaction: false,
    editorProps,
    onUpdate: ({ editor }) => onChange(writeMemoContent(editor.getJSON())),
  })
  useEditorState({ editor, selector: ({ editor }) => editor ? {
    heading: [1, 2, 3].find(level => editor.isActive('heading', { level })) ?? 0,
    marks: ['bold', 'italic', 'underline', 'strike', 'bulletList', 'orderedList', 'taskList', 'blockquote'].map(mark => editor.isActive(mark)),
  } : null })
  if (!editor) return null
  const actions: { label: string; text: string; icon: LucideIcon; active?: boolean; run: () => void; group?: boolean }[] = [
    { label: '굵게', text: 'B', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run(), group: true },
    { label: '기울임', text: 'I', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: '밑줄', text: 'U', icon: Underline, active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
    { label: '취소선', text: 'S̶', icon: Strikethrough, active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
    { label: '글머리 목록', text: '• 목록', icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run(), group: true },
    { label: '번호 목록', text: '1. 목록', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: '체크리스트', text: '☑ 할 일', icon: ListChecks, active: editor.isActive('taskList'), run: () => editor.chain().focus().toggleTaskList().run() },
    { label: '인용', text: '❝', icon: Quote, active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: '구분선', text: '―', icon: Minus, run: () => editor.chain().focus().setHorizontalRule().run() },
    { label: '서식 지우기', text: '서식 지우기', icon: RemoveFormatting, run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
    { label: '실행 취소', text: '↶', icon: Undo2, run: () => editor.chain().focus().undo().run(), group: true },
    { label: '다시 실행', text: '↷', icon: Redo2, run: () => editor.chain().focus().redo().run() },
  ]
  const heading = [1, 2, 3].find(level => editor.isActive('heading', { level })) ?? 0
  const setStyle = (level: number) => {
    if (level === 0) editor.chain().focus().setParagraph().run()
    else editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run()
  }
  const content = <EditorContent editor={editor} className="memo-rich-scroll" onClick={event => {
    if (event.target === event.currentTarget) editor.commands.focus('end')
  }} />
  if (phone) return <div className="memo-rich-editor memo-rich-phone" data-no-drag>
    {content}
    {stylesOpen ? <div id={stylesId} className="memo-pe-styles" role="group" aria-label="문단 스타일">
      {STYLES.map(style => <button type="button" key={style.level} aria-pressed={heading === style.level} onMouseDown={event => event.preventDefault()} onClick={() => setStyle(style.level)}>{style.label}</button>)}
    </div> : null}
    <div className="memo-pe-tools" role="toolbar" aria-label="본문 서식">
      <button type="button" aria-label="문단 스타일" title="문단 스타일" aria-expanded={stylesOpen} aria-controls={stylesOpen ? stylesId : undefined} onMouseDown={event => event.preventDefault()} onClick={() => setStylesOpen(open => !open)}>Aa</button>
      {actions.map(action => <span key={action.label} className="contents">
        {action.group ? <span className="memo-pe-sep" aria-hidden="true" /> : null}
        <button type="button" aria-label={action.label} title={action.label} aria-pressed={action.active} onMouseDown={event => event.preventDefault()} onClick={action.run}>
          <action.icon size={20} strokeWidth={1.7} aria-hidden="true" />
        </button>
      </span>)}
    </div>
  </div>
  return <div className="memo-rich-editor" data-no-drag>
    <div className="memo-format-toolbar" role="toolbar" aria-label="본문 서식">
      <select aria-label="문단 스타일" value={heading} onChange={event => setStyle(Number(event.target.value))}>{STYLES.map(style => <option key={style.level} value={style.level}>{style.label}</option>)}</select>
      {actions.map(action => <button type="button" key={action.label} aria-label={action.label} title={action.label} aria-pressed={action.active} onMouseDown={event => event.preventDefault()} onClick={action.run}>{action.text}</button>)}
    </div>
    {content}
  </div>
}
