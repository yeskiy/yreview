import { MAX_LINE } from '../preview/previewLines'

/** Zero-based source lines, both ends inclusive. */
export interface Lines {
  readonly start: number
  readonly end: number
}

/** One open comment, at its lines in the working tree. */
export interface PreviewMark {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly outdated: boolean
  readonly author: string
  readonly time: string
  readonly text: string
  readonly shared: boolean
}

export type ToWebview =
  | { readonly type: 'content'; readonly html: string }
  | { readonly type: 'marks'; readonly marks: readonly PreviewMark[] }
  | { readonly type: 'scroll'; readonly line: number }
  | { readonly type: 'openBox'; readonly lines?: Lines; readonly shared: boolean }
  | { readonly type: 'saved' }
  | { readonly type: 'failed'; readonly message: string }

export type FromWebview =
  | { readonly type: 'ready' }
  | {
      readonly type: 'save'
      readonly lines: Lines
      readonly text: string
      readonly shared: boolean
    }
  | { readonly type: 'resolve' | 'delete' | 'reveal'; readonly id: string }
  | { readonly type: 'openLink'; readonly href: string }
  | { readonly type: 'showSource'; readonly line: number }
  | { readonly type: 'noLines' }

/** The webview state that a restore after a reload reads. */
export interface PageState {
  readonly uri: string
}

export const MAX_TEXT = 65_536
const MAX_HREF = 4096
const ID = /^[0-9a-f]{40}$/

const fieldsOf = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const isLine = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= MAX_LINE

const linesOf = (value: unknown): Lines | undefined => {
  const { start, end } = fieldsOf(value)
  return isLine(start) && isLine(end) && start <= end ? { start, end } : undefined
}

/** The message of the page, or undefined. The page is untrusted, so only known fields pass. */
export const fromWebview = (value: unknown): FromWebview | undefined => {
  const message = fieldsOf(value)
  const { type, id, text, href, line, shared } = message
  if (type === 'ready' || type === 'noLines') return { type }
  if ((type === 'resolve' || type === 'delete' || type === 'reveal') && typeof id === 'string')
    return ID.test(id) ? { type, id } : undefined
  if (type === 'openLink' && typeof href === 'string')
    return href.length <= MAX_HREF ? { type, href } : undefined
  if (type === 'showSource') return isLine(line) ? { type, line } : undefined
  const lines = linesOf(message.lines)
  return type === 'save' &&
    lines !== undefined &&
    typeof text === 'string' &&
    text.length <= MAX_TEXT &&
    typeof shared === 'boolean'
    ? { type, lines, text, shared }
    : undefined
}

/** The restore state of a panel, or undefined for anything but a file URI. */
export const stateOf = (value: unknown): PageState | undefined => {
  const { uri } = fieldsOf(value)
  return typeof uri === 'string' && uri.startsWith('file:') ? { uri } : undefined
}
