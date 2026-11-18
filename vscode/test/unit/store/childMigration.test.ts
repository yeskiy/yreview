import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'

import { slashPath } from '../../../src/core/anchor'
import { decodeRecord } from '../../../src/core/record'
import { rewriteRecords } from '../../../src/store/migration'
import { LOCAL } from '../../../src/store/noteRefs'
import { type Anchor, ReviewService, type ServiceHost } from '../../../src/store/reviewService'
import { ShareLog } from '../../../src/store/shareLog'
import { DEFAULT_PATTERNS, compilePatterns } from '../../../src/tasks/todoPatterns'
import { scanProject } from '../../../src/tasks/taskScan'
import { git, removeDir, scratchDir } from '../../fixtures/scratch'

const STORE_FILE = path.join('.y-review', 'notes', 'refs-notes-y-review-local', 'worktree.jsonl')

const host = (folders: readonly string[]) => {
  const said: string[] = []
  const warnings: string[] = []
  const value: ServiceHost = {
    gitPath: () => 'git',
    settings: () => ({ remote: 'origin', writeRefspec: false }),
    askRefspec: () => Promise.resolve(undefined),
    declinedRoots: () => [],
    saveDeclinedRoots: () => Promise.resolve(),
    workspaceFolders: () => folders,
    home: () => undefined,
    toldFolders: () => [],
    saveToldFolders: () => Promise.resolve(),
    say: (message) => {
      said.push(message)
    },
    warn: (message) => {
      warnings.push(message)
    },
  }
  return { value, said, warnings }
}

const commitAll = (dir: string, paths: readonly string[]): void => {
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'reviewer@example.com')
  git(dir, 'config', 'user.name', 'Reviewer')
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'add', ...paths)
  git(dir, 'commit', '-q', '-m', 'init')
}

const noteLines = (dir: string): readonly string[] =>
  git(dir, 'notes', '--ref', LOCAL, 'show', 'HEAD')
    .split('\n')
    .filter((line) => line !== '')

const migratedFolders = (dir: string): readonly string[] => {
  const folder = path.join(dir, '.git', 'y-review')
  return existsSync(folder)
    ? readdirSync(folder).filter((name) => name.startsWith('migrated-'))
    : []
}

/** The count of the git processes that `work` starts and that list untracked files. */
const othersCalls = async <T>(work: () => Promise<T>): Promise<number> => {
  const { spawn } = childProcess
  const seen = { calls: 0 }
  const counting = ((...args: Parameters<typeof spawn>) => {
    const list = Array.isArray(args[1]) ? (args[1] as readonly string[]) : []
    if (list.includes('ls-files') && list.includes('--others')) seen.calls += 1
    return spawn(...args)
  }) as typeof spawn
  Object.assign(childProcess, { spawn: counting })
  syncBuiltinESMExports()
  try {
    await work()
    return seen.calls
  } finally {
    Object.assign(childProcess, { spawn })
    syncBuiltinESMExports()
  }
}

describe('migration of a child folder store', function childMigration() {
  this.timeout(240_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))

  const anchorAt = async (service: ReviewService, file: string): Promise<Anchor> => {
    const result = await service.anchorOf(file)
    return result.kind === 'found' ? result.anchor : assert.fail(`no anchor: ${result.kind}`)
  }

  /** A loose folder with a resolved comment in the store of `sub`, before git init. */
  const looseFolder = async (shareLog = new ShareLog()) => {
    const dir = realpathSync.native(scratchDir())
    dirs.push(dir)
    mkdirSync(path.join(dir, 'sub'))
    writeFileSync(path.join(dir, 'sub', 'f.txt'), 'one\ntwo\n')
    const made = host([])
    const service = new ReviewService(made.value, shareLog)
    const anchor = await anchorAt(service, path.join(dir, 'sub', 'f.txt'))
    assert.equal(anchor.root, slashPath(path.join(dir, 'sub')))
    const { stored } = await service.addComment(
      anchor,
      { startLine: 1, endLine: 1 },
      'Move me.',
      false,
    )
    await service.resolve(anchor, stored.id)
    const before = readFileSync(path.join(dir, 'sub', STORE_FILE), 'utf8')
    return { dir, made, service, shareLog, oldId: stored.id, before }
  }

  it('moves the store into the git notes with new paths and new identifiers', async () => {
    const { dir, service, before } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    await service.settleRepository(dir)
    const lines = noteLines(dir)
    assert.equal(lines.length, 2)
    assert.ok(lines.map(decodeRecord).every((record) => record?.location?.path === 'sub/f.txt'))
    assert.deepEqual(
      lines,
      rewriteRecords(
        before.split('\n').filter((line) => line !== ''),
        'sub',
      ).lines,
    )
  })

  it('the resolve record names the new identifier, so the comment reads as closed', async () => {
    const { dir, service, oldId, before } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    await service.settleRepository(dir)
    const newId = rewriteRecords(before.split('\n').filter(Boolean), 'sub').renames.get(oldId)
    assert.ok(newId !== undefined && newId !== oldId)
    assert.ok(
      noteLines(dir)
        .map(decodeRecord)
        .some((record) => record?.original === newId),
    )
    const anchor = await anchorAt(service, path.join(dir, 'sub', 'f.txt'))
    assert.equal(anchor.store, 'git')
    assert.deepEqual(await service.openAt(anchor), [])
  })

  it('moves the old folder into the git dir and keeps every byte', async () => {
    const { dir, service, before } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    await service.settleRepository(dir)
    assert.equal(existsSync(path.join(dir, 'sub', '.y-review')), false)
    const [moved] = migratedFolders(dir)
    assert.match(moved ?? '', /^migrated-\d+-0$/)
    assert.equal(
      readFileSync(
        path.join(
          dir,
          '.git',
          'y-review',
          moved ?? '',
          'notes',
          'refs-notes-y-review-local',
          'worktree.jsonl',
        ),
        'utf8',
      ),
      before,
    )
  })

  it('the share log forwards the old identifier to the new identifier', async () => {
    const { dir, service, shareLog, oldId, before } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    await service.settleRepository(dir)
    assert.equal(
      shareLog.forward(oldId),
      rewriteRecords(before.split('\n').filter(Boolean), 'sub').renames.get(oldId),
    )
  })

  it('a second settle writes nothing and moves nothing', async () => {
    const { dir, made, service } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    await service.settleRepository(dir)
    const notes = noteLines(dir)
    const said = made.said.length
    await service.settleRepository(dir)
    assert.deepEqual(noteLines(dir), notes)
    assert.equal(migratedFolders(dir).length, 1)
    assert.equal(made.said.length, said)
  })

  it('a store at the repository root copies byte for byte and keeps its identifiers', async () => {
    const dir = realpathSync.native(scratchDir())
    dirs.push(dir)
    writeFileSync(path.join(dir, 'f.txt'), 'one\n')
    const shareLog = new ShareLog()
    const service = new ReviewService(host([dir]).value, shareLog)
    const { stored } = await service.addComment(
      await anchorAt(service, path.join(dir, 'f.txt')),
      { startLine: 1, endLine: 1 },
      'Root.',
      false,
    )
    const before = readFileSync(path.join(dir, STORE_FILE), 'utf8')
    commitAll(dir, ['f.txt'])
    await service.settleRepository(dir)
    assert.equal(`${noteLines(dir).join('\n')}\n`, before)
    assert.equal(shareLog.forward(stored.id), stored.id)
    assert.equal(existsSync(path.join(dir, '.y-review')), false)
  })

  it('a note write that fails keeps the folder, writes no rename and warns', async () => {
    const { dir, made, service, shareLog, oldId } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    // A lock file of the notes ref makes every note write of git fail.
    mkdirSync(path.join(dir, '.git', 'refs', 'notes', 'y-review'), { recursive: true })
    writeFileSync(path.join(dir, '.git', 'refs', 'notes', 'y-review', 'local.lock'), '')
    await service.settleRepository(dir)
    assert.ok(existsSync(path.join(dir, 'sub', STORE_FILE)))
    assert.equal(shareLog.forward(oldId), oldId)
    assert.equal(made.warnings.length, 1)
    assert.match(made.warnings[0] ?? '', /did not move the review comments of sub/)
    const anchor = await anchorAt(service, path.join(dir, 'sub', 'f.txt'))
    assert.equal(anchor.store, 'git')
    const leftover = await service.leftoverOf(anchor, path.join(dir, 'sub', 'f.txt'))
    assert.deepEqual(leftover, {
      store: 'folder',
      root: slashPath(path.join(dir, 'sub')),
      head: 'worktree',
      path: 'f.txt',
    })
    assert.ok((await service.folderStoreRoots(false)).includes(slashPath(path.join(dir, 'sub'))))
  })

  it('a repository with no commit moves nothing, and the file keeps its folder anchor', async () => {
    const { dir, service } = await looseFolder()
    git(dir, 'init', '-q', '-b', 'main')
    await service.settleRepository(dir)
    assert.ok(existsSync(path.join(dir, 'sub', STORE_FILE)))
    const anchor = await anchorAt(service, path.join(dir, 'sub', 'f.txt'))
    assert.equal(anchor.store, 'folder')
    assert.equal(anchor.root, slashPath(path.join(dir, 'sub')))
  })

  it('a tracked store does not move and is no leftover', async () => {
    const { dir, made, service } = await looseFolder()
    commitAll(dir, ['sub'])
    await service.settleRepository(dir)
    assert.ok(existsSync(path.join(dir, 'sub', STORE_FILE)))
    assert.equal(git(dir, 'for-each-ref', 'refs/notes/'), '')
    assert.deepEqual(made.said, [])
    const file = path.join(dir, 'sub', 'f.txt')
    assert.equal(await service.leftoverOf(await anchorAt(service, file), file), undefined)
  })

  it('settles a store of an open file without a search of the repository', async () => {
    const { dir, service } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    assert.equal(await othersCalls(() => service.settleFile(path.join(dir, 'sub', 'f.txt'))), 0)
    assert.equal(existsSync(path.join(dir, 'sub', '.y-review')), false)
    assert.equal(noteLines(dir).length, 2)
  })

  it('the task scan runs no search for child stores', async () => {
    const { dir, service } = await looseFolder()
    commitAll(dir, ['sub/f.txt'])
    const root = slashPath(dir)
    const calls = await othersCalls(async () =>
      scanProject({
        gitPath: 'git',
        roots: [root],
        basePathOf: () => root,
        patterns: compilePatterns(DEFAULT_PATTERNS).patterns,
        unshared: () => false,
        folderStores: await service.folderStores(true),
      }),
    )
    assert.equal(calls, 0)
  })
})
