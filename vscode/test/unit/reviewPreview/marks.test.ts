import assert from 'node:assert/strict'

import { marksOf } from '../../../src/reviewPreview/marks'
import type { Placed } from '../../../src/tasks/placedComments'

const stored = (id: string, ref: string) => ({
  id,
  ref,
  commit: 'c'.repeat(40),
  record: { timestamp: '2026-11-15T10:00:00Z', author: 'Ann', description: 'Fix <b>this</b>' },
})

describe('the marks of the review preview', () => {
  it('gives 0-based lines, the outdated flag and the shared flag', () =>
    assert.deepEqual(
      marksOf([
        {
          stored: stored('a', 'refs/notes/y-review/local'),
          carry: { kind: 'same', range: { startLine: 3, endLine: 5 } },
        },
        {
          stored: stored('b', 'refs/notes/devtools/discuss'),
          carry: { kind: 'outdated', range: { startLine: 7, endLine: 7 }, original: ['x'] },
        },
      ] as unknown as Placed[]),
      [
        {
          id: 'a',
          start: 2,
          end: 4,
          outdated: false,
          author: 'Ann',
          time: '2026-11-15T10:00:00Z',
          text: 'Fix <b>this</b>',
          shared: false,
        },
        {
          id: 'b',
          start: 6,
          end: 6,
          outdated: true,
          author: 'Ann',
          time: '2026-11-15T10:00:00Z',
          text: 'Fix <b>this</b>',
          shared: true,
        },
      ],
    ))

  it('leaves out gone, missing and unplaced comments', () =>
    assert.deepEqual(
      marksOf([
        { stored: stored('a', 'refs/notes/y-review/local'), carry: { kind: 'gone' } },
        { stored: stored('b', 'refs/notes/y-review/local'), carry: { kind: 'missing' } },
        { stored: stored('c', 'refs/notes/y-review/local'), carry: { kind: 'same' } },
      ] as unknown as Placed[]),
      [],
    ))
})
