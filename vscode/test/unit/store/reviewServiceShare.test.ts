import assert from 'node:assert/strict'
import path from 'node:path'

import {
  type Anchor,
  type RefspecAnswer,
  ReviewService,
  type ServiceHost,
} from '../../../src/store/reviewService'
import { ShareLog } from '../../../src/store/shareLog'
import { git, makeRemote, makeRepo, removeDir } from '../../fixtures/scratch'

const host = (answers: RefspecAnswer[], remoteName: string) => {
  const asked: string[] = []
  const warnings: string[] = []
  const store = { declined: [] as string[] }
  const value: ServiceHost = {
    gitPath: () => 'git',
    settings: () => ({ remote: remoteName, writeRefspec: false }),
    askRefspec: (root) => {
      asked.push(root)
      return Promise.resolve(answers.shift())
    },
    declinedRoots: () => store.declined,
    saveDeclinedRoots: (roots) => {
      store.declined = [...roots]
      return Promise.resolve()
    },
    workspaceFolders: () => [],
    toldFolders: () => [],
    saveToldFolders: () => Promise.resolve(),
    say: () => undefined,
    warn: (message) => {
      warnings.push(message)
    },
  }
  return { value, asked, warnings, store }
}

describe('ReviewService share log', function reviewServiceShare() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return dir
  }
  const remote = () => {
    const made = makeRemote()
    dirs.push(made.bare)
    return made.bare
  }
  const anchored = async (service: ReviewService, dir: string): Promise<Anchor> => {
    const result = await service.anchorOf(path.join(dir, 'src', 'a.txt'))
    return result.kind === 'found' ? result.anchor : assert.fail(`no anchor: ${result.kind}`)
  }

  it('a failed push marks the comment, and the next good push clears the mark', async () => {
    const dir = repo()
    const log = new ShareLog()
    const failing = new ReviewService(host([], 'nowhere').value, log)
    const first = await failing.addComment(
      await anchored(failing, dir),
      { startLine: 1, endLine: 1 },
      'First.',
      true,
    )
    assert.notEqual(first.shareError, undefined)
    assert.equal(failing.unshared(first.stored.id), true)
    git(dir, 'remote', 'add', 'origin', remote())
    const working = new ReviewService(host([], 'origin').value, log)
    const second = await working.addComment(
      await anchored(working, dir),
      { startLine: 1, endLine: 1 },
      'Second.',
      true,
    )
    assert.equal(second.shareError, undefined)
    assert.equal(working.unshared(first.stored.id), false)
  })

  it('a local comment never gets a mark', async () => {
    const service = new ReviewService(host([], 'nowhere').value, new ShareLog())
    const written = await service.addComment(
      await anchored(service, repo()),
      { startLine: 1, endLine: 1 },
      'Local.',
      false,
    )
    assert.equal(service.unshared(written.stored.id), false)
  })
})
