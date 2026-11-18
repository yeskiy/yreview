import assert from 'node:assert/strict'

import { handleOf } from '../../../src/core/handles'
import { shareLogOf } from '../../../src/shareLogState'
import { ANALYSES, DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import {
  MAX_RENAMES,
  ShareLog,
  type ShareMark,
  readMarks,
  readRenames,
} from '../../../src/store/shareLog'

const OLD = 'a'.repeat(40)
const NEW = 'b'.repeat(40)
const OTHER = 'c'.repeat(40)

/** A workspace state in memory, as the share log of the extension reads it. */
const memento = () => {
  const values = new Map<string, unknown>()
  return {
    get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
    update: (key: string, value: unknown): Promise<void> => {
      values.set(key, value)
      return Promise.resolve()
    },
    keys: (): readonly string[] => [...values.keys()],
  }
}

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

  describe('renames of a migrated store', () => {
    it('a rename moves the mark of an old identifier to the new identifier and root', async () => {
      const log = new ShareLog([{ id: OLD, root: '/sub', ref: LOCAL }])
      await log.rename(new Map([[OLD, NEW]]), '/r')
      assert.deepEqual(log.marks(), [{ id: NEW, root: '/r', ref: LOCAL }])
    })

    it('forwards an old identifier and its handle to the new identifier', async () => {
      const log = new ShareLog()
      await log.rename(new Map([[OLD, NEW]]), '/r')
      assert.equal(log.forward(OLD), NEW)
      assert.equal(log.forward(handleOf(OLD)), NEW)
      assert.equal(log.forward(OTHER), OTHER)
      assert.equal(log.forward(handleOf(OTHER)), handleOf(OTHER))
    })

    it('keeps the renames through the workspace state', async () => {
      const state = memento()
      await shareLogOf(state).rename(new Map([[OLD, NEW]]), '/r')
      assert.ok(state.keys().includes('yreview.renamedIds'))
      assert.equal(shareLogOf(state as never).forward(OLD), NEW)
    })

    it('keeps the newest renames only, the newest last', async () => {
      const saved: (readonly (readonly [string, string])[])[] = []
      const log = new ShareLog([], undefined, [], (renames) => {
        saved.push(renames)
        return Promise.resolve()
      })
      const id = (prefix: string, n: number): string =>
        `${prefix}${n.toString(16).padStart(39, '0')}`
      await log.rename(
        new Map(Array.from({ length: MAX_RENAMES + 2 }, (_, n) => [id('a', n), id('b', n)])),
        '/r',
      )
      const last = saved.at(-1) ?? []
      assert.equal(MAX_RENAMES, 5000)
      assert.equal(last.length, MAX_RENAMES)
      assert.deepEqual(last.at(-1), [id('a', MAX_RENAMES + 1), id('b', MAX_RENAMES + 1)])
      assert.equal(log.forward(id('a', 0)), id('a', 0))
    })

    it('reads the stored renames and drops a bad entry', () => {
      assert.deepEqual(readRenames([[OLD, NEW], [1, 2], 'x', [OLD]]), [[OLD, NEW]])
      assert.deepEqual(readRenames(undefined), [])
    })
  })
})
