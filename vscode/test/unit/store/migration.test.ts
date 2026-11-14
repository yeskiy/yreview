import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { WORKTREE } from '../../../src/core/anchor'
import { NotesWriteError } from '../../../src/git/errors'
import { type NoteStore, NotesGateway } from '../../../src/git/notes'
import { ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { FOLDER, FolderNotes } from '../../../src/store/folderNotes'
import {
  copyFolder,
  mayMove,
  maySettle,
  migrationNotice,
  moveStoreFolder,
} from '../../../src/store/migration'
import { ALL_REFS, DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const NOW = 1_700_000_000
const FOLDER_ROOT = 'E:/Projects/site'
const bookOf = (store: NoteStore): CommentBook =>
  new CommentBook(
    store,
    () => Promise.resolve('a@b.c'),
    () => NOW,
  )

/** A store that takes a write and keeps nothing, which is what a failed note write looks like. */
const deaf: NoteStore = {
  readLines: () => Promise.resolve([]),
  readOrRefuse: () => Promise.resolve([]),
  append: () => Promise.resolve(),
  rewrite: () => Promise.resolve(),
  edit: () => Promise.resolve([]),
  commitsWithNotes: () => Promise.resolve([]),
  commitsOrRefuse: () => Promise.resolve([]),
}

/** A store that refuses every read that feeds a write, as a note the runner could not read does. */
const blind = (real: NoteStore): NoteStore => {
  const refuse = (commit: string): Promise<never> =>
    Promise.reject(
      new NotesWriteError(
        `The extension did not read the record of ${commit}, so it wrote no record.`,
      ),
    )
  return {
    readLines: (ref, commit) => real.readLines(ref, commit),
    readOrRefuse: (_ref, commit) => refuse(commit),
    append: (ref, commit, line) => real.append(ref, commit, line),
    rewrite: (ref, commit, lines) => real.rewrite(ref, commit, lines),
    edit: (_ref, commit) => refuse(commit),
    commitsWithNotes: (ref) => real.commitsWithNotes(ref),
    commitsOrRefuse: (ref) => real.commitsOrRefuse(ref),
  }
}

describe('folder migration', function migration() {
  this.timeout(240_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const setup = () => {
    const folder = scratchDir()
    const repo = makeRepo()
    dirs.push(folder, repo)
    return {
      folder: new FolderNotes(folder),
      folderRoot: folder,
      repo,
      notes: new NotesGateway(new ProcessGitRunner(repo)),
      head: git(repo, 'rev-parse', 'HEAD'),
    }
  }

  it('every record reaches the note and keeps its id', async () => {
    const { folder, notes, head } = setup()
    const first = await bookOf(folder).add(
      LOCAL,
      WORKTREE,
      'a.kt',
      { startLine: 1, endLine: 1 },
      'one',
    )
    const second = await bookOf(folder).add(
      LOCAL,
      WORKTREE,
      'a.kt',
      { startLine: 2, endLine: 2 },
      'two',
    )
    const report = await copyFolder(folder, notes, ALL_REFS, head)
    assert.deepEqual(report, { moved: 2 })
    assert.deepEqual(
      new Set((await bookOf(notes).list(head)).map((entry) => entry.id)),
      new Set([first.id, second.id]),
    )
  })

  it('a second run adds no duplicate', async () => {
    const { folder, notes, head } = setup()
    await bookOf(folder).add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    await copyFolder(folder, notes, ALL_REFS, head)
    assert.deepEqual(await copyFolder(folder, notes, ALL_REFS, head), { moved: 0 })
    assert.equal((await bookOf(notes).list(head)).length, 1)
  })

  it('the ref of each record stays what it was', async () => {
    const { folder, notes, head } = setup()
    await bookOf(folder).add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'local one')
    await bookOf(folder).add(DISCUSS, WORKTREE, 'a.kt', { startLine: 2, endLine: 2 }, 'shared one')
    await copyFolder(folder, notes, ALL_REFS, head)
    assert.deepEqual(
      (await bookOf(notes).list(head, [LOCAL])).map((e) => e.record.description),
      ['local one'],
    )
    assert.deepEqual(
      (await bookOf(notes).list(head, [DISCUSS])).map((e) => e.record.description),
      ['shared one'],
    )
  })

  it('a resolve record keeps its target after the move', async () => {
    const { folder, notes, head } = setup()
    const stored = await bookOf(folder).add(
      LOCAL,
      WORKTREE,
      'a.kt',
      { startLine: 1, endLine: 1 },
      'one',
    )
    await bookOf(folder).resolve(stored)
    await copyFolder(folder, notes, ALL_REFS, head)
    assert.deepEqual(await bookOf(notes).open(head), [])
    assert.deepEqual(
      (await bookOf(notes).closed(head)).map((entry) => entry.id),
      [stored.id],
    )
  })

  it('a target that keeps no line reports a problem', async () => {
    const { folder } = setup()
    await bookOf(folder).add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    assert.deepEqual(await copyFolder(folder, deaf, ALL_REFS, 'deadbeef'), {
      moved: 0,
      problem: `The note of ${LOCAL} did not take 1 record line.`,
    })
  })

  it('the copy leaves the folder untouched, so a crash before the move loses nothing', async () => {
    const { folder, notes, head } = setup()
    const stored = await bookOf(folder).add(
      LOCAL,
      WORKTREE,
      'a.kt',
      { startLine: 1, endLine: 1 },
      'one',
    )
    await copyFolder(folder, notes, ALL_REFS, head)
    assert.deepEqual(
      (await bookOf(folder).list(WORKTREE)).map((e) => e.id),
      [stored.id],
    )
    assert.deepEqual(
      (await bookOf(notes).list(head)).map((e) => e.id),
      [stored.id],
    )
  })

  it('an empty folder store reports nothing to move', async () => {
    const { folder, notes, head } = setup()
    assert.deepEqual(await copyFolder(folder, notes, ALL_REFS, head), { moved: 0 })
  })

  it('a source the extension cannot read reports a problem and moves nothing', async () => {
    const { folder, notes, head } = setup()
    await bookOf(folder).add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    const report = await copyFolder(blind(folder), notes, ALL_REFS, head)
    assert.equal(report.moved, 0)
    assert.notEqual(
      report.problem,
      undefined,
      'a read the extension cannot trust must stop the move',
    )
    assert.deepEqual(await bookOf(notes).list(head), [])
  })

  it('a target the extension cannot read reports a problem and writes no duplicate', async () => {
    const { folder, notes, head } = setup()
    await bookOf(folder).add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    const report = await copyFolder(folder, blind(notes), ALL_REFS, head)
    assert.equal(report.moved, 0)
    assert.notEqual(report.problem, undefined)
    assert.deepEqual(await bookOf(notes).list(head), [])
  })

  it('a repository rooted at the folder may take the records', () => {
    assert.equal(maySettle(FOLDER_ROOT, FOLDER_ROOT), true)
  })

  it('a repository rooted above the folder may not take the records', () => {
    assert.equal(maySettle(FOLDER_ROOT, `${FOLDER_ROOT}/api`), false)
  })

  it('a repository beside the folder may not take the records', () => {
    assert.equal(maySettle('E:/Projects/other', FOLDER_ROOT), false)
  })

  it('a lookup that may write moves the records', () => {
    assert.equal(mayMove(true, FOLDER_ROOT, FOLDER_ROOT), true)
  })

  it('a lookup that may not write leaves the records where they are', () => {
    assert.equal(mayMove(false, FOLDER_ROOT, FOLDER_ROOT), false)
  })

  it('a lookup that may write still asks where the repository is rooted', () => {
    assert.equal(mayMove(true, FOLDER_ROOT, `${FOLDER_ROOT}/api`), false)
  })

  it('a copy that failed warns and asks for no new read', () => {
    const notice = migrationNotice(
      { moved: 0, problem: 'The note of x did not take 1 record line.' },
      FOLDER_ROOT,
      'site',
      undefined,
    )
    assert.equal(notice.warning, true)
    assert.equal(notice.refresh, false)
    assert.match(notice.text, /did not take 1 record line/)
  })

  it('a copy whose folder stays warns and names the folder', () => {
    const notice = migrationNotice({ moved: 2 }, FOLDER_ROOT, 'site', undefined)
    assert.equal(notice.warning, true, 'the user must read that the old folder is still there')
    assert.equal(
      notice.refresh,
      true,
      'the records sit in the git notes, so every reader reads them again',
    )
    assert.ok(notice.text.includes(path.join(FOLDER_ROOT, FOLDER)), notice.text)
  })

  it('a copy that moved the folder says where the folder went', () => {
    const kept = path.join(FOLDER_ROOT, '.git', 'y-review', 'migrated-1')
    const notice = migrationNotice({ moved: 2 }, FOLDER_ROOT, 'site', kept)
    assert.equal(notice.warning, false)
    assert.equal(notice.refresh, true)
    assert.ok(notice.text.includes('2 review comments'), notice.text)
    assert.ok(notice.text.includes(kept), notice.text)
  })

  it('moves the store folder into the git directory', async () => {
    const { folder, folderRoot, repo } = setup()
    await bookOf(folder).add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    const target = path.join(repo, '.git', 'y-review', 'migrated-1')
    assert.equal(await moveStoreFolder(folderRoot, target), true)
    assert.equal(existsSync(path.join(folderRoot, FOLDER)), false)
    assert.deepEqual(readdirSync(path.join(target, 'notes')), ['refs-notes-y-review-local'])
  })

  it('a move that fails leaves the folder and answers false', async () => {
    const { folderRoot } = setup()
    mkdirSync(path.join(folderRoot, FOLDER))
    const busy = path.join(folderRoot, 'busy')
    mkdirSync(path.join(busy, 'full'), { recursive: true })
    assert.equal(await moveStoreFolder(folderRoot, busy), false)
    assert.equal(existsSync(path.join(folderRoot, FOLDER)), true)
  })
})
