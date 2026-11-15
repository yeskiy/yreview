import assert from 'node:assert/strict'
import { carryOf, parseDiff, unquote } from '../../src/core/lineMap'

describe('line map', () => {
  it('gives undefined for a broken quoted name', () => {
    assert.equal(unquote('"a/x'), undefined)
    assert.equal(unquote('"a/\\q"'), undefined)
    assert.equal(unquote('"a/\\30"'), undefined)
  })

  it('drops one tab after a name without quotes', () =>
    assert.equal(unquote('a/my file\t'), 'a/my file'))

  it('gives no file for a block with no path', () =>
    assert.equal(parseDiff('diff --git x\n@@ -1 +1 @@\n-a\n+b\n').size, 0))

  it('keeps the order of a reversed range of an unchanged file', () =>
    assert.deepEqual(
      carryOf(
        {
          path: 'a',
          deleted: false,
          binary: false,
          hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: 1, removed: [] }],
        },
        { startLine: 7, endLine: 6 },
        ['n', '1', '2', '3', '4', '5', '6', '7'],
      ),
      { kind: 'same', range: { startLine: 8, endLine: 7 } },
    ))
})
