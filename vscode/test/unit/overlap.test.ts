import assert from 'node:assert/strict'

import { MAX_DEPTH, segments, type Span } from '../../src/core/overlap'

const span = (sl: number, sc: number, el: number, ec: number): Span => ({
  start: { line: sl, character: sc },
  end: { line: el, character: ec },
})

describe('overlap segments', () => {
  it('gives no segment for no spans', () => {
    assert.deepEqual(segments([]), [])
  })

  it('gives one segment of depth 1 for one span', () => {
    assert.deepEqual(segments([span(1, 2, 3, 4)]), [{ ...span(1, 2, 3, 4), count: 1, depth: 1 }])
  })

  it('splits two overlapping spans into depths 1, 2 and 1', () => {
    assert.deepEqual(segments([span(0, 0, 0, 10), span(0, 5, 0, 20)]), [
      { ...span(0, 0, 0, 5), count: 1, depth: 1 },
      { ...span(0, 5, 0, 10), count: 2, depth: 2 },
      { ...span(0, 10, 0, 20), count: 1, depth: 1 },
    ])
  })

  it('compares the line before the character', () => {
    assert.deepEqual(segments([span(1, 8, 3, 0), span(2, 1, 2, 4)]), [
      { ...span(1, 8, 2, 1), count: 1, depth: 1 },
      { ...span(2, 1, 2, 4), count: 2, depth: 2 },
      { ...span(2, 4, 3, 0), count: 1, depth: 1 },
    ])
  })

  it('keeps the count but caps the depth', () => {
    const same = Array.from({ length: 5 }, () => span(4, 0, 4, 3))
    assert.deepEqual(segments(same), [{ ...span(4, 0, 4, 3), count: 5, depth: MAX_DEPTH }])
    assert.equal(MAX_DEPTH, 3)
  })

  it('leaves a gap between spans that do not touch', () => {
    assert.deepEqual(segments([span(0, 0, 0, 2), span(0, 4, 0, 6)]), [
      { ...span(0, 0, 0, 2), count: 1, depth: 1 },
      { ...span(0, 4, 0, 6), count: 1, depth: 1 },
    ])
  })

  it('joins touching spans of the same count', () => {
    assert.deepEqual(segments([span(0, 0, 0, 2), span(0, 2, 0, 6)]), [
      { ...span(0, 0, 0, 6), count: 1, depth: 1 },
    ])
  })

  it('ignores empty spans', () => {
    assert.deepEqual(segments([span(3, 1, 3, 1)]), [])
  })
})
