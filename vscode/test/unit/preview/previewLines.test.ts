import assert from 'node:assert/strict'

import {
  type Block,
  END_KEY,
  MAX_LINE,
  START_KEY,
  fitted,
  lineOf,
  rangeOfContext,
  spanOf,
} from '../../../src/preview/previewLines'

// A model of the rendered preview of the source below. Each name holds its parent names.
// 0 # Title / 2-3 a paragraph / 5 list: 5 item, 6 item with 7 nested item / 9-11 fence / 12 end
const source = ['# Title', '', 'one', 'two', '', '- a', '- b', '  - c', '', '```', 'x', '```']
const tree: Record<string, readonly string[]> = {
  h1: [],
  p: [],
  ul: [],
  li5: ['ul'],
  p5: ['ul', 'li5'],
  li6: ['ul'],
  p6: ['ul', 'li6'],
  ul7: ['ul', 'li6'],
  li7: ['ul', 'li6', 'ul7'],
  p7: ['ul', 'li6', 'ul7', 'li7'],
  pre: [],
  end: [],
}
const lines: Record<string, number> = {
  h1: 0,
  p: 2,
  ul: 5,
  li5: 5,
  p5: 5,
  li6: 6,
  p6: 6,
  ul7: 7,
  li7: 7,
  p7: 7,
  pre: 9,
  end: source.length,
}
const blocks: readonly Block<string>[] = Object.keys(tree).map((node) => ({
  node,
  line: lines[node] ?? -1,
}))
const contains = (outer: string, inner: string): boolean => tree[inner]?.includes(outer) ?? false
/** The span of a selection that touches the text of `names`, and so each ancestor of them. */
const select = (...names: string[]) =>
  spanOf(blocks, (node) => names.some((name) => name === node || contains(node, name)), contains)

describe('the preview lines', () => {
  it('reads a data-line value and refuses every other text', () => {
    assert.equal(lineOf('0'), 0)
    assert.equal(lineOf('42'), 42)
    ;['', ' 1', '01', '-1', '1.5', '1e3', 'x', String(MAX_LINE + 1), null, undefined].forEach(
      (value) => assert.equal(lineOf(value), undefined, String(value)),
    )
  })

  it('gives a paragraph its lines up to the line before the next block', () =>
    assert.deepEqual(select('p'), { start: 2, end: 4 }))

  it('spans every block from the first to the last selected one', () =>
    assert.deepEqual(select('h1', 'p'), { start: 0, end: 4 }))

  it('uses the inner list item, not the list that holds it', () => {
    assert.deepEqual(select('p6'), { start: 6, end: 6 })
    assert.deepEqual(select('p7'), { start: 7, end: 8 })
    assert.deepEqual(select('p5', 'p7'), { start: 5, end: 8 })
  })

  it('ends the last block before the end marker of the preview', () =>
    assert.deepEqual(select('pre'), { start: 9, end: 11 }))

  it('gives no lines when nothing is hit', () => {
    assert.equal(select(), undefined)
    assert.equal(
      spanOf([], () => true, contains),
      undefined,
    )
  })

  it('reads only whole line numbers from the context of the menu', () => {
    assert.deepEqual(rangeOfContext({ [START_KEY]: 2, [END_KEY]: 4, webview: 'x' }), {
      start: 2,
      end: 4,
    })
    ;[
      undefined,
      null,
      'text',
      {},
      { [START_KEY]: 2 },
      { [START_KEY]: '2', [END_KEY]: 4 },
      { [START_KEY]: 4, [END_KEY]: 2 },
      { [START_KEY]: -1, [END_KEY]: 2 },
      { [START_KEY]: 1.5, [END_KEY]: 2 },
      { [START_KEY]: 0, [END_KEY]: MAX_LINE + 1 },
      { [START_KEY]: 0, [END_KEY]: Number.NaN },
    ].forEach((context) => assert.equal(rangeOfContext(context), undefined, String(context)))
  })

  it('fits the range to the document and drops the blank lines at its end', () => {
    const blank = (line: number): boolean => (source[line] ?? '').trim() === ''
    assert.deepEqual(fitted({ start: 2, end: 4 }, source.length, blank), { start: 2, end: 3 })
    assert.deepEqual(fitted({ start: 7, end: 8 }, source.length, blank), { start: 7, end: 7 })
    assert.deepEqual(fitted({ start: 9, end: 99 }, source.length, blank), { start: 9, end: 11 })
    assert.deepEqual(fitted({ start: 1, end: 1 }, source.length, blank), { start: 1, end: 1 })
    assert.equal(
      fitted({ start: source.length, end: source.length }, source.length, blank),
      undefined,
    )
  })
})
