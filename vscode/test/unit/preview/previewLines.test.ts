import assert from 'node:assert/strict'

import {
  END_KEY,
  MAX_LINE,
  START_KEY,
  fitted,
  lineOf,
  leavesOf,
  lineInBlock,
  rangeOfContext,
  selectionSpan,
  type TextBlock,
} from '../../../src/preview/previewLines'

// The source lines of the fitted test: 0 # Title / 2-3 a paragraph / 5-7 a list / 9-11 a fence
const source = ['# Title', '', 'one', 'two', '', '- a', '- b', '  - c', '', '```', 'x', '```']

describe('the preview lines', () => {
  it('reads a data-line value and refuses every other text', () => {
    assert.equal(lineOf('0'), 0)
    assert.equal(lineOf('42'), 42)
    ;['', ' 1', '01', '-1', '1.5', '1e3', 'x', String(MAX_LINE + 1), null, undefined].forEach(
      (value) => assert.equal(lineOf(value), undefined, String(value)),
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

describe('the lines of a selection', () => {
  // 0 # Title / 2-4 a paragraph of three lines / 6-7 list: 6 item, 7 item / 9-12 fence with text on 10-11
  const blocks: TextBlock<string>[] = [
    { node: 'h1', start: 0, end: 0, text: 0 },
    { node: 'p', start: 2, end: 4, text: 2 },
    { node: 'ul', start: 6, end: 7, text: 6 },
    { node: 'li6', start: 6, end: 6, text: 6 },
    { node: 'li7', start: 7, end: 7, text: 7 },
    { node: 'code', start: 9, end: 12, text: 10 },
  ]
  const parents: Record<string, string> = { li6: 'ul', li7: 'ul' }
  const contains = (outer: string, inner: string): boolean => parents[inner] === outer
  const span = (hits: readonly string[], edges: Record<string, string | undefined> = {}) =>
    selectionSpan(
      blocks,
      (node) => hits.includes(node),
      contains,
      (node, edge) => edges[`${node}:${edge}`],
    )

  it('gives the line of a point from the newlines before it', () => {
    assert.equal(lineInBlock({ start: 2, end: 4, text: 2 }, ''), 2)
    assert.equal(lineInBlock({ start: 2, end: 4, text: 2 }, 'one\ntw'), 3)
    assert.equal(lineInBlock({ start: 9, end: 12, text: 10 }, 'a\n'), 11)
  })

  it('keeps the line inside the block', () => {
    assert.equal(lineInBlock({ start: 2, end: 4, text: 2 }, 'a\nb\nc\nd\n'), 4)
    assert.equal(lineInBlock({ start: 9, end: 12, text: 10 }, ''), 10)
  })

  it('keeps only the innermost blocks', () =>
    assert.deepEqual(
      leavesOf(
        blocks.filter((block) => ['ul', 'li6'].includes(block.node)),
        contains,
      ).map((block) => block.node),
      ['li6'],
    ))

  it('gives one line for a selection inside one line of a paragraph', () =>
    assert.deepEqual(span(['p'], { 'p:start': 'one\nt', 'p:end': 'one\ntwo' }), {
      start: 3,
      end: 3,
    }))

  it('gives the whole blocks when the points are outside them', () =>
    assert.deepEqual(span(['p', 'ul', 'li6', 'li7']), { start: 2, end: 7 }))

  it('gives the code lines of a selection in a fence', () =>
    assert.deepEqual(span(['code'], { 'code:start': 'a\n', 'code:end': 'a\nb' }), {
      start: 11,
      end: 11,
    }))

  it('gives nothing for no hit', () => assert.equal(span([]), undefined))
})
