import assert from 'node:assert/strict'

import {
  commentRange,
  compactRange,
  endColumnOf,
  hasColumns,
  rangeWords,
  startColumnOf,
} from '../../src/core/range'

describe('comment range', () => {
  it('a caret names one whole line', () => {
    assert.deepEqual(commentRange(12, 4, 12, 4, 40), { startLine: 12, endLine: 12 })
  })

  it('a selection from the start of one line to the start of the next names whole lines', () => {
    assert.deepEqual(commentRange(5, 0, 6, 0, 30), { startLine: 5, endLine: 6 })
  })

  it('a selection of the text of one line names a whole line', () => {
    assert.deepEqual(commentRange(5, 0, 5, 30, 30), { startLine: 5, endLine: 5 })
  })

  it('a word at the start of a line names its characters', () => {
    assert.deepEqual(commentRange(1, 0, 1, 15, 40), {
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 15,
    })
  })

  it('a selection that leaves the indent outside names its characters', () => {
    assert.deepEqual(commentRange(5, 4, 5, 10, 10), {
      startLine: 5,
      startColumn: 4,
      endLine: 5,
      endColumn: 10,
    })
  })

  it('a selection over several lines names both characters', () => {
    assert.deepEqual(commentRange(5, 4, 7, 9, 30), {
      startLine: 5,
      startColumn: 4,
      endLine: 7,
      endColumn: 9,
    })
  })

  it('a selection that ends at the start of a later line keeps its first character', () => {
    assert.deepEqual(commentRange(5, 3, 7, 0, 30), {
      startLine: 5,
      startColumn: 3,
      endLine: 7,
      endColumn: 0,
    })
  })
})

describe('range text', () => {
  it('a range of whole lines has no column', () => {
    assert.equal(hasColumns(0, 0), false)
    assert.equal(hasColumns(undefined, undefined), false)
  })

  it('a range that starts at the first character still has a column', () => {
    assert.ok(hasColumns(0, 15))
  })

  it('the short form of whole lines holds the two line numbers', () => {
    assert.equal(compactRange({ startLine: 88, endLine: 94 }), '88-94')
  })

  it('the short form of a part of a line holds both characters', () => {
    assert.equal(
      compactRange({ startLine: 88, startColumn: 4, endLine: 94, endColumn: 9 }),
      '88:4-94:9',
    )
  })

  it('the words of whole lines name the lines alone', () => {
    assert.equal(rangeWords({ startLine: 88, endLine: 94 }), 'lines 88-94')
  })

  it('the words of a part of one line name the two characters', () => {
    assert.equal(
      rangeWords({ startLine: 88, startColumn: 4, endLine: 88, endColumn: 9 }),
      'lines 88-88, from character 4 to character 9',
    )
  })

  it('the words of a part over several lines name the line of each character', () => {
    assert.equal(
      rangeWords({ startLine: 88, startColumn: 4, endLine: 94, endColumn: 9 }),
      'lines 88-94, from character 4 of line 88 to character 9 of line 94',
    )
  })

  it('a range of whole lines answers no column', () => {
    assert.equal(startColumnOf({ startLine: 88, endLine: 94 }), undefined)
    assert.equal(endColumnOf({ startLine: 88, endLine: 94 }), undefined)
  })

  it('a range of a part of a line answers both columns', () => {
    assert.equal(startColumnOf({ startLine: 1, endLine: 1, endColumn: 15 }), 0)
    assert.equal(endColumnOf({ startLine: 1, endLine: 1, endColumn: 15 }), 15)
  })
})
