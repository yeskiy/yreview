import assert from 'node:assert/strict'

import { encodeRecord } from '../../../src/core/record'
import { gitAuthor } from '../../../src/git/author'
import { NotesWriteError } from '../../../src/git/errors'
import { NotesGateway } from '../../../src/git/notes'
import { DID_NOT_START, type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'
import { MemoryNotes } from './memoryNotes'

const NOW = 1787194427
const UNKNOWN = '0000000000000000000000000000000000000000'
const book = (notes: MemoryNotes): CommentBook =>
  new CommentBook(
    notes,
    () => Promise.resolve('reviewer@example.com'),
    () => NOW,
  )
const line = (n: number) => ({ startLine: n, endLine: n })

describe('CommentBook', () => {
  it('lists every record that can be a task', async () => {
    const notes = new MemoryNotes()
    const first = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'one')
    const second = await book(notes).add(LOCAL, 'c1', 'a.kt', line(2), 'two')
    assert.deepEqual(
      new Set((await book(notes).tasks()).map((s) => s.id)),
      new Set([first.id, second.id]),
    )
  })

  it('leaves the resolve records out of the task list', async () => {
    const notes = new MemoryNotes()
    const stored = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'one')
    await book(notes).resolve(stored)
    assert.deepEqual(
      (await book(notes).tasks()).map((s) => s.id),
      [stored.id],
    )
    assert.equal((await book(notes).list('c1')).length, 2)
  })

  it('a task keeps its place after a resolve', async () => {
    const notes = new MemoryNotes()
    await book(notes).resolve(await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'one'))
    assert.deepEqual(
      (await book(notes).tasks()).map((s) => s.commit),
      ['c1'],
    )
  })

  it('writes a comment that reads back with its anchor', async () => {
    const notes = new MemoryNotes()
    const stored = await book(notes).add(
      LOCAL,
      'c1',
      'a.kt',
      { startLine: 88, endLine: 94 },
      'fix this',
    )
    const [read, ...rest] = await book(notes).list('c1')
    assert.equal(rest.length, 0)
    assert.equal(read?.id, stored.id)
    assert.equal(read?.record.location?.path, 'a.kt')
    assert.equal(read?.record.location?.range?.startLine, 88)
    assert.equal(read?.record.location?.range?.endLine, 94)
    assert.equal(read?.record.description, 'fix this')
  })

  it('writes the characters of a comment on a part of a line', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(
      LOCAL,
      'c1',
      'a.kt',
      { startLine: 1, startColumn: 4, endLine: 1, endColumn: 9 },
      'fix this word',
    )
    const range = (await book(notes).list('c1'))[0]?.record.location?.range
    assert.equal(range?.startColumn, 4)
    assert.equal(range?.endColumn, 9)
  })

  it('writes no character for a comment on whole lines', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', { startLine: 88, endLine: 94 }, 'fix this')
    const range = (await book(notes).list('c1'))[0]?.record.location?.range
    assert.equal(range?.startColumn ?? 0, 0)
    assert.equal(range?.endColumn ?? 0, 0)
  })

  it('the note of a comment on whole lines holds no character field', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', { startLine: 88, endLine: 94 }, 'fix this')
    const [note = ''] = await notes.readLines(LOCAL, 'c1')
    assert.ok(note.includes('{"startLine":88,"endLine":94}'), note)
    assert.ok(!note.includes('Column'), note)
  })

  it('the note of a comment on a part of a line holds both character fields', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(
      LOCAL,
      'c1',
      'a.kt',
      { startLine: 88, startColumn: 4, endLine: 94, endColumn: 9 },
      'fix this word',
    )
    const [note = ''] = await notes.readLines(LOCAL, 'c1')
    assert.ok(note.includes('{"startLine":88,"startColumn":4,"endLine":94,"endColumn":9}'), note)
  })

  it('a stored comment carries the key it was read with', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', { startLine: 88, endLine: 94 }, 'fix this')
    assert.deepEqual(
      (await book(notes).list('c1')).map((s) => s.commit),
      ['c1'],
    )
  })

  it('stamps a ten digit timestamp and the author', async () => {
    const stored = await book(new MemoryNotes()).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    assert.equal(stored.record.timestamp, '1787194427')
    assert.equal(stored.record.timestamp.length, 10)
    assert.equal(stored.record.author, 'reviewer@example.com')
  })

  it('reads every ref and reports which one holds the comment', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'private')
    await book(notes).add(DISCUSS, 'c1', 'a.kt', line(2), 'shared')
    const byRef = new Map((await book(notes).list('c1')).map((s) => [s.ref, s]))
    assert.equal(byRef.get(LOCAL)?.record.description, 'private')
    assert.equal(byRef.get(DISCUSS)?.record.description, 'shared')
  })

  it('resolve appends a new comment that points at the original', async () => {
    const notes = new MemoryNotes()
    const first = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    await book(notes).resolve(first)
    const all = await book(notes).list('c1')
    assert.equal(all.length, 2)
    const updates = all.filter((s) => s.record.original !== undefined)
    assert.equal(updates.length, 1)
    assert.equal(updates[0]?.record.original, first.id)
    assert.equal(updates[0]?.record.resolved, true)
  })

  it('a resolved comment is not listed as open', async () => {
    const notes = new MemoryNotes()
    await book(notes).resolve(await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x'))
    assert.deepEqual(await book(notes).open('c1'), [])
  })

  it('an unresolved comment is listed as open', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    assert.equal((await book(notes).open('c1')).length, 1)
  })

  it('a resolved comment is listed as closed', async () => {
    const notes = new MemoryNotes()
    const first = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    await book(notes).resolve(first)
    assert.deepEqual(
      (await book(notes).closed('c1')).map((s) => s.id),
      [first.id],
    )
  })

  it('an open comment is not listed as closed', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    assert.deepEqual(await book(notes).closed('c1'), [])
  })

  it('commits reports every revision that carries a note', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    await book(notes).add(DISCUSS, 'c2', 'b.kt', line(1), 'y')
    assert.deepEqual(new Set(await book(notes).commits()), new Set(['c1', 'c2']))
  })

  it('commits reports nothing when no note exists', async () => {
    assert.deepEqual(await book(new MemoryNotes()).commits(), [])
  })

  it('find returns the comment with that id from any revision', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'other')
    const wanted = await book(notes).add(
      DISCUSS,
      'c2',
      'b.kt',
      { startLine: 4, endLine: 6 },
      'look here',
    )
    const found = await book(notes).find(wanted.id)
    assert.equal(found?.id, wanted.id)
    assert.equal(found?.ref, DISCUSS)
    assert.equal(found?.record.description, 'look here')
  })

  it('find returns nothing for an unknown id', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    assert.equal(await book(notes).find(UNKNOWN), undefined)
  })

  it('findAt returns the comment of that key', async () => {
    const notes = new MemoryNotes()
    const wanted = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'fix this')
    assert.equal((await book(notes).findAt('c1', wanted.id))?.id, wanted.id)
  })

  it('findAt returns a comment whose key git cannot resolve', async () => {
    const notes = new MemoryNotes()
    const wanted = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'fix this')
    const found = await book(notes).findAt('worktree', wanted.id)
    assert.equal(found?.id, wanted.id, 'a migrated comment still names the key of its old folder')
    assert.equal(found?.record.description, 'fix this')
  })

  it('findAt returns nothing for an unknown id', async () => {
    const notes = new MemoryNotes()
    await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    assert.equal(await book(notes).findAt('worktree', UNKNOWN), undefined)
  })

  it('a book without an author writes no record and still reads', async () => {
    const notes = new MemoryNotes()
    await notes.append(
      LOCAL,
      'c1',
      encodeRecord({ timestamp: '1', author: 'a@b.c', description: 'kept' }),
    )
    const blind = new CommentBook(notes, () => Promise.reject(new NotesWriteError('no author')))
    await assert.rejects(blind.add(LOCAL, 'c1', 'src/a.txt', line(1), 'x'), NotesWriteError)
    assert.equal((await blind.list('c1')).length, 1)
    assert.equal((await notes.readLines(LOCAL, 'c1')).length, 1)
  })

  it('refuses a comment with a lone surrogate and writes nothing', async () => {
    const notes = new MemoryNotes()
    await assert.rejects(book(notes).add(LOCAL, 'c1', 'p', line(1), 'x\ud800'), NotesWriteError)
    await assert.rejects(
      book(notes).add(LOCAL, 'c1', 'p', line(1), '\ude00\ud83d'),
      NotesWriteError,
    )
    assert.equal(notes.notes.size, 0)
  })

  it('writes a comment with a pair of surrogates', async () => {
    const notes = new MemoryNotes()
    const stored = await book(notes).add(
      LOCAL,
      'c1',
      'p',
      line(1),
      `x ${String.fromCodePoint(0x1f600)}`,
    )
    assert.equal((await book(notes).list('c1'))[0]?.id, stored.id)
  })

  it('a resolve of a comment that went away writes nothing', async () => {
    const notes = new MemoryNotes()
    const stored = await book(notes).add(LOCAL, 'c1', 'a.kt', line(1), 'x')
    await book(notes).remove([stored])
    await assert.rejects(book(notes).resolve(stored), NotesWriteError)
    assert.equal(notes.notes.size, 0)
  })

  it('a book with a git that does not start writes no record and still reads', async () => {
    const repo = makeRepo()
    const head = git(repo, 'rev-parse', 'HEAD')
    const missing: GitRunner = {
      run: () =>
        Promise.resolve({ exitCode: DID_NOT_START, stdout: '', stderr: 'could not start git' }),
    }
    const gateway = new NotesGateway(new ProcessGitRunner(repo))
    const blind = new CommentBook(gateway, () => gitAuthor(missing))
    const failure = await blind.add(LOCAL, head, 'a.kt', line(1), 'no author').then(
      () => assert.fail('the write must fail'),
      (error: unknown) => error,
    )
    assert.ok(failure instanceof NotesWriteError)
    assert.match(failure.message, /author/)
    assert.deepEqual(await blind.list(head), [])
    assert.deepEqual(await gateway.commitsWithNotes(LOCAL), [])
    removeDir(repo)
  })
})
