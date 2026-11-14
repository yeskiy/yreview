import type MarkdownIt from 'markdown-it'

import { commentLink } from './commentLink'

type CoreRule = Parameters<MarkdownIt['core']['ruler']['push']>[1]
type CoreState = Parameters<CoreRule>[0]

export const MARK_CLASS = 'yreview-commented'
export const LINK_CLASS = 'yreview-add'
const BLOCKS: ReadonlySet<string> = new Set(['paragraph_open', 'heading_open'])

/** One commented range of source lines, one-based and inclusive. */
export interface LineSpan {
  readonly start: number
  readonly end: number
}

export interface PreviewSource {
  /** The URI scheme of this editor, for example vscode or cursor. */
  readonly scheme: () => string
  /** The open comment ranges of a file, or undefined while they load. */
  readonly commented: (file: string) => readonly LineSpan[] | undefined
  readonly failed: (error: unknown) => void
}

const fileOf = (env: unknown): string | undefined => {
  const document = (env as { currentDocument?: { scheme?: unknown; fsPath?: unknown } } | undefined)
    ?.currentDocument
  return document?.scheme === 'file' && typeof document.fsPath === 'string'
    ? document.fsPath
    : undefined
}

const addLinks = (state: CoreState, source: PreviewSource): void => {
  const file = fileOf(state.env)
  if (file === undefined) return
  const spans = source.commented(file) ?? []
  state.tokens.forEach((token, index) => {
    const inline = state.tokens[index + 1]
    if (!BLOCKS.has(token.type) || token.map === null || inline?.type !== 'inline') return
    const [first, after] = token.map
    if (spans.some((span) => span.start <= after && span.end > first)) {
      token.attrJoin('class', MARK_CLASS)
    }
    const open = new state.Token('link_open', 'a', 1)
    open.attrSet('href', commentLink(source.scheme(), file, first + 1))
    open.attrSet('class', LINK_CLASS)
    open.attrSet('title', `Add a review comment on line ${first + 1}`)
    inline.children = [
      open,
      Object.assign(new state.Token('text', '', 0), { content: '+' }),
      new state.Token('link_close', 'a', -1),
      ...(inline.children ?? []),
    ]
  })
}

/** The markdown-it plugin of the preview. A failure leaves the preview as markdown-it made it. */
export const previewPlugin =
  (source: PreviewSource) =>
  (md: MarkdownIt): MarkdownIt => {
    md.core.ruler.push('yreview_comment_links', (state) => {
      try {
        addLinks(state, source)
      } catch (error) {
        source.failed(error)
      }
    })
    return md
  }
