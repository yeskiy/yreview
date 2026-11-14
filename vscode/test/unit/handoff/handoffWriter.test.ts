import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { windowFolderName } from '../../../src/core/paths'
import { decodeTaskDocument } from '../../../src/core/taskDocument'
import {
  type HandoffDeps,
  handoffStores,
  isoSeconds,
  taskFileOf,
  windowPathOf,
  writeHandoff,
} from '../../../src/handoff/handoffWriter'
import { FolderNotes } from '../../../src/store/folderNotes'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'
import { task } from '../tasks/fixtures'

const failures: unknown[] = []
const watched: string[] = []
const deps = (windowPath: string): HandoffDeps => ({
  gitPath: 'git',
  windowPath: () => windowPath,
  watch: (done) => watched.push(done),
  log: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: (_message, failure) => failures.push(failure),
  },
  now: () => new Date('2026-11-14T10:00:00.123Z'),
})

describe('handoff writer', () => {
  const repo = makeRepo()
  const plain = scratchDir()
  const windowPath = path.join(repo, 'project.code-workspace')
  const window = `vscode-${windowFolderName(windowPath)}`
  const gitDir = path.resolve(git(repo, 'rev-parse', '--absolute-git-dir'))
  const store = { kind: 'git', root: repo.replaceAll('\\', '/') } as const
  const tasks = [task({ id: 'c'.repeat(40), path: 'src/a.txt', rootPath: store.root })]

  beforeEach(() => {
    failures.length = 0
    watched.length = 0
  })

  after(() => {
    removeDir(repo)
    removeDir(plain)
  })

  it('writes the three files in the window folder inside the git directory', async () => {
    const written = await writeHandoff(deps(windowPath), store, tasks)
    const folder = path.join(gitDir, 'y-review', window)
    assert.equal(written?.files.folder, folder)
    ;['AGENT.md', 'tasks.json', 'done.txt'].forEach((name) =>
      assert.ok(existsSync(path.join(folder, name)), name),
    )
    assert.deepEqual(watched, [path.join(folder, 'done.txt')])
  })

  it('the task file names the head commit, the root with slashes and whole seconds', async () => {
    const written = await writeHandoff(deps(windowPath), store, tasks)
    assert.ok(written)
    const document = decodeTaskDocument(readFileSync(written.files.tasks, 'utf8'))
    assert.equal(document?.commit, git(repo, 'rev-parse', 'HEAD'))
    assert.equal(written.commit, git(repo, 'rev-parse', 'HEAD'))
    assert.equal(document?.generated, '2026-11-14T10:00:00Z')
    assert.ok(!document?.repository.includes('\\'))
    assert.deepEqual(
      document?.tasks.map((each) => each.id),
      ['c'.repeat(40)],
    )
  })

  it('the label of a plain repository is relative', async () => {
    const written = await writeHandoff(deps(windowPath), store, tasks)
    assert.equal(written?.label, `.git/y-review/${window}`)
  })

  it('a folder store writes beside its records and names the worktree', async () => {
    const written = await writeHandoff(deps(windowPath), { kind: 'folder', root: plain }, tasks)
    const file = path.join(plain, '.y-review', window, 'tasks.json')
    assert.equal(written?.files.tasks, file)
    assert.equal(decodeTaskDocument(readFileSync(file, 'utf8'))?.commit, 'worktree')
    assert.equal(written?.commit, 'worktree')
  })

  it('a failed write answers undefined and logs', async () => {
    const other = path.join(repo, 'other.code-workspace')
    const folder = path.join(gitDir, 'y-review', `vscode-${windowFolderName(other)}`)
    mkdirSync(path.dirname(folder), { recursive: true })
    writeFileSync(folder, 'not a folder')
    assert.equal(await writeHandoff(deps(other), store, tasks), undefined)
    assert.equal(failures.length, 1)
    assert.deepEqual(watched, [])
  })

  it('windowPathOf takes the workspace file, then the first folder', () => {
    assert.equal(
      windowPathOf({ scheme: 'file', fsPath: '/w/all.code-workspace' }, ['/a', '/b']),
      '/w/all.code-workspace',
    )
    assert.equal(windowPathOf({ scheme: 'untitled', fsPath: '/u' }, ['/a', '/b']), '/a')
    assert.equal(windowPathOf(undefined, []), '')
  })

  it('isoSeconds drops the milliseconds', () => {
    assert.equal(isoSeconds(new Date('2026-11-14T10:00:00.999Z')), '2026-11-14T10:00:00Z')
  })

  it('the task file of a store is the file that the writer writes', async () => {
    const written = await writeHandoff(deps(windowPath), store, tasks)
    assert.equal(await taskFileOf(deps(windowPath), store), written?.files.tasks)
  })

  it('the stores are the repository roots, then the folder stores', async () => {
    const asked: boolean[] = []
    const stores = await handoffStores(() => Promise.resolve(['/r']), {
      folderStores: (writes: boolean) => {
        asked.push(writes)
        return Promise.resolve([{ root: '/f', store: new FolderNotes('/f') }])
      },
    })
    assert.deepEqual(stores, [
      { kind: 'git', root: '/r' },
      { kind: 'folder', root: '/f' },
    ])
    assert.deepEqual(asked, [false])
  })
})
