import assert from 'node:assert/strict'

import MarkdownIt from 'markdown-it'

import { MARK_CLASS, type LineSpan, previewPlugin } from '../../../src/preview/markdownPlugin'

const file = process.platform === 'win32' ? 'E:\\work\\demo\\notes.md' : '/work/demo/notes.md'
const fileEnv = { currentDocument: { scheme: 'file', fsPath: file } }
// Lines: 1 heading, 3 paragraph, 5 list item, 7 to 9 code fence.
const text = '# Title\n\nFirst paragraph.\n\n- item one\n\n```\ncode\n```\n'
const render = (
  spans: readonly LineSpan[] | undefined,
  options: { env?: unknown; failures?: unknown[]; broken?: boolean } = {},
): string =>
  previewPlugin({
    commented: () => {
      if (options.broken === true) throw new Error('the cache broke')
      return spans
    },
    failed: (error) => options.failures?.push(error),
  })(new MarkdownIt()).render(text, options.env ?? fileEnv)
const count = (html: string, word: string): number => html.split(word).length - 1

describe('the preview plugin', () => {
  it('adds no link and no address to the preview', () => {
    const html = render([{ start: 3, end: 3 }])
    assert.doesNotMatch(html, /<a |href=|:\/\//)
    assert.equal(html.replace(` class="${MARK_CLASS}"`, ''), new MarkdownIt().render(text))
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

  it('marks nothing without a file document', () => {
    assert.equal(count(render([{ start: 3, end: 3 }], { env: {} }), MARK_CLASS), 0)
    assert.equal(
      count(
        render([{ start: 3, end: 3 }], {
          env: { currentDocument: { scheme: 'untitled', fsPath: 'x' } },
        }),
        MARK_CLASS,
      ),
      0,
    )
  })

  it('reads the file at render time and keeps the parsed tokens, as the VS Code cache needs', () => {
    const md = previewPlugin({
      commented: () => [{ start: 3, end: 3 }],
      failed: (error) => assert.fail(String(error)),
    })(new MarkdownIt())
    const tokens = md.parse(text, {})
    const once = md.renderer.render(tokens, md.options, { ...fileEnv })
    assert.equal(count(once, MARK_CLASS), 1)
    assert.equal(md.renderer.render(tokens, md.options, { ...fileEnv }), once)
    assert.equal(md.renderer.render(tokens, md.options, {}), new MarkdownIt().render(text))
  })

  it('leaves the preview whole after a failure, and reports it', () => {
    const failures: unknown[] = []
    assert.equal(render([], { failures, broken: true }), new MarkdownIt().render(text))
    assert.equal(failures.length, 1)
  })
})
