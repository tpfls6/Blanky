import type { JSONContent } from '@tiptap/core'

const prefix = 'blanky-rich-memo:v1:'

export function readMemoContent(body: string): JSONContent {
  if (body.startsWith(prefix)) {
    try {
      const doc = JSON.parse(body.slice(prefix.length)) as JSONContent
      if (doc.type === 'doc' && Array.isArray(doc.content)) return doc
    } catch { /* Preserve unrecognized content as plain text. */ }
  }
  return { type: 'doc', content: body.split('\n').map(text => ({ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) })) }
}

export function writeMemoContent(doc: JSONContent): string {
  return prefix + JSON.stringify(doc)
}

export function memoPlainText(body: string): string {
  const text = (node: JSONContent): string => node.text ?? (node.content ?? []).map(text).join(['doc', 'bulletList', 'orderedList'].includes(node.type ?? '') ? '\n' : '')
  return text(readMemoContent(body))
}
