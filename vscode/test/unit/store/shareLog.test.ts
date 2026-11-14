import assert from 'node:assert/strict'

import { ANALYSES, DISCUSS } from '../../../src/store/noteRefs'
import { ShareLog, type ShareMark, readMarks } from '../../../src/store/shareLog'

describe('share log', () => {
  it('marks a comment once', async () => {
    const saved: (readonly ShareMark[])[] = []
    const log = new ShareLog([], (marks) => {
      saved.push(marks)
      return Promise.resolve()
    })
    await log.mark('a', '/r', DISCUSS)
    await log.mark('a', '/r', DISCUSS)
    assert.equal(log.isUnshared('a'), true)
    assert.deepEqual(log.marks(), [{ id: 'a', root: '/r', ref: DISCUSS }])
    assert.equal(saved.length, 1)
  })

  it('a good push clears the marks of its root and ref only', async () => {
    const log = new ShareLog([
      { id: 'a', root: '/r', ref: DISCUSS },
      { id: 'b', root: '/other', ref: DISCUSS },
      { id: 'c', root: '/r', ref: ANALYSES },
    ])
    await log.clear('/r', DISCUSS)
    assert.deepEqual(
      log.marks().map((mark) => mark.id),
      ['b', 'c'],
    )
  })

  it('a mark of no push goes with the first good push', async () => {
    const log = new ShareLog([{ id: 'old', root: '', ref: '' }])
    await log.clear('/r', DISCUSS)
    assert.equal(log.isUnshared('old'), false)
  })

  it('reads the stored marks and drops a bad entry', () => {
    assert.deepEqual(readMarks([{ id: 'a', root: '/r', ref: DISCUSS }, { id: 1 }, 'x']), [
      { id: 'a', root: '/r', ref: DISCUSS },
    ])
    assert.deepEqual(readMarks(undefined), [])
  })
})
