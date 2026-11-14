import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'

import { gitCalls, inBackground } from '../../../src/git/runner'
import { type Anchor, ReviewService, type ServiceHost } from '../../../src/store/reviewService'
import { DEFAULT_PATTERNS, compilePatterns } from '../../../src/tasks/todoPatterns'
import {
  type RepositoryTasks,
  type ScanInput,
  type ScanKind,
  ScanSchedule,
  rescanNotes,
  scanProject,
} from '../../../src/tasks/taskScan'
import { makeRepo, removeDir } from '../../fixtures/scratch'

const host = (folders: readonly string[]): ServiceHost => ({
  gitPath: () => 'git',
  settings: () => ({ remote: 'origin', writeRefspec: true }),
  askRefspec: () => Promise.resolve(undefined),
  declinedRoots: () => [],
  saveDeclinedRoots: () => Promise.resolve(),
  workspaceFolders: () => folders,
  toldFolders: () => [],
  saveToldFolders: () => Promise.resolve(),
  say: () => undefined,
  warn: () => undefined,
})

const range = { startLine: 1, endLine: 1 }
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** The count of every git process that `work` starts, the background ones too. */
const allGit = async <T>(work: () => Promise<T>): Promise<{ value: T; calls: number }> => {
  const { spawn } = childProcess
  const seen = { calls: 0 }
  const counting = ((...args: Parameters<typeof spawn>) => {
    if (args[0] === 'git') seen.calls += 1
    return spawn(...args)
  }) as typeof spawn
  Object.assign(childProcess, { spawn: counting })
  syncBuiltinESMExports()
  try {
    return { value: await work(), calls: seen.calls }
  } finally {
    Object.assign(childProcess, { spawn })
    syncBuiltinESMExports()
  }
}

describe('ScanSchedule', () => {
  const burst = async (kinds: readonly ScanKind[]): Promise<readonly ScanKind[]> => {
    const started: ScanKind[] = []
    const schedule = new ScanSchedule((kind) => started.push(kind), 300)
    await kinds.reduce(
      (done, kind) =>
        done.then(async () => {
          schedule.request(kind)
          await wait(20)
        }),
      Promise.resolve(),
    )
    await wait(500)
    return started
  }

  it('starts one note scan for 5 quick writes', async () => {
    assert.deepEqual(await burst(['notes', 'notes', 'notes', 'notes', 'notes']), ['notes'])
  })

  it('starts one full scan when a full request is in the burst', async () => {
    assert.deepEqual(await burst(['notes', 'full', 'notes']), ['full'])
  })

  it('starts no scan after a cancel', async () => {
    const started: ScanKind[] = []
    const schedule = new ScanSchedule((kind) => started.push(kind), 50)
    schedule.request('notes')
    schedule.cancel()
    await wait(150)
    assert.deepEqual(started, [])
  })
})

describe('the git processes of a comment write and its scan', function processes() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))

  const setup = async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const root = dir.replaceAll('\\', '/')
    const service = new ReviewService(host([dir]))
    const found = await service.anchorOf(path.join(dir, 'src', 'a.txt'))
    const anchor: Anchor = found.kind === 'found' ? found.anchor : assert.fail('no anchor')
    await service.addComment(anchor, range, 'Warm.', false)
    const input = async (): Promise<ScanInput> => ({
      gitPath: 'git',
      roots: [root],
      basePathOf: () => root,
      patterns: compilePatterns(DEFAULT_PATTERNS).patterns,
      unshared: () => false,
      folderStores: await service.folderStores(true),
    })
    const first = await inBackground(async () => scanProject(await input()))
    return { service, anchor, input, first }
  }

  it('a Save Local and its note scan start 9 git processes or fewer', async () => {
    const { service, anchor, input, first } = await setup()
    const scanned: { done?: Promise<readonly RepositoryTasks[]> } = {}
    const schedule = new ScanSchedule((kind) => {
      scanned.done = inBackground(async () =>
        kind === 'notes' ? rescanNotes(await input(), first) : scanProject(await input()),
      )
    })
    const stop = service.onDidChange(() => schedule.request('notes'))
    const before = gitCalls()
    const counted = await allGit(async () => {
      await service.addComment(anchor, range, 'Saved.', false)
      await wait(500)
      return scanned.done
    })
    stop()
    assert.equal(gitCalls() - before, 6, 'the background scan is not in gitCalls')
    assert.ok(
      counted.value?.[0]?.tasks.some((task) => task.text === 'Saved.'),
      'the scan holds the new comment',
    )
    assert.ok(counted.calls <= 9, `${counted.calls} git processes`)
  })

  it('a note scan with no moved ref tip starts one git process for each root', async () => {
    const { input, first } = await setup()
    const stores = await input()
    const counted = await allGit(() => inBackground(() => rescanNotes(stores, first)))
    assert.equal(counted.calls, 1)
    assert.deepEqual(counted.value, first)
  })
})
