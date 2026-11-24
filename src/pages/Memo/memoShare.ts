import { memoPlainText } from './memoContent.ts'

/**
 * Shares memos as plain text through the system share sheet, falling back to the clipboard.
 * Closing the share sheet is 'cancelled', not a failure.
 */
export async function shareMemos(memos: readonly { title: string; body: string }[]): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = memos.map(memo => [memo.title, memoPlainText(memo.body)].filter(Boolean).join('\n')).join('\n\n')
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: memos.length === 1 ? memos[0].title : undefined, text })
      return 'shared'
    } catch (error) {
      // Anything but closing the sheet falls back to the clipboard.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
