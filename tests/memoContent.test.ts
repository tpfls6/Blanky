import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoPlainText, readMemoContent, writeMemoContent } from '../src/pages/Memo/memoContent.ts'

test('legacy text preserves newlines and literal markup', () => {
  const body = '첫 줄\n<script>literal</script>\n\n마지막'
  assert.equal(memoPlainText(body), body)
  assert.equal(readMemoContent(body).content?.[1].content?.[0].text, '<script>literal</script>')
})

test('rich content retains headings, marks, lists and rules across saves', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '제목' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목', marks: [{ type: 'strike' }] }] }] }] },
    { type: 'horizontalRule' },
  ] }
  const saved = writeMemoContent(doc)
  assert.deepEqual(readMemoContent(saved), doc)
  assert.match(memoPlainText(saved), /제목\n항목/)
  assert.ok(!memoPlainText(saved).includes('bulletList'))
})

test('invalid serialized content remains readable', () => {
  const body = 'blanky-rich-memo:v1:{broken'
  assert.equal(memoPlainText(body), body)
})
