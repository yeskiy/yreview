import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { WORKTREE } from '../../../src/core/anchor'
import { NotesWriteError } from '../../../src/git/errors'
import { CommentBook } from '../../../src/store/commentBook'
import { FOLDER, FolderNotes, slug } from '../../../src/store/folderNotes'
import { DISCUSS, LOCAL } from '../../../src/store/noteRefs'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const NOW = 1_700_000_000

describe('folder notes', () => {
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const store = (): FolderNotes => {
    const root = scratchDir()
    dirs.push(root)
    return new FolderNotes(root)
  }
  /** One record, then a byte that no UTF-8 text holds, so the reader fails. */
  const unreadable = (notes: FolderNotes): string => {
    const file = notes.fileOf(LOCAL, WORKTREE)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, Buffer.concat([Buffer.from('{"a":1}'), Buffer.from([10, 0xff, 10])]))
    return file
  }

  it('an empty store reads nothing', async () => {
    const notes = store()
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), [])
    assert.deepEqual(await notes.commitsWithNotes(LOCAL), [])
  })

  it('an appended line reads back and the folder appears', async () => {
    const notes = store()
    await notes.append(LOCAL, WORKTREE, '{"a":1}')
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), ['{"a":1}'])
    assert.ok(statSync(path.dirname(path.dirname(notes.folder))).isDirectory())
    assert.equal(path.basename(path.dirname(notes.folder)), FOLDER)
  })

  it('two lines keep their order and the file ends with a newline', async () => {
    const notes = store()
    await notes.append(LOCAL, WORKTREE, '{"a":1}')
    await notes.append(LOCAL, WORKTREE, '{"b":2}')
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), ['{"a":1}', '{"b":2}'])
    assert.equal(readFileSync(notes.fileOf(LOCAL, WORKTREE), 'utf8'), '{"a":1}\n{"b":2}\n')
  })

  it('two refs keep separate files', async () => {
    const notes = store()
    await notes.append(LOCAL, WORKTREE, '{"a":1}')
    await notes.append(DISCUSS, WORKTREE, '{"b":2}')
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), ['{"a":1}'])
    assert.deepEqual(await notes.readLines(DISCUSS, WORKTREE), ['{"b":2}'])
  })

  it('a rewrite with fewer lines drops the rest', async () => {
    const notes = store()
    await notes.append(LOCAL, WORKTREE, '{"a":1}')
    await notes.append(LOCAL, WORKTREE, '{"b":2}')
    await notes.rewrite(LOCAL, WORKTREE, ['{"b":2}'])
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), ['{"b":2}'])
  })

  it('an empty rewrite removes the file and the key', async () => {
    const notes = store()
    await notes.append(LOCAL, WORKTREE, '{"a":1}')
    await notes.rewrite(LOCAL, WORKTREE, [])
    assert.deepEqual(await notes.commitsWithNotes(LOCAL), [])
    assert.equal(existsSync(notes.fileOf(LOCAL, WORKTREE)), false)
  })

  it('the key list names every file of the ref', async () => {
    const notes = store()
    await notes.append(LOCAL, WORKTREE, '{"a":1}')
    await notes.append(LOCAL, 'abc123', '{"b":2}')
    assert.deepEqual([...(await notes.commitsWithNotes(LOCAL))].sort(), ['abc123', WORKTREE])
  })

  it('a ref slug holds no path separator', () => {
    assert.equal(slug(LOCAL), 'refs-notes-y-review-local')
    assert.equal(slug(DISCUSS), 'refs-notes-devtools-discuss')
  })

  it('an append keeps the records of a file that the extension cannot read', async () => {
    const notes = store()
    const file = unreadable(notes)
    const before = readFileSync(file)
    await assert.rejects(notes.append(LOCAL, WORKTREE, '{"b":2}'), NotesWriteError)
    assert.deepEqual(readFileSync(file), before, 'a failed read must write nothing')
  })

  it('the refusal names the file that the extension cannot read', async () => {
    const notes = store()
    const file = unreadable(notes)
    await assert.rejects(notes.append(LOCAL, WORKTREE, '{"b":2}'), (error: Error) =>
      error.message.includes(file),
    )
  })

  it('a file that the extension cannot read gives no line', async () => {
    const notes = store()
    unreadable(notes)
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), [])
  })

  it('reads CRLF lines and drops blank lines', async () => {
    const notes = store()
    const file = notes.fileOf(LOCAL, WORKTREE)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '{"a":1}\r\n\r\n  \r\n{"b":2}\r\n')
    assert.deepEqual(await notes.readLines(LOCAL, WORKTREE), ['{"a":1}', '{"b":2}'])
  })

  it('refuses a key or a ref that names a path outside the store', async () => {
    const notes = store()
    await Promise.all(
      ['../x', 'a/b', 'a\\b', '.', '..', ''].map((key) =>
        assert.rejects(notes.append(LOCAL, key, '{"a":1}'), NotesWriteError, key),
      ),
    )
    await assert.rejects(notes.append('refs/heads/main', WORKTREE, '{"a":1}'), NotesWriteError)
    await assert.rejects(
      notes.append('refs/notes/a\\..\\..\\x', WORKTREE, '{"a":1}'),
      NotesWriteError,
    )
  })

  it('two parallel appends in one process keep both lines', async () => {
    const notes = store()
    await Promise.all([
      notes.append(LOCAL, WORKTREE, '{"a":1}'),
      notes.append(LOCAL, WORKTREE, '{"b":2}'),
    ])
    assert.deepEqual([...(await notes.readLines(LOCAL, WORKTREE))].sort(), ['{"a":1}', '{"b":2}'])
  })
})

describe('comment book on a folder store', () => {
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const book = (): CommentBook => {
    const root = scratchDir()
    dirs.push(root)
    return new CommentBook(
      new FolderNotes(root),
      () => Promise.resolve('a@b.c'),
      () => NOW,
    )
  }

  it('a comment reads back with the worktree key', async () => {
    const comments = book()
    const stored = await comments.add(
      LOCAL,
      WORKTREE,
      'a.kt',
      { startLine: 88, endLine: 94 },
      'fix this',
    )
    const [read] = await comments.list(WORKTREE)
    assert.equal(read?.id, stored.id)
    assert.equal(read?.commit, WORKTREE)
    assert.equal(read?.record.location?.commit, WORKTREE)
    assert.equal(read?.record.description, 'fix this')
  })

  it('the key list names the worktree key', async () => {
    const comments = book()
    await comments.add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    assert.deepEqual(await comments.commits(), [WORKTREE])
  })

  it('a resolved comment leaves the open list', async () => {
    const comments = book()
    const stored = await comments.add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    await comments.resolve(stored)
    assert.deepEqual(await comments.open(WORKTREE), [])
    assert.deepEqual(
      (await comments.closed(WORKTREE)).map((entry) => entry.id),
      [stored.id],
    )
  })

  it('a delete removes the record and its resolve line', async () => {
    const comments = book()
    const stored = await comments.add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    await comments.resolve(stored)
    assert.equal(await comments.remove([stored]), 2)
    assert.deepEqual(await comments.list(WORKTREE), [])
  })

  it('find reaches a record without a known key', async () => {
    const comments = book()
    const stored = await comments.add(LOCAL, WORKTREE, 'a.kt', { startLine: 1, endLine: 1 }, 'one')
    assert.equal((await comments.find(stored.id))?.id, stored.id)
  })
})
