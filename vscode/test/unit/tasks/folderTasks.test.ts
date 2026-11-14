import assert from 'node:assert/strict'

import { WORKTREE } from '../../../src/core/anchor'
import { encodeRecord } from '../../../src/core/record'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import { compilePatterns, DEFAULT_PATTERNS } from '../../../src/tasks/todoPatterns'
import { type RepositoryTasks, type ScanInput, scanProject } from '../../../src/tasks/taskScan'
import { MemoryNotes } from '../store/memoryNotes'

const ROOT = 'E:/plain'

const record = (description: string, path = 'docs/a.txt'): string =>
  encodeRecord({
    timestamp: '1',
    author: 'reviewer@example.com',
    description,
    location: { commit: WORKTREE, path, range: { startLine: 1, endLine: 1 } },
  })

const storeWith = async (lines: readonly (readonly [string, string])[]): Promise<MemoryNotes> => {
  const store = new MemoryNotes()
  await lines.reduce(
    (done, [ref, line]) => done.then(() => store.append(ref, WORKTREE, Promise.resolve(line))),
    Promise.resolve(),
  )
  return store
}

const scan = (stores: ScanInput['folderStores']): Promise<readonly RepositoryTasks[]> =>
  scanProject({
    gitPath: 'git',
    roots: [],
    basePathOf: () => undefined,
    patterns: compilePatterns(DEFAULT_PATTERNS).patterns,
    unshared: () => false,
    folderStores: stores,
  })

describe('the comments of a folder store', () => {
  const shared: { found: readonly RepositoryTasks[] } = { found: [] }

  before(async () => {
    const store = await storeWith([
      [DISCUSS, record('discuss')],
      [LOCAL, record('local')],
    ])
    shared.found = await scan([
      { root: ROOT, store },
      { root: 'E:/empty', store: new MemoryNotes() },
    ])
  })

  const stateOf = (text: string): string | undefined =>
    shared.found[0]?.tasks.find((task) => task.text === text)?.state

  it('a folder store gives its comments', () => {
    assert.equal(shared.found.length, 1)
    assert.equal(shared.found[0]?.root, ROOT)
    assert.equal(shared.found[0]?.commit, 'worktree')
    assert.deepEqual(
      shared.found[0]?.tasks.map((task) => task.kind),
      ['comment', 'comment'],
    )
  })

  it('a shared record of a folder store is not shared', () => {
    assert.equal(stateOf('discuss'), 'not shared')
  })

  it('a local record of a folder store is local', () => {
    assert.equal(stateOf('local'), 'local')
  })

  it('an empty folder store gives no entry', () => {
    assert.deepEqual(
      shared.found.map((entry) => entry.root),
      [ROOT],
    )
  })

  it('a path that leaves the root gives no task', async () => {
    const store = await storeWith([[LOCAL, record('outside', '../x.txt')]])
    assert.deepEqual(await scan([{ root: ROOT, store }]), [])
  })
})
