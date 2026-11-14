import assert from 'node:assert/strict'

import MarkdownIt from 'markdown-it'

import { parseCommentLink } from '../../../src/preview/commentLink'
import {
  LINK_CLASS,
  MARK_CLASS,
  type LineSpan,
  previewPlugin,
} from '../../../src/preview/markdownPlugin'

const file = process.platform === 'win32' ? 'E:\\work\\demo\\notes.md' : '/work/demo/notes.md'
const fileEnv = { currentDocument: { scheme: 'file', fsPath: file } }
// Lines: 1 heading, 3 paragraph, 5 list item, 7 to 9 code fence.
const text = '# Title\n\nFirst paragraph.\n\n- item one\n\n```\ncode\n```\n'
const render = (
  spans: readonly LineSpan[] | undefined,
  options: { env?: unknown; scheme?: string; failures?: unknown[]; broken?: boolean } = {},
): string =>
  previewPlugin({
    scheme: () => options.scheme ?? 'vscode',
    commented: () => {
      if (options.broken === true) throw new Error('the cache broke')
      return spans
    },
    failed: (error) => options.failures?.push(error),
  })(new MarkdownIt()).render(text, options.env ?? fileEnv)
const hrefs = (html: string): readonly string[] =>
  [...html.matchAll(/href="([^"]+)"/g)].map((match) => (match[1] ?? '').replaceAll('&amp;', '&'))
const count = (html: string, word: string): number => html.split(word).length - 1

describe('the preview plugin', () => {
  it('adds one link to each heading and paragraph, with the first line of the block', () =>
    assert.deepEqual(
      hrefs(render([])).map(
        (href) => parseCommentLink(new URL(href).pathname, new URL(href).search.slice(1))?.line,
      ),
      [1, 3, 5],
    ))

  it('names the file of the document in each link', () =>
    hrefs(render([])).forEach((href) =>
      assert.equal(
        parseCommentLink(new URL(href).pathname, new URL(href).search.slice(1))?.file,
        file,
      ),
    ))

  it('uses the scheme of the editor', () => {
    assert.ok(
      hrefs(render([])).every((href) => href.startsWith('vscode://yeskiy.yreview/comment?')),
    )
    assert.ok(
      hrefs(render([], { scheme: 'cursor' })).every((href) =>
        href.startsWith('cursor://yeskiy.yreview/comment?'),
      ),
    )
  })

  it('gives the link its class and a title', () => {
    const html = render([])
    assert.equal(count(html, `class="${LINK_CLASS}"`), 3)
    assert.match(html, /title="Add a review comment on line 3"/)
  })

  it('marks the block that a comment covers', () => {
    const html = render([{ start: 3, end: 3 }])
    assert.equal(count(html, MARK_CLASS), 1)
    assert.match(html, new RegExp(`<p class="${MARK_CLASS}">`))
  })

  it('marks each block of a long comment', () =>
    assert.equal(count(render([{ start: 1, end: 3 }]), MARK_CLASS), 2))

  it('marks nothing while the comments load', () =>
    assert.equal(count(render(undefined), MARK_CLASS), 0))

  it('adds nothing without a file document', () => {
    assert.equal(count(render([], { env: {} }), LINK_CLASS), 0)
    assert.equal(
      count(
        render([], { env: { currentDocument: { scheme: 'untitled', fsPath: 'x' } } }),
        LINK_CLASS,
      ),
      0,
    )
  })

  it('leaves the preview whole after a failure, and reports it', () => {
    const failures: unknown[] = []
    assert.equal(render([], { failures, broken: true }), new MarkdownIt().render(text))
    assert.equal(failures.length, 1)
  })
})
