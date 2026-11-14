import { isKotlinBlank, kotlinTrim } from '../core/kotlinText'
import { type ReviewBatch, type ReviewComment, isControl } from './schema'

/** The mark at the start of every line of a comment text, so a body line never starts a block. */
export const QUOTE = '> '
const SHORT_LENGTH = 7
const LINE_BREAK = new RegExp(`\r\n|[\r${String.fromCharCode(0x2028, 0x2029)}]`, 'g')
const META_KEY = /^[A-Za-z0-9_]+$/
const isC1 = (code: number): boolean => code >= 0x80 && code <= 0x9f

const revisionLabel = (comment: ReviewComment, head: string): string =>
  comment.revision === 'HEAD' || comment.revision === head
    ? 'HEAD'
    : comment.revision.slice(0, SHORT_LENGTH)

// The same rule stands in RangeText.kt of the plugin and in src/core/range.ts. Keep the copies equal.
const range = (comment: ReviewComment): string =>
  (comment.startColumn ?? 0) !== 0 || (comment.endColumn ?? 0) !== 0
    ? `${comment.startLine}:${comment.startColumn ?? 0}-${comment.endLine}:${comment.endColumn ?? 0}`
    : `${comment.startLine}-${comment.endLine}`

const body = (text: string): string => {
  const clean = kotlinTrim(
    Array.from(text.replace(LINE_BREAK, '\n'))
      .filter(
        (char) =>
          char === '\n' ||
          char === '\t' ||
          !(isControl(char.charCodeAt(0)) || isC1(char.charCodeAt(0))),
      )
      .join(''),
  )
  return clean === ''
    ? ''
    : clean
        .split('\n')
        .map((part) => (isKotlinBlank(part) ? QUOTE.trimEnd() : `${QUOTE}${part}`))
        .join('\n')
}

const format = (comment: ReviewComment, head: string): string => {
  const quoted = body(comment.text)
  return (
    `[${comment.id}] ${comment.path}:${range(comment)} @${revisionLabel(comment, head)}` +
    `${comment.side === 'left' ? ' (left side of the diff)' : ''}${quoted === '' ? '' : `\n${quoted}`}`
  )
}

export const batchContent = (batch: ReviewBatch): string =>
  batch.comments.map((comment) => format(comment, batch.commit)).join('\n\n')

/** Claude Code writes each entry as a tag attribute, so a quote mark or a control character goes. */
export const sanitizeMeta = (meta: Readonly<Record<string, unknown>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(meta)
      .filter(([key, value]) => META_KEY.test(key) && typeof value === 'string')
      .map(([key, value]) => [
        key,
        Array.from(value as string)
          .filter((char) => char !== '"' && !isControl(char.charCodeAt(0)))
          .join(''),
      ])
      .filter(([, value]) => value !== ''),
  )

export const batchMeta = (batch: ReviewBatch): Record<string, string> =>
  sanitizeMeta({
    branch: batch.branch,
    commit: batch.commit,
    count: String(batch.comments.length),
    batch_id: batch.batchId,
  })
