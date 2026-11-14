import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { WORKTREE } from '../../../src/core/anchor'
import { encodeRecord } from '../../../src/core/record'
import { todoId } from '../../../src/core/taskIds'
import { NotesGateway } from '../../../src/git/notes'
import { type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { ALL_REFS, DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import type { ScanRecord } from '../../../src/tasks/commentTask'
import { forgetNotes, noAuthor } from '../../../src/tasks/noteScan'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import {
  type RepositoryTasks,
  type ScanInput,
  gitRecords,
  recordsOf,
  scanProject,
  scanRepository,
  withOverlays,
} from '../../../src/tasks/taskScan'
import { DEFAULT_PATTERNS, compilePatterns } from '../../../src/tasks/todoPatterns'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const defaults = compilePatterns(DEFAULT_PATTERNS).patterns
const slash = (value: string): string => value.replaceAll('\\', '/')
const line = (n: number) => ({ startLine: n, endLine: n })

const input = (dir: string, change: Partial<ScanInput> = {}): ScanInput => ({
  gitPath: 'git',
  roots: [dir],
  basePathOf: () => dir,
  patterns: defaults,
  unshared: () => false,
  ...change,
})

const bookOf = (dir: string): CommentBook =>
  new CommentBook(new NotesGateway(new ProcessGitRunner(dir)), () =>
    Promise.resolve('reviewer@example.com'),
  )

const commit = (dir: string, name: string, content: string): string => {
  mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
  writeFileSync(path.join(dir, name), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', `add ${name}`)
  return git(dir, 'rev-parse', 'HEAD')
}

const ofKind = (repo: RepositoryTasks | undefined, kind: ReviewTask['kind']): ReviewTask[] =>
  (repo?.tasks ?? []).filter((task) => task.kind === kind)

const byId = (records: readonly ScanRecord[]): readonly ScanRecord[] =>
  [...records].sort((a, b) => a.stored.id.localeCompare(b.stored.id))

const counting = (inner: GitRunner) => {
  const calls: (readonly string[])[] = []
  const runner: GitRunner = {
    run: (args, signal) => {
      calls.push(args)
      return inner.run(args, signal)
    },
  }
  return { calls, runner }
}

describe('taskScan', function taskScan() {
  this.timeout(120_000)
  const dirs: string[] = []
  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return slash(dir)
  }
  const shared = { dir: '', head: '', found: [] as readonly RepositoryTasks[] }

  before(async () => {
    shared.dir = repo()
    shared.head = commit(shared.dir, 'src/t.ts', '// TODO: one\n')
    await bookOf(shared.dir).add(LOCAL, shared.head, 'src/a.txt', line(1), 'a local comment')
    shared.found = [await scanRepository(input(shared.dir), shared.dir)]
  })

  beforeEach(() => forgetNotes())

  after(() => dirs.forEach(removeDir))

  it('gives the comments and the TODO items of a repository', async () => {
    const [found] = shared.found
    assert.equal(found?.commit, shared.head)
    const [comment, ...moreComments] = ofKind(found, 'comment')
    assert.deepEqual(moreComments, [])
    assert.equal(comment?.state, 'local')
    assert.equal(comment?.revision, shared.head)
    const [todo, ...moreTodos] = ofKind(found, 'todo')
    assert.deepEqual(moreTodos, [])
    assert.equal(todo?.text, 'TODO: one')
    assert.equal(todo?.pattern, 'TODO')
    assert.equal(todo?.patternRule, '\\btodo\\b.*')
    assert.equal(todo?.id, todoId('', 'src/t.ts', 'TODO: one', 0))
    assert.equal(todo?.revision, shared.head)
    assert.equal(todo?.filePath, `${shared.dir}/src/t.ts`)
  })

  it('names the working tree in a repository with no commit', async () => {
    const raw = scratchDir()
    dirs.push(raw)
    const dir = slash(raw)
    git(raw, 'init', '-q', '-b', 'main')
    writeFileSync(path.join(raw, 'a.ts'), '// TODO: x\n')
    const found = await scanRepository(input(dir), dir)
    assert.equal(found.commit, WORKTREE)
    assert.deepEqual(
      found.tasks.map((task) => [task.kind, task.text, task.revision]),
      [['todo', 'TODO: x', WORKTREE]],
    )
  })

  it('gives a resolved comment with the resolved flag', async () => {
    const dir = repo()
    const head = git(dir, 'rev-parse', 'HEAD')
    const book = bookOf(dir)
    await book.resolve(await book.add(LOCAL, head, 'src/a.txt', line(1), 'done'))
    const comments = ofKind(await scanRepository(input(dir), dir), 'comment')
    assert.deepEqual(
      comments.map((task) => [task.resolved, task.state]),
      [[true, 'resolved']],
    )
  })

  it('gives the not shared word to a comment whose push failed', async () => {
    const dir = repo()
    const head = git(dir, 'rev-parse', 'HEAD')
    const stored = await bookOf(dir).add(DISCUSS, head, 'src/a.txt', line(2), 'shared')
    const comments = ofKind(
      await scanRepository(input(dir, { unshared: (id) => id === stored.id }), dir),
      'comment',
    )
    assert.deepEqual(
      comments.map((task) => task.state),
      ['not shared'],
    )
  })

  it('gives no task for a note path that leaves the root', async () => {
    const dir = repo()
    const head = git(dir, 'rev-parse', 'HEAD')
    await new NotesGateway(new ProcessGitRunner(dir)).append(
      LOCAL,
      head,
      encodeRecord({
        timestamp: '1',
        author: 'reviewer@example.com',
        description: 'outside',
        location: { commit: head, path: '../out.txt', range: line(1) },
      }),
    )
    assert.deepEqual(ofKind(await scanRepository(input(dir), dir), 'comment'), [])
  })

  it('gives a TODO item of a nested repository to the inner root only', async () => {
    const outer = repo()
    commit(outer, 'inner/t.ts', '// TODO: inner\n')
    const inner = slash(makeRepo(path.join(outer, 'inner')))
    const [outerTasks, innerTasks] = await scanProject(
      input(outer, { roots: [outer, inner], basePathOf: () => outer }),
    )
    assert.equal(outerTasks?.root, outer)
    assert.deepEqual(ofKind(outerTasks, 'todo'), [])
    assert.equal(innerTasks?.root, inner)
    assert.deepEqual(
      ofKind(innerTasks, 'todo').map((task) => [task.path, task.text]),
      [['t.ts', 'TODO: inner']],
    )
  })

  it('reads the same records from git as the slow read', async () => {
    const dir = repo()
    const book = bookOf(dir)
    await [1, 2, 3, 4].reduce(async (before, index) => {
      await before
      const head = commit(dir, `f${index}.txt`, `line ${index}\n`)
      await Promise.all(
        ALL_REFS.map(async (ref) => {
          const stored = await book.add(ref, head, `f${index}.txt`, line(1), `${ref} ${index}`)
          if (index % 2 === 0) await book.resolve(stored)
        }),
      )
    }, Promise.resolve())
    const runner = new ProcessGitRunner(dir)
    const fast = byId(await gitRecords(runner, dir))
    assert.equal(fast.length, 12)
    assert.deepEqual(
      fast,
      byId(await recordsOf(new CommentBook(new NotesGateway(runner), noAuthor))),
    )
  })

  it('reads the notes once for two scans', async () => {
    const { calls, runner } = counting(new ProcessGitRunner(shared.dir))
    await gitRecords(runner, shared.dir)
    const first = calls.length
    await gitRecords(runner, shared.dir)
    assert.deepEqual(
      calls.slice(first).map((args) => args[0]),
      ['for-each-ref'],
    )
  })

  it('fails the scan when git does not start', async () => {
    await assert.rejects(scanProject(input(shared.dir, { gitPath: 'no-such-git' })))
  })

  it('stops an aborted scan', async () => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(scanProject(input(shared.dir, { signal: controller.signal })), {
      name: 'AbortError',
    })
  })

  it('puts the TODO items of a dirty document in place of the items on the disk', () => {
    const file = `${shared.dir}/src/t.ts`
    const [repoTasks] = withOverlays(
      shared.found,
      new Map([[file, '// TODO: two\n']]),
      defaults,
      [shared.dir],
      () => shared.dir,
    )
    assert.deepEqual(
      ofKind(repoTasks, 'todo').map((task) => [task.text, task.filePath, task.path, task.id]),
      [['TODO: two', file, 'src/t.ts', todoId('', 'src/t.ts', 'TODO: two', 0)]],
    )
    assert.deepEqual(ofKind(repoTasks, 'comment'), ofKind(shared.found[0], 'comment'))
  })

  it('changes nothing for an overlay outside the root', () => {
    assert.deepEqual(
      withOverlays(
        shared.found,
        new Map([['E:/elsewhere/a.ts', '// TODO: x']]),
        defaults,
        [shared.dir],
        () => shared.dir,
      ),
      shared.found,
    )
  })
})
