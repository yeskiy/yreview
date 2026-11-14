import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { type NoteStore, NotesGateway } from '../../../src/git/notes'
import {
  DID_NOT_START,
  type GitResult,
  type GitRunner,
  ProcessGitRunner,
} from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { ALL_REFS, LOCAL } from '../../../src/store/noteRefs'
import { forgetNotes, readNotes } from '../../../src/tasks/noteScan'
import { git, makeRepo, removeDir, scratchDir } from '../../fixtures/scratch'

const counting = (inner: GitRunner, answer?: GitResult) => {
  const counter = { runs: 0 }
  const runner: GitRunner = {
    run: (args, signal) => {
      counter.runs += 1
      return answer === undefined ? inner.run(args, signal) : Promise.resolve(answer)
    },
  }
  return { counter, runner }
}

const bookOf = (dir: string): CommentBook =>
  new CommentBook(new NotesGateway(new ProcessGitRunner(dir)), () =>
    Promise.resolve('reviewer@example.com'),
  )

const line = (n: number) => ({ startLine: n, endLine: n })

/** Commits one file for each index and writes two comments on it. Every third first comment is resolved. */
const reviewed = async (dir: string, commits: number): Promise<void> => {
  const book = bookOf(dir)
  await Array.from({ length: commits }, (_, i) => i + 1).reduce(async (before, index) => {
    await before
    writeFileSync(path.join(dir, `f${index}.txt`), `line ${index}\n`)
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', `commit ${index}`)
    const commit = git(dir, 'rev-parse', 'HEAD')
    const ref = ALL_REFS[index % ALL_REFS.length] ?? LOCAL
    const first = await book.add(ref, commit, `f${index}.txt`, line(1), `first ${index}: "quoted"`)
    await book.add(ref, commit, `f${index}.txt`, line(1), `second ${index}`)
    if (index % 3 === 0) await book.resolve(first)
  }, Promise.resolve())
}

/** The snapshot holds the same notes as a read of each note through the gateway. */
const assertSameNotes = async (snapshot: NoteStore | undefined, dir: string): Promise<void> => {
  assert.ok(snapshot)
  const gateway = new NotesGateway(new ProcessGitRunner(dir))
  await Promise.all(
    ALL_REFS.map(async (ref) => {
      const commits = [...(await gateway.commitsWithNotes(ref))].sort()
      assert.deepEqual([...(await snapshot.commitsWithNotes(ref))].sort(), commits)
      await Promise.all(
        commits.map(async (commit) =>
          assert.deepEqual(
            await snapshot.readLines(ref, commit),
            await gateway.readLines(ref, commit),
          ),
        ),
      )
    }),
  )
}

describe('noteScan', function noteScan() {
  // The setup writes 36 records through the gateway, which is slow on Windows.
  this.timeout(600_000)
  const dirs: string[] = []
  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return dir
  }
  const shared = { dir: '' }

  before(async () => {
    shared.dir = repo()
    await reviewed(shared.dir, 12)
  })

  after(() => dirs.forEach(removeDir))

  beforeEach(() => forgetNotes())

  it('reads every note of a repository in two git processes', async () => {
    await ['#a', '#b'].reduce(async (before, key) => {
      await before
      const { counter, runner } = counting(new ProcessGitRunner(shared.dir))
      const snapshot = await readNotes(runner, shared.dir + key)
      assert.equal(counter.runs, 2, `the scan of the root key ${key}`)
      await assertSameNotes(snapshot, shared.dir)
    }, Promise.resolve())
  })

  it('reads the notes again only after a ref moved', async () => {
    const dir = repo()
    await reviewed(dir, 4)
    const root = `${dir}#moved`
    await readNotes(new ProcessGitRunner(dir), root)

    const unchanged = counting(new ProcessGitRunner(dir))
    await assertSameNotes(await readNotes(unchanged.runner, root), dir)
    assert.equal(unchanged.counter.runs, 1)

    const head = git(dir, 'rev-parse', 'HEAD')
    await bookOf(dir).add(LOCAL, head, 'new.txt', line(2), 'a new note')
    const moved = counting(new ProcessGitRunner(dir))
    const snapshot = await readNotes(moved.runner, root)
    assert.equal(moved.counter.runs, 2)
    await assertSameNotes(snapshot, dir)
    assert.ok((await snapshot?.readLines(LOCAL, head))?.some((l) => l.includes('a new note')))
  })

  it('stops between the git steps when the scan is canceled', async () => {
    const inner = new ProcessGitRunner(shared.dir)
    const controller = new AbortController()
    const counter = { runs: 0 }
    const runner: GitRunner = {
      run: async (args, signal) => {
        counter.runs += 1
        const result = await inner.run(args, signal)
        controller.abort()
        return result
      },
    }
    await assert.rejects(readNotes(runner, `${shared.dir}#canceled`, ALL_REFS, controller.signal))
    assert.equal(counter.runs, 1)
  })

  it('reads a repository with no review note in one process', async () => {
    const dir = repo()
    const { counter, runner } = counting(new ProcessGitRunner(dir))
    const snapshot = await readNotes(runner, `${dir}#empty`)
    assert.equal(counter.runs, 1)
    await Promise.all(
      ALL_REFS.map(async (ref) => assert.deepEqual(await snapshot?.commitsWithNotes(ref), [])),
    )
  })

  it('gives no answer when git does not start, so the caller reads the slow way', async () => {
    const never: GitRunner = { run: () => Promise.reject(new Error('never runs')) }
    const { counter, runner } = counting(never, {
      exitCode: DID_NOT_START,
      stdout: '',
      stderr: 'no git',
    })
    assert.equal(await readNotes(runner, 'nowhere'), undefined)
    assert.equal(counter.runs, 1)
  })

  it('reads a note with CRLF line ends as the gateway reads it', async () => {
    const dir = repo()
    const scratch = scratchDir()
    dirs.push(scratch)
    const file = path.join(scratch, 'note.txt')
    writeFileSync(
      file,
      '{"timestamp":"1","author":"a@b.c","description":"x"}\r\n\r\n' +
        '{"timestamp":"2","author":"a@b.c","description":"y"}\r\n',
    )
    git(dir, 'notes', '--ref', LOCAL, 'add', '-f', '-F', file, 'HEAD')
    const head = git(dir, 'rev-parse', 'HEAD')
    const snapshot = await readNotes(new ProcessGitRunner(dir), `${dir}#crlf`)
    const lines = await snapshot?.readLines(LOCAL, head)
    assert.deepEqual(
      lines,
      await new NotesGateway(new ProcessGitRunner(dir)).readLines(LOCAL, head),
    )
    assert.equal(lines?.length, 2)
  })

  it('refuses a tip that is not an object id', async () => {
    const fake: GitRunner = {
      run: (args) =>
        Promise.resolve(
          args[0] === 'for-each-ref'
            ? { exitCode: 0, stdout: 'xyz\trefs/notes/y-review/local\n', stderr: '' }
            : { exitCode: 1, stdout: '', stderr: '' },
        ),
    }
    const snapshot = await readNotes(fake, 'nowhere#bad-tip')
    assert.deepEqual(await snapshot?.commitsWithNotes(LOCAL), [])
  })
})
