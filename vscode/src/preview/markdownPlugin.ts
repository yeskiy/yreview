import type MarkdownIt from 'markdown-it'

type RenderRule = NonNullable<MarkdownIt['renderer']['rules'][string]>
type Token = Parameters<RenderRule>[0][number]

export const MARK_CLASS = 'yreview-commented'
const BLOCKS = ['paragraph_open', 'heading_open']
export const LINE_END = 'data-line-end'
export const LINE_TEXT = 'data-line-text'

/** The last line from `first` to `after - 1` that is not blank, or `first`. */
const lastText = (blank: readonly boolean[], first: number, after: number): number =>
  Array.from({ length: Math.max(after - 1 - first, 0) }, (_, back) => after - 1 - back).find(
    (line) => blank[line] !== true,
  ) ?? first

/** Adds the last source line and the first text line, 0-based, to each block. VS Code caches these tokens. */
const lineEnds = (state: { readonly src: string; readonly tokens: Token[] }): void => {
  const blank = state.src.split('\n').map((line) => line.trim() === '')
  state.tokens
    .filter((token) => token.map != null && token.type !== 'inline')
    .forEach((token) => {
      const [first, after] = token.map ?? [0, 0]
      token.attrSet(LINE_END, String(lastText(blank, first, after)))
      token.attrSet(LINE_TEXT, String(token.type === 'fence' ? first + 1 : first))
    })
}

/** One commented range of source lines, one-based and inclusive. */
export interface LineSpan {
  readonly start: number
  readonly end: number
}

export interface PreviewSource {
  /** The open comment ranges of a file, or undefined while they load. */
  readonly commented: (file: string) => readonly LineSpan[] | undefined
  readonly failed: (error: unknown) => void
}

interface View {
  readonly file: string
  readonly spans: readonly LineSpan[]
}

const fileOf = (env: unknown): string | undefined => {
  const document = (env as { currentDocument?: { scheme?: unknown; fsPath?: unknown } } | undefined)
    ?.currentDocument
  return document?.scheme === 'file' && typeof document.fsPath === 'string'
    ? document.fsPath
    : undefined
}

/** The mark of one block. The tokens stay as they are, because VS Code caches them. */
const blockRule =
  (md: MarkdownIt, source: PreviewSource, views: WeakMap<object, View>, previous?: RenderRule) =>
  (...[tokens, index, options, env, self]: Parameters<RenderRule>): string => {
    const plain = (list: Token[]): string =>
      previous === undefined
        ? self.renderToken(list, index, options)
        : previous(list, index, options, env, self)
    const view = typeof env === 'object' && env !== null ? views.get(env as object) : undefined
    const token = tokens[index]
    if (view === undefined || token?.map == null || tokens[index + 1]?.type !== 'inline') {
      return plain(tokens)
    }
    try {
      const { Token: Made } = md.core.State.prototype
      const [first, after] = token.map
      const marked = view.spans.some((span) => span.start <= after && span.end > first)
        ? Object.assign(new Made(token.type, token.tag, token.nesting), token, {
            attrs: token.attrs?.map(([name, value]): [string, string] => [name, value]) ?? null,
          })
        : undefined
      marked?.attrJoin('class', MARK_CLASS)
      return plain(
        marked === undefined ? tokens : tokens.map((item, at) => (at === index ? marked : item)),
      )
    } catch (error) {
      source.failed(error)
      return plain(tokens)
    }
  }

const viewOf = (env: unknown, source: PreviewSource): View | undefined => {
  try {
    const file = fileOf(env)
    return file === undefined ? undefined : { file, spans: source.commented(file) ?? [] }
  } catch (error) {
    source.failed(error)
    return undefined
  }
}

/** The markdown-it plugin of the preview. It works at render time, because the parse has no file. */
export const previewPlugin =
  (source: PreviewSource) =>
  (md: MarkdownIt): MarkdownIt => {
    const views = new WeakMap<object, View>()
    const render = md.renderer.render.bind(md.renderer)
    Object.assign(
      md.renderer.rules,
      Object.fromEntries(
        BLOCKS.map((type) => [type, blockRule(md, source, views, md.renderer.rules[type])]),
      ),
    )
    Object.assign(md.renderer, {
      render: (...[tokens, options, env]: Parameters<typeof render>): string => {
        const view = viewOf(env, source)
        if (view !== undefined && typeof env === 'object' && env !== null) views.set(env, view)
        return render(tokens, options, env)
      },
    })
    md.core.ruler.push('yreview_line_end', lineEnds)
    return md
  }
