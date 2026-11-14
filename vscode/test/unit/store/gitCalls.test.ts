import assert from 'node:assert/strict'
import path from 'node:path'

import { gitCalls } from '../../../src/git/runner'
import { LOCAL } from '../../../src/store/noteRefs'
import { type Anchor, ReviewService, type ServiceHost } from '../../../src/store/reviewService'
import { makeRemote, makeRepo, removeDir } from '../../fixtures/scratch'

const host: ServiceHost = {
  gitPath: () => 'git',
  settings: () => ({ remote: 'origin', writeRefspec: true }),
  askRefspec: () => Promise.resolve(undefined),
  declinedRoots: () => [],
  saveDeclinedRoots: () => Promise.resolve(),
  workspaceFolders: () => [],
  toldFolders: () => [],
  saveToldFolders: () => Promise.resolve(),
  say: () => undefined,
  warn: () => undefined,
}

const range = { startLine: 1, endLine: 1 }

/** The count of git processes that `work` starts. */
const counted = async <T>(work: () => Promise<T>): Promise<{ value: T; calls: number }> => {
  const before = gitCalls()
  const value = await work()
  return { value, calls: gitCalls() - before }
}

describe('git calls of the comment actions', function calls() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))

  const anchored = async (service: ReviewService, dir: string): Promise<Anchor> => {
    const found = await service.anchorOf(path.join(dir, 'src', 'a.txt'))
    return found.kind === 'found' ? found.anchor : assert.fail('no anchor')
  }

  it('anchors a file with 2 git calls', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const service = new ReviewService(host)
    assert.equal((await counted(() => service.anchorOf(path.join(dir, 'src', 'a.txt')))).calls, 2)
  })

  it('anchors a file of a workspace folder repository with 2 git calls', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const service = new ReviewService({ ...host, workspaceFolders: () => [dir] })
    assert.equal((await counted(() => service.anchorOf(path.join(dir, 'src', 'a.txt')))).calls, 2)
  })

  it('saves a local comment with 6 git calls, also the first write of a session', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const service = new ReviewService(host)
    const anchor = await anchored(service, dir)
    const first = await counted(() => service.addComment(anchor, range, 'First.', false))
    const second = await counted(() => service.addComment(anchor, range, 'Second.', false))
    assert.equal(first.value.stored.ref, LOCAL)
    assert.deepEqual([first.calls, second.calls], [6, 6])
  })

  it('saves the first shared comment with 8 git calls, 3 of them for the push', async () => {
    const made = makeRemote()
    const dir = made.clone()
    dirs.push(made.bare, dir)
    const service = new ReviewService(host)
    const anchor = await anchored(service, dir)
    await service.addComment(anchor, range, 'Warm.', false)
    const shared = await counted(() => service.addComment(anchor, range, 'Shared.', true))
    assert.equal(shared.value.shareError, undefined)
    assert.equal(shared.calls, 8)
  })

  it('deletes a shown local comment with 6 git calls', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const service = new ReviewService(host)
    const anchor = await anchored(service, dir)
    const { stored } = await service.addComment(anchor, range, 'Gone soon.', false)
    const removed = await counted(() => service.removeStored(anchor, [stored]))
    assert.equal(removed.value.removed, 1)
    assert.equal(removed.calls, 6)
    assert.deepEqual(await service.openAt(anchor), [])
  })
})
