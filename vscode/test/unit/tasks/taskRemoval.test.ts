import assert from 'node:assert/strict'

import { NotesWriteError } from '../../../src/git/errors'
import type { DeleteResult } from '../../../src/store/reviewService'
import {
  deleteReport,
  lockedMessage,
  noCommentMessage,
  removeComments,
  sharedMessage,
} from '../../../src/tasks/taskRemoval'
import { task } from './fixtures'

const ID = 'a'.repeat(40)
const ID2 = 'c'.repeat(40)

describe('task removal', () => {
  it('runs one remove for each root, with each id once', async () => {
    const calls: [string, readonly string[]][] = []
    const report = await removeComments(
      [
        task({ rootPath: 'E:/a', id: ID, startLine: 1 }),
        task({ rootPath: 'E:/a', id: ID, startLine: 4 }),
        task({ rootPath: 'E:/b', id: ID2 }),
      ],
      (root, ids) => {
        calls.push([root, ids])
        return Promise.resolve({ removed: ids.length })
      },
    )
    assert.deepEqual(calls, [
      ['E:/a', [ID]],
      ['E:/b', [ID2]],
    ])
    assert.deepEqual(report, { removed: 2, problems: [] })
  })

  it('a failed push is a problem and the delete still counts', async () => {
    const report = await removeComments([task()], () =>
      Promise.resolve<DeleteResult>({ removed: 1, shareError: 'no remote' }),
    )
    assert.deepEqual(report, { removed: 1, problems: ['no remote'] })
  })

  it('a note that git cannot write names the repository', async () => {
    const report = await removeComments([task({ rootPath: 'E:/r/app' })], () =>
      Promise.reject(new NotesWriteError('locked')),
    )
    assert.deepEqual(report, {
      removed: 0,
      problems: ['The extension could not write the note of app. locked'],
    })
  })

  it('another failure goes to the caller', async () => {
    await assert.rejects(
      removeComments([task()], () => Promise.reject(new Error('x'))),
      /x/,
    )
  })

  it('reports the comments only', () => {
    assert.deepEqual(deleteReport({ removed: 2, problems: [] }), {
      text: 'The extension deleted 2 review comments.',
      warn: false,
    })
  })

  it('reports the TODO items only', () => {
    assert.deepEqual(deleteReport(undefined, { removed: 1, missing: [], problems: [] }), {
      text: 'The extension deleted 1 TODO item.',
      warn: false,
    })
  })

  it('reports both kinds', () => {
    assert.deepEqual(
      deleteReport({ removed: 1, problems: [] }, { removed: 1, missing: [], problems: [] }),
      { text: 'The extension deleted 1 review comment and 1 TODO item.', warn: false },
    )
  })

  it('a delete that removed no comment line says so', () => {
    assert.deepEqual(deleteReport({ removed: 0, problems: [] }), {
      text: 'The extension deleted 0 review comments. The git notes hold no line for that comment.',
      warn: true,
    })
  })

  it('names the missing TODO items', () => {
    assert.deepEqual(
      deleteReport(undefined, { removed: 0, missing: ['a.ts:3', 'b.ts:9'], problems: [] }),
      {
        text: 'The extension deleted 0 TODO items. The extension did not find 2 TODO items: a.ts:3, b.ts:9. Read the tasks again.',
        warn: true,
      },
    )
  })

  it('gives the words of the kept items', () => {
    assert.equal(
      sharedMessage(['a.ts:2']),
      'The extension left 1 TODO item in place: a.ts:2. The line of such an item also opens or closes a comment that holds other text. Delete that line by hand.',
    )
    assert.equal(
      noCommentMessage(['b.ts:4']),
      'The extension left 1 TODO item in place: b.ts:4. The extension found no comment around such an item, so the item can be code. Delete it by hand.',
    )
    assert.equal(
      lockedMessage(['a.ts']),
      'The extension could not change a.ts. Make sure that the files can be written, then delete the rows again.',
    )
  })
})
