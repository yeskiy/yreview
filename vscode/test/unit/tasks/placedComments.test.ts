import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { NotesGateway } from '../../../src/git/notes'
import { ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { forgetDiffs } from '../../../src/store/diffCache'
import { LOCAL } from '../../../src/store/noteRefs'
import { forgetNotes } from '../../../src/tasks/noteScan'
import { placedComments } from '../../../src/tasks/placedComments'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const SIX = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((line) => `${line}\n`).join('')

describe('placed comments', function placed() {
  this.timeout(60_000)
  const dirs: string[] = []
  afterEach(() => {
    forgetDiffs()
    forgetNotes()
  })
  after(() => dirs.forEach(removeDir))

  const repo = (): string => {
    const dir = makeRepo()
    dirs.push(dir)
    return dir
  }
  const commitFile = (dir: string, file: string, text: string): string => {
    writeFileSync(path.join(dir, file), text)
    git(dir, 'add', file)
    git(dir, 'commit', '-q', '-m', `write ${file}`)
    return git(dir, 'rev-parse', 'HEAD')
  }
  const book = (dir: string): CommentBook =>
    new CommentBook(new NotesGateway(new ProcessGitRunner(dir)), () =>
      Promise.resolve('t@example.com'),
    )
  const note = (
    dir: string,
    commit: string,
    startLine: number,
    endLine: number,
    text = 'Look here.',
    lineText?: string,
  ) => book(dir).add(LOCAL, commit, 'a.txt', { startLine, endLine }, text, lineText)
  const place = async (dir: string, only: string | undefined = 'a.txt') => {
    const runner = new ProcessGitRunner(dir)
    return placedComments(
      runner,
      dir,
      git(dir, 'rev-parse', 'HEAD'),
      new NotesGateway(runner),
      only,
    )
  }

  it('keeps the lines after a new commit with the file unchanged', async () => {
    const dir = repo()
    await note(dir, commitFile(dir, 'a.txt', SIX), 5, 6)
    commitFile(dir, 'b.txt', 'other\n')
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'same',
      range: { startLine: 5, endLine: 6 },
    })
  })

  it('moves the range after lines added above', async () => {
    const dir = repo()
    await note(dir, commitFile(dir, 'a.txt', SIX), 5, 6)
    commitFile(dir, 'a.txt', `n1\nn2\n${SIX}`)
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'same',
      range: { startLine: 7, endLine: 8 },
    })
  })

  it('marks changed lines outdated with the original text', async () => {
    const dir = repo()
    await note(dir, commitFile(dir, 'a.txt', SIX), 5, 6)
    commitFile(dir, 'a.txt', SIX.replace('l5', 'x5'))
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'outdated',
      range: { startLine: 5, endLine: 6 },
      original: ['l5', 'l6'],
    })
  })

  it('gives gone for a removed file', async () => {
    const dir = repo()
    await note(dir, commitFile(dir, 'a.txt', SIX), 5, 6)
    git(dir, 'rm', '-q', 'a.txt')
    git(dir, 'commit', '-q', '-m', 'drop')
    assert.deepEqual((await place(dir))[0]?.carry, { kind: 'gone' })
  })

  it('keeps the lines after a branch switch with an equal file', async () => {
    const dir = repo()
    commitFile(dir, 'a.txt', SIX)
    git(dir, 'checkout', '-q', '-b', 'side')
    await note(dir, commitFile(dir, 'b.txt', 'side\n'), 2, 3)
    git(dir, 'checkout', '-q', '-')
    commitFile(dir, 'c.txt', 'main\n')
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'same',
      range: { startLine: 2, endLine: 3 },
    })
  })

  it('maps a comment of a commit that is not an ancestor by content', async () => {
    const dir = repo()
    commitFile(dir, 'a.txt', SIX)
    git(dir, 'checkout', '-q', '-b', 'side')
    await note(dir, commitFile(dir, 'a.txt', `s1\n${SIX}`), 6, 7)
    git(dir, 'checkout', '-q', '-')
    commitFile(dir, 'a.txt', `m1\nm2\n${SIX}`)
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'same',
      range: { startLine: 7, endLine: 8 },
    })
  })

  it('keeps the lines of a HEAD comment on a dirty file', async () => {
    const dir = repo()
    await note(dir, commitFile(dir, 'a.txt', SIX), 5, 6)
    writeFileSync(path.join(dir, 'a.txt'), `n1\n${SIX}`)
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'same',
      range: { startLine: 5, endLine: 6 },
    })
  })

  it('finds a comment on uncommitted lines by its text after the commit', async () => {
    const dir = repo()
    const old = commitFile(dir, 'a.txt', 'a\nb\nd\n')
    writeFileSync(path.join(dir, 'a.txt'), 'a\nb\nnew line\nd\n')
    await note(dir, old, 3, 3, 'Look here.', 'new line')
    git(dir, 'commit', '-q', '-am', 'agent')
    assert.deepEqual((await place(dir))[0]?.carry, {
      kind: 'same',
      range: { startLine: 3, endLine: 3 },
    })
  })

  it('resolves and deletes a carried comment in the note of its commit', async () => {
    const dir = repo()
    const old = commitFile(dir, 'a.txt', SIX)
    await note(dir, old, 1, 1, 'Resolve me.')
    await note(dir, old, 2, 2, 'Delete me.')
    commitFile(dir, 'a.txt', `n1\n${SIX}`)
    const shown = await place(dir)
    const pick = (text: string) =>
      shown.find((entry) => entry.stored.record.description === text)?.stored ?? assert.fail(text)
    await book(dir).resolve(pick('Resolve me.'))
    await book(dir).remove([pick('Delete me.')])
    forgetNotes()
    assert.deepEqual(await place(dir), [])
    assert.equal((await book(dir).closed(old)).length, 1)
  })

  it('drops blank text and a path outside the root', async () => {
    const dir = repo()
    const head = commitFile(dir, 'a.txt', SIX)
    await note(dir, head, 1, 1, '  ')
    await book(dir).add(LOCAL, head, '../x.txt', { startLine: 1, endLine: 1 }, 'Out.')
    assert.deepEqual(await place(dir, undefined), [])
  })
})
