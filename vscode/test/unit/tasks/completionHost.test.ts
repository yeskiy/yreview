import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { handleOf } from '../../../src/core/handles'
import { LOCAL } from '../../../src/store/noteRefs'
import { type Anchor, ReviewService, type ServiceHost } from '../../../src/store/reviewService'
import { projectCompletionHost } from '../../../src/tasks/completionHost'
import { NO_CAP, TaskCompletion } from '../../../src/tasks/taskCompletion'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const host = (folders: readonly string[]): ServiceHost => ({
  gitPath: () => 'git',
  settings: () => ({ remote: 'origin', writeRefspec: false }),
  askRefspec: () => Promise.resolve(undefined),
  declinedRoots: () => [],
  saveDeclinedRoots: () => Promise.resolve(),
  workspaceFolders: () => folders,
  toldFolders: () => [],
  saveToldFolders: () => Promise.resolve(),
  say: () => undefined,
  warn: () => undefined,
})

const anchored = async (service: ReviewService, file: string): Promise<Anchor> => {
  const result = await service.anchorOf(file)
  return result.kind === 'found' ? result.anchor : assert.fail(`no anchor: ${result.kind}`)
}

describe('projectCompletionHost', function completionHost() {
  this.timeout(120_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))

  it('closes a comment of a git root once', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const service = new ReviewService(host([]))
    const { stored } = await service.addComment(
      await anchored(service, path.join(dir, 'src', 'a.txt')),
      { startLine: 1, endLine: 1 },
      'Close me.',
      false,
    )
    const completion = new TaskCompletion(
      projectCompletionHost(
        service,
        'git',
        () => Promise.resolve([dir]),
        () => Promise.resolve([]),
      ),
    )
    assert.deepEqual(await completion.close([handleOf(stored.id)], NO_CAP), {
      closed: 1,
      problems: [],
    })
    assert.match(git(dir, 'notes', '--ref', LOCAL, 'show', 'HEAD'), /"resolved":true/)
    assert.deepEqual(await completion.close([handleOf(stored.id)], NO_CAP), {
      closed: 0,
      problems: [],
    })
  })

  it('closes a comment of a folder store once', async () => {
    const dir = scratchDir()
    dirs.push(dir)
    writeFileSync(path.join(dir, 'a.txt'), 'one\n')
    const service = new ReviewService(host([dir]))
    const anchor = await anchored(service, path.join(dir, 'a.txt'))
    assert.equal(anchor.store, 'folder')
    const { stored } = await service.addComment(
      anchor,
      { startLine: 1, endLine: 1 },
      'Close me.',
      false,
    )
    const completion = new TaskCompletion(
      projectCompletionHost(
        service,
        'git',
        () => Promise.resolve([]),
        () => Promise.resolve([]),
      ),
    )
    assert.deepEqual(await completion.close([handleOf(stored.id)], NO_CAP), {
      closed: 1,
      problems: [],
    })
    assert.match(
      readFileSync(
        path.join(dir, '.y-review', 'notes', LOCAL.replaceAll('/', '-'), 'worktree.jsonl'),
        'utf8',
      ),
      /"resolved":true/,
    )
    assert.deepEqual(await completion.close([handleOf(stored.id)], NO_CAP), {
      closed: 0,
      problems: [],
    })
  })
})
