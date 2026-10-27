import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState } from 'react'
import { readMemoContent, writeMemoContent } from './memoContent.ts'

export function MemoRichEditor({ initialBody, onChange }: { initialBody: string; onChange: (body: string) => void }) {
  // These are initialization options. Replacing them on each keystroke makes
  // useEditor call setOptions/updateState while the browser is composing text.
  // A different memo mounts a new MemoEditor through its memo-id key.
  const [initialContent] = useState(() => readMemoContent(initialBody))
  const [extensions] = useState(() => [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false })])
  const [editorProps] = useState(() => ({ attributes: { class: 'memo-rich-content', role: 'textbox', 'aria-label': '메모 내용', 'aria-multiline': 'true' } }))
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
    marks: ['bold', 'italic', 'underline', 'strike', 'bulletList', 'orderedList', 'blockquote'].map(mark => editor.isActive(mark)),
  } : null })
  if (!editor) return null
  const actions = [
    { label: '굵게', text: 'B', active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { label: '기울임', text: 'I', active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { label: '밑줄', text: 'U', active: editor.isActive('underline'), run: () => editor.chain().focus().toggleUnderline().run() },
    { label: '취소선', text: 'S̶', active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
    { label: '글머리 목록', text: '• 목록', active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: '번호 목록', text: '1. 목록', active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: '인용', text: '❝', active: editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: '구분선', text: '―', run: () => editor.chain().focus().setHorizontalRule().run() },
    { label: '서식 지우기', text: '서식 지우기', run: () => editor.chain().focus().unsetAllMarks().clearNodes().run() },
    { label: '실행 취소', text: '↶', run: () => editor.chain().focus().undo().run() },
    { label: '다시 실행', text: '↷', run: () => editor.chain().focus().redo().run() },
  ]
  const heading = [1, 2, 3].find(level => editor.isActive('heading', { level })) ?? 0
  return <div className="memo-rich-editor" data-no-drag>
    <div className="memo-format-toolbar" role="toolbar" aria-label="본문 서식">
      <select aria-label="문단 스타일" value={heading} onChange={event => {
        const level = Number(event.target.value)
        if (level === 0) editor.chain().focus().setParagraph().run()
        else editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 }).run()
      }}><option value="0">본문</option><option value="1">제목 1</option><option value="2">제목 2</option><option value="3">제목 3</option></select>
      {actions.map(action => <button type="button" key={action.label} aria-label={action.label} title={action.label} aria-pressed={action.active} onMouseDown={event => event.preventDefault()} onClick={action.run}>{action.text}</button>)}
    </div>
    <EditorContent editor={editor} className="memo-rich-scroll" onClick={event => {
      if (event.target === event.currentTarget) editor.commands.focus('end')
    }} />
  </div>
}
