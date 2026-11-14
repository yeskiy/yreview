import assert from 'node:assert/strict'

import { WORKTREE } from '../../../src/core/anchor'
import { type RecordRange, type ReviewRecord, recordId } from '../../../src/core/record'
import type { StoredComment } from '../../../src/store/commentBook'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import {
  COMMENT_WORDS,
  commentTask,
  commentWord,
  pickRecords,
} from '../../../src/tasks/commentTask'
import { revisionOf } from '../../../src/tasks/reviewTask'

const stored = (id: string, ref: string = DISCUSS): StoredComment => ({
  id,
  ref,
  commit: 'c0ffee',
  record: {
    timestamp: '1787194427',
    author: 'a@b.c',
    location: { commit: 'c0ffee', path: 'a.kt' },
  },
})

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

const storedWith = (range: RecordRange, text = 'fix this'): StoredComment => {
  const record: ReviewRecord = {
    timestamp: '1787194427',
    author: 'a@b.c',
    description: text,
    location: { commit: COMMIT, path: 'src/main/kotlin/Parser.kt', range },
  }
  return { id: recordId(record), ref: LOCAL, commit: COMMIT, record }
}

describe('comment pick', () => {
  it('a closed switch keeps the open records alone', () => {
    const kept = pickRecords([stored('one')], [stored('two')], false)
    assert.deepEqual(
      kept.map((it) => it.stored.id),
      ['one'],
    )
    assert.equal(kept[0]?.resolved, false)
  })

  it('an open switch adds the resolved records', () => {
    const kept = pickRecords([stored('one')], [stored('two')], true)
    assert.deepEqual(
      kept.map((it) => it.stored.id),
      ['one', 'two'],
    )
    assert.equal(kept[0]?.resolved, false)
    assert.equal(kept[1]?.resolved, true)
  })

  it('an empty store gives no record whatever the switch says', () => {
    assert.deepEqual(pickRecords([], [], true), [])
    assert.deepEqual(pickRecords([], [], false), [])
  })

  it('a resolved record wins over every share word', () => {
    assert.equal(commentWord(true, false, false, true), COMMENT_WORDS.resolved)
    assert.equal(commentWord(false, true, true, true), COMMENT_WORDS.resolved)
  })

  it('an open record keeps the three share words', () => {
    assert.equal(commentWord(false, false, false, false), COMMENT_WORDS.local)
    assert.equal(commentWord(true, true, false, false), COMMENT_WORDS.notShared)
    assert.equal(commentWord(true, false, true, false), COMMENT_WORDS.notShared)
    assert.equal(commentWord(true, false, false, false), COMMENT_WORDS.shared)
  })

  it('a task carries the characters of the record', () => {
    const found = commentTask(
      {
        stored: storedWith({ startLine: 88, startColumn: 4, endLine: 94, endColumn: 9 }),
        resolved: false,
      },
      '/repo',
      false,
    )
    assert.equal(found?.startColumn, 4)
    assert.equal(found?.endColumn, 9)
    assert.equal(found?.startLine, 88)
    assert.equal(found?.endLine, 94)
  })

  it('a task of whole lines carries no character', () => {
    const found = commentTask(
      { stored: storedWith({ startLine: 88, endLine: 94 }), resolved: false },
      '/repo',
      false,
    )
    assert.equal(found?.startColumn, undefined)
    assert.equal(found?.endColumn, undefined)
  })

  it('a record without a text has no task', () => {
    assert.equal(
      commentTask(
        { stored: storedWith({ startLine: 1, endLine: 1 }, '  '), resolved: false },
        '/repo',
        false,
      ),
      undefined,
    )
  })

  it('a record whose path leaves the root has no task', () => {
    const outside = {
      id: 'c'.repeat(40),
      ref: LOCAL,
      commit: 'c1',
      record: {
        timestamp: '1',
        author: 'a@b.c',
        description: 'x',
        location: { commit: 'c1', path: '../out.txt' },
      },
    }
    assert.equal(commentTask({ stored: outside, resolved: false }, 'E:/repo', false), undefined)
  })

  it('a resolved record carries the resolved flag', () => {
    const closed = {
      id: 'c'.repeat(40),
      ref: DISCUSS,
      commit: 'c1',
      record: {
        timestamp: '1',
        author: 'a@b.c',
        description: 'x',
        location: { commit: 'c1', path: 'a.txt' },
      },
    }
    assert.equal(commentTask({ stored: closed, resolved: true }, 'E:/repo', false)?.resolved, true)
  })
})

describe('task revision', () => {
  const head = '9f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b706'

  it('a repository with a commit carries that commit', () => {
    assert.equal(revisionOf(head), head)
  })

  it('a repository with no commit carries the working tree', () => {
    assert.equal(revisionOf(undefined), WORKTREE)
  })
})
