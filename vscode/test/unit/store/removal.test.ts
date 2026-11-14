import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { NotesWriteError } from '../../../src/git/errors'
import { NotesGateway } from '../../../src/git/notes'
import { type GitRunner, ProcessGitRunner, TOO_MUCH_OUTPUT } from '../../../src/git/runner'
import { CommentBook, type StoredComment } from '../../../src/store/commentBook'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

/** A runner that refuses to read a note, the way the real one refuses an over-large stream. */
const refusesTheNote = (real: GitRunner): GitRunner => ({
  run: (args, signal) =>
    args[0] === 'notes' && args.includes('show')
      ? Promise.resolve({ exitCode: TOO_MUCH_OUTPUT, stdout: '', stderr: '' })
      : real.run(args, signal),
})

const line = (n: number) => ({ startLine: n, endLine: n })

describe('CommentBook removal', function removal() {
  this.timeout(120_000)
  const repos: string[] = []
  after(() => repos.forEach(removeDir))

  const fresh = () => {
    const repo = makeRepo()
    repos.push(repo)
    const runner = new ProcessGitRunner(repo)
    const commit = (file: string, text: string): string => {
      writeFileSync(path.join(repo, file), text)
      git(repo, 'add', file)
      git(repo, 'commit', '-q', '-m', file)
      return git(repo, 'rev-parse', 'HEAD')
    }
    return {
      runner,
      commit,
      head: commit('a.kt', 'one'),
      book: () =>
        new CommentBook(
          new NotesGateway(runner),
          () => Promise.resolve('reviewer@example.com'),
          () => 1787194427,
        ),
      lines: (commitId: string, ref: string = LOCAL) =>
        new NotesGateway(runner).readLines(ref, commitId),
      noted: (ref: string = LOCAL) => new NotesGateway(runner).commitsWithNotes(ref),
    }
  }

  it('a delete of one comment keeps the others byte for byte', async () => {
    const { head, book, lines } = fresh()
    const first = await book().add(LOCAL, head, 'a.kt', line(1), 'keep this one')
    const second = await book().add(LOCAL, head, 'a.kt', line(2), 'delete this one')
    const third = await book().add(LOCAL, head, 'a.kt', line(3), 'keep this one too')
    const before = await lines(head)
    assert.equal(await book().remove([second]), 1)
    assert.deepEqual(await lines(head), [before[0], before[2]])
    assert.deepEqual(
      new Set((await book().list(head)).map((s) => s.id)),
      new Set([first.id, third.id]),
    )
  })

  it('a delete leaves the note ref valid', async () => {
    const { head, book, noted } = fresh()
    await book().add(LOCAL, head, 'a.kt', line(1), 'keep this one')
    const second = await book().add(LOCAL, head, 'a.kt', line(2), 'delete this one')
    await book().remove([second])
    assert.deepEqual(await noted(), [head])
    assert.equal((await book().open(head)).length, 1)
  })

  it('a delete of the last comment removes the note and keeps the ref readable', async () => {
    const { head, book, lines, noted } = fresh()
    const only = await book().add(LOCAL, head, 'a.kt', line(1), 'the only one')
    assert.equal(await book().remove([only]), 1)
    assert.deepEqual(await lines(head), [])
    assert.deepEqual(await noted(), [])
  })

  it('a delete takes the resolve record of that comment with it', async () => {
    const { head, book, lines } = fresh()
    const first = await book().add(LOCAL, head, 'a.kt', line(1), 'resolve me')
    await book().resolve(first)
    assert.equal((await lines(head)).length, 2)
    assert.equal(await book().remove([first]), 2)
    assert.deepEqual(await book().list(head), [])
  })

  it('a delete keeps the comments of another commit', async () => {
    const { head, commit, book, lines, noted } = fresh()
    const second = commit('b.kt', 'two')
    const gone = await book().add(LOCAL, head, 'a.kt', line(1), 'delete this one')
    await book().add(LOCAL, second, 'b.kt', line(1), 'keep this one')
    const kept = await lines(second)
    await book().remove([gone])
    assert.deepEqual(await lines(second), kept)
    assert.deepEqual(await noted(), [second])
  })

  it('a delete keeps the comments of another ref', async () => {
    const { head, book, lines } = fresh()
    const gone = await book().add(LOCAL, head, 'a.kt', line(1), 'delete this one')
    await book().add(DISCUSS, head, 'a.kt', line(2), 'keep this one')
    const kept = await lines(head, DISCUSS)
    await book().remove([gone])
    assert.deepEqual(await lines(head, DISCUSS), kept)
  })

  it('a delete of two comments of one note needs one write', async () => {
    const { head, book, lines } = fresh()
    const first = await book().add(LOCAL, head, 'a.kt', line(1), 'delete this one')
    const second = await book().add(LOCAL, head, 'a.kt', line(2), 'delete this one too')
    const third = await book().add(LOCAL, head, 'a.kt', line(3), 'keep this one')
    const before = await lines(head)
    assert.equal(await book().remove([first, second]), 2)
    assert.deepEqual(await lines(head), [before[2]])
    assert.deepEqual(
      (await book().list(head)).map((s) => s.id),
      [third.id],
    )
  })

  it('a delete of an unknown comment writes nothing', async () => {
    const { head, book, lines } = fresh()
    await book().add(LOCAL, head, 'a.kt', line(1), 'keep this one')
    const before = await lines(head)
    const unknown: StoredComment = {
      id: '0000000000000000000000000000000000000000',
      ref: LOCAL,
      commit: head,
      record: {
        timestamp: '1700000000',
        author: 'a@b.c',
        description: 'not in the note',
        location: { commit: head, path: 'a.kt' },
      },
    }
    assert.equal(await book().remove([unknown]), 0)
    assert.deepEqual(await lines(head), before)
  })

  it('a delete keeps every comment when the runner refuses the note', async () => {
    const { head, runner, book, lines } = fresh()
    await book().add(LOCAL, head, 'a.kt', line(1), 'keep this one')
    const second = await book().add(LOCAL, head, 'a.kt', line(2), 'delete this one')
    const before = await lines(head)
    const blind = new CommentBook(new NotesGateway(refusesTheNote(runner)), () =>
      Promise.resolve('reviewer@example.com'),
    )
    await assert.rejects(blind.remove([second]), NotesWriteError)
    assert.deepEqual(await lines(head), before, 'a read the extension cannot trust writes nothing')
    assert.equal((await book().list(head)).length, 2)
  })

  it('findAll reports the records of these identifiers', async () => {
    const { head, book } = fresh()
    const first = await book().add(LOCAL, head, 'a.kt', line(1), 'one')
    await book().add(LOCAL, head, 'a.kt', line(2), 'two')
    const third = await book().add(DISCUSS, head, 'a.kt', line(3), 'three')
    const found = await book().findAll(new Set([first.id, third.id]))
    assert.deepEqual(new Set(found.map((s) => s.id)), new Set([first.id, third.id]))
    assert.deepEqual(new Set(found.map((s) => s.ref)), new Set([LOCAL, DISCUSS]))
  })

  it('a resolve keeps every comment when the runner refuses the note', async () => {
    const { head, runner, book, lines } = fresh()
    const stored = await book().add(LOCAL, head, 'a.kt', line(1), 'resolve me')
    const before = await lines(head)
    const blind = new CommentBook(new NotesGateway(refusesTheNote(runner)), () =>
      Promise.resolve('reviewer@example.com'),
    )
    await assert.rejects(blind.resolve(stored), NotesWriteError)
    assert.deepEqual(await lines(head), before)
  })
})
