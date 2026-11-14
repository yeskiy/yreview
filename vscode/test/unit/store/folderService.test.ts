import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { WORKTREE, slashPath } from '../../../src/core/anchor'
import { FolderNotes } from '../../../src/store/folderNotes'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import {
  type Anchor,
  FOLDER_SHARED,
  NO_REVISION,
  ReviewService,
  type ServiceHost,
  folderFirstNotice,
} from '../../../src/store/reviewService'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const host = (folders: readonly string[]) => {
  const said: string[] = []
  const warnings: string[] = []
  const store = { told: [] as readonly string[] }
  const value: ServiceHost = {
    gitPath: () => 'git',
    settings: () => ({ remote: 'origin', writeRefspec: false }),
    askRefspec: () => Promise.resolve(undefined),
    declinedRoots: () => [],
    saveDeclinedRoots: () => Promise.resolve(),
    workspaceFolders: () => folders,
    toldFolders: () => store.told,
    saveToldFolders: (roots) => {
      store.told = [...roots]
      return Promise.resolve()
    },
    say: (message) => {
      said.push(message)
    },
    warn: (message) => {
      warnings.push(message)
    },
  }
  return { value, said, warnings, store }
}

const configure = (dir: string): void => {
  git(dir, 'config', 'user.email', 'reviewer@example.com')
  git(dir, 'config', 'user.name', 'Reviewer')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

describe('ReviewService with folder stores and diff sides', function folderService() {
  this.timeout(240_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const plain = (): string => {
    const dir = scratchDir()
    dirs.push(dir)
    mkdirSync(path.join(dir, 'notes'))
    writeFileSync(path.join(dir, 'notes', 'one.md'), '# One\n')
    return dir
  }
  const folderAnchor = async (service: ReviewService, dir: string): Promise<Anchor> => {
    const result = await service.anchorOf(path.join(dir, 'notes', 'one.md'))
    return result.kind === 'found' ? result.anchor : assert.fail(`no anchor: ${result.kind}`)
  }
  const storeFile = (dir: string, ref: string): string =>
    path.join(dir, '.y-review', 'notes', ref.replaceAll('/', '-'), 'worktree.jsonl')

  it('anchors a file outside every repository to the workspace folder', async () => {
    const dir = plain()
    assert.deepEqual(
      await new ReviewService(host([dir]).value).anchorOf(path.join(dir, 'notes', 'one.md')),
      {
        kind: 'found',
        anchor: { store: 'folder', root: slashPath(dir), head: 'worktree', path: 'notes/one.md' },
      },
    )
  })

  it('a file of an inner repository goes to the notes of that repository', async () => {
    const dir = plain()
    mkdirSync(path.join(dir, 'inner'))
    const inner = makeRepo(path.join(dir, 'inner'))
    const result = await new ReviewService(host([dir]).value).anchorOf(
      path.join(inner, 'src', 'a.txt'),
    )
    assert.equal(result.kind === 'found' ? result.anchor.store : result.kind, 'git')
  })

  it('a repository with no commit takes no folder store', async () => {
    const dir = plain()
    git(dir, 'init', '-q')
    assert.deepEqual(
      await new ReviewService(host([dir]).value).anchorOf(path.join(dir, 'notes', 'one.md')),
      { kind: 'noCommit' },
    )
  })

  it('a .git entry that git refuses gives no place and the reason', async () => {
    const dir = plain()
    writeFileSync(path.join(dir, '.git'), 'not a git file\n')
    const result = await new ReviewService(host([dir]).value).anchorOf(
      path.join(dir, 'notes', 'one.md'),
    )
    assert.equal(result.kind, 'noPlace')
    assert.match(
      result.kind === 'noPlace' ? (result.reason ?? '') : '',
      /^Git did not open the repository/,
    )
  })

  it('writes a local comment into the folder store and says so once', async () => {
    const dir = plain()
    const made = host([dir])
    const service = new ReviewService(made.value)
    const anchor = await folderAnchor(service, dir)
    const first = await service.addComment(
      anchor,
      { startLine: 1, endLine: 1 },
      'Folder one.',
      false,
    )
    assert.equal(first.stored.ref, LOCAL)
    assert.deepEqual(first.notices, [folderFirstNotice(slashPath(dir))])
    assert.match(
      readFileSync(storeFile(dir, LOCAL), 'utf8'),
      /"commit":"worktree","path":"notes\/one.md"/,
    )
    const second = await service.addComment(
      anchor,
      { startLine: 1, endLine: 1 },
      'Folder two.',
      false,
    )
    assert.deepEqual(second.notices, [])
    assert.deepEqual(made.store.told, [slashPath(dir)])
    assert.deepEqual(
      (await service.openAt(anchor)).map((entry) => entry.record.description),
      ['Folder one.', 'Folder two.'],
    )
  })

  it('a shared comment in a folder store pushes nothing and says why', async () => {
    const dir = plain()
    const service = new ReviewService(host([dir]).value)
    const anchor = await folderAnchor(service, dir)
    const written = await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'Shared.', true)
    assert.equal(written.stored.ref, DISCUSS)
    assert.equal(written.shareError, undefined)
    assert.ok(written.notices?.includes(FOLDER_SHARED))
    assert.ok(existsSync(storeFile(dir, DISCUSS)))
  })

  it('resolves and deletes a comment of a folder store', async () => {
    const dir = plain()
    const service = new ReviewService(host([dir]).value)
    const anchor = await folderAnchor(service, dir)
    const { stored } = await service.addComment(anchor, { startLine: 1, endLine: 1 }, 'Go.', false)
    await service.resolve(anchor, stored.id)
    assert.deepEqual(await service.openAt(anchor), [])
    assert.deepEqual(await service.remove(anchor, [stored.id]), { removed: 2 })
    assert.equal(existsSync(storeFile(dir, LOCAL)), false)
  })

  it('moves the folder store into the git notes once a repository with a commit covers it', async () => {
    const dir = plain()
    const made = host([dir])
    const service = new ReviewService(made.value)
    const changes: number[] = []
    service.onDidChange(() => changes.push(1))
    const { stored } = await service.addComment(
      await folderAnchor(service, dir),
      { startLine: 1, endLine: 1 },
      'Move me.',
      false,
    )
    git(dir, 'init', '-q', '-b', 'main')
    configure(dir)
    git(dir, 'add', 'notes')
    git(dir, 'commit', '-q', '-m', 'init')
    assert.deepEqual(
      await Promise.all([service.folderStoreRoots(true), service.folderStoreRoots(true)]),
      [[], []],
    )
    assert.equal(existsSync(path.join(dir, '.y-review')), false)
    assert.match(
      git(dir, 'notes', '--ref', LOCAL, 'show', 'HEAD'),
      new RegExp(stored.record.description ?? ''),
    )
    assert.ok(
      readdirSync(path.join(dir, '.git', 'y-review')).some((name) => name.startsWith('migrated-')),
    )
    assert.equal(made.said.length, 1, 'two parallel lookups move the folder once')
    assert.match(made.said[0] ?? '', /moved 1 review comment into the git notes/)
    assert.ok(changes.length >= 2)
    const anchor = await service.anchorOf(path.join(dir, 'notes', 'one.md'))
    assert.equal(anchor.kind === 'found' ? anchor.anchor.store : anchor.kind, 'git')
  })

  it('the editor read of a file of the repository also moves the folder store', async () => {
    const dir = plain()
    const service = new ReviewService(host([dir]).value)
    await service.addComment(
      await folderAnchor(service, dir),
      { startLine: 1, endLine: 1 },
      'Read.',
      false,
    )
    git(dir, 'init', '-q', '-b', 'main')
    configure(dir)
    git(dir, 'add', 'notes')
    git(dir, 'commit', '-q', '-m', 'init')
    const anchor = await service.anchorOf(path.join(dir, 'notes', 'one.md'))
    assert.equal(anchor.kind, 'found')
    assert.equal(existsSync(path.join(dir, '.y-review')), false)
    assert.deepEqual(
      anchor.kind === 'found'
        ? (await service.openAt(anchor.anchor)).map((e) => e.record.description)
        : [],
      ['Read.'],
    )
  })

  it('a lookup that may not write moves nothing', async () => {
    const dir = plain()
    const service = new ReviewService(host([dir]).value)
    await service.addComment(
      await folderAnchor(service, dir),
      { startLine: 1, endLine: 1 },
      'Stay.',
      false,
    )
    assert.deepEqual(await service.folderStoreRoots(false), [slashPath(dir)])
    git(dir, 'init', '-q', '-b', 'main')
    configure(dir)
    git(dir, 'add', 'notes')
    git(dir, 'commit', '-q', '-m', 'init')
    await service.folderStoreRoots(false)
    assert.ok(existsSync(path.join(dir, '.y-review')))
  })

  it('gives a folder store for each folder that holds records', async () => {
    const dir = plain()
    const service = new ReviewService(host([dir]).value)
    await service.addComment(
      await folderAnchor(service, dir),
      { startLine: 1, endLine: 1 },
      'Kept.',
      false,
    )
    const stores = await service.folderStores(false)
    assert.deepEqual(
      stores.map((entry) => entry.root),
      [slashPath(dir)],
    )
    assert.ok(stores[0]?.store instanceof FolderNotes)
    assert.equal((await stores[0]?.store.readLines(LOCAL, WORKTREE))?.length, 1)
  })

  it('a tracked review folder stays where it is', async () => {
    const dir = plain()
    const made = host([dir])
    const service = new ReviewService(made.value)
    await service.addComment(
      await folderAnchor(service, dir),
      { startLine: 1, endLine: 1 },
      'Tracked.',
      false,
    )
    git(dir, 'init', '-q', '-b', 'main')
    configure(dir)
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '-m', 'init')
    await service.folderStoreRoots(true)
    assert.ok(existsSync(path.join(dir, '.y-review')))
    assert.equal(git(dir, 'for-each-ref', 'refs/notes/'), '')
    assert.deepEqual(made.said, [])
  })

  it('a repository rooted above the workspace folder leaves its folder store in place', async () => {
    const outer = makeRepo()
    dirs.push(outer)
    const dir = path.join(outer, 'site')
    mkdirSync(path.join(dir, '.y-review', 'notes', 'refs-notes-y-review-local'), {
      recursive: true,
    })
    writeFileSync(
      path.join(dir, '.y-review', 'notes', 'refs-notes-y-review-local', 'worktree.jsonl'),
      '{"description":"x"}\n',
    )
    const service = new ReviewService(host([dir]).value)
    assert.deepEqual(await service.folderStoreRoots(true), [slashPath(dir)])
    assert.ok(existsSync(path.join(dir, '.y-review')))
  })

  it('anchors a diff side to its revision', async () => {
    const dir = makeRepo()
    dirs.push(dir)
    const service = new ReviewService(host([dir]).value)
    const head = git(dir, 'rev-parse', 'HEAD')
    assert.deepEqual(await service.anchorOfRevision(path.join(dir, 'src', 'a.txt'), 'HEAD'), {
      kind: 'found',
      anchor: { store: 'git', root: slashPath(dir), head, path: 'src/a.txt', dirty: false },
    })
    assert.deepEqual(await service.anchorOfRevision(path.join(dir, 'src', 'a.txt'), '~1'), {
      kind: 'noPlace',
      reason: NO_REVISION,
    })
    assert.deepEqual(await service.anchorOfRevision(path.join(dir, 'gone', 'x.txt'), 'HEAD'), {
      kind: 'noPlace',
      reason: NO_REVISION,
    })
  })

  it('a diff side outside every repository has no place', async () => {
    const dir = plain()
    assert.deepEqual(
      await new ReviewService(host([dir]).value).anchorOfRevision(
        path.join(dir, 'notes', 'one.md'),
        'HEAD',
      ),
      { kind: 'noPlace' },
    )
  })
})
