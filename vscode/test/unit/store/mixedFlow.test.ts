import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { NotesGateway } from '../../../src/git/notes'
import { ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { DISCUSS } from '../../../src/store/noteRefs'
import { ReviewService, type ServiceHost } from '../../../src/store/reviewService'
import { git, makeRemote, removeDir, scratchDir } from '../../fixtures/scratch'

interface RecordCase {
  readonly name: string
  readonly line: string
  readonly id: string | null
}

// Lines as the Kotlin plugin writes or keeps them, with the ids that the Kotlin rules give.
const KOTLIN_LINES = ['reference-open', 'unknown-fields', 'white-space', 'emoji-cjk', 'crlf']
const REFUSED_LINE = 'refused-missing-author'
const vectors = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../../spec/vectors/records.json'), 'utf8'),
  ) as readonly RecordCase[]
).filter((vector) => [...KOTLIN_LINES, REFUSED_LINE].includes(vector.name))

const quiet: ServiceHost = {
  gitPath: () => 'git',
  settings: () => ({ remote: 'origin', writeRefspec: false }),
  askRefspec: () => Promise.resolve(undefined),
  declinedRoots: () => [],
  saveDeclinedRoots: () => Promise.resolve(),
  warn: () => undefined,
}
const fetchNotes = (dir: string): string =>
  git(dir, 'fetch', '-q', 'origin', 'refs/notes/devtools/*:refs/notes/devtools/*')
const bookOf = (dir: string): CommentBook =>
  new CommentBook(new NotesGateway(new ProcessGitRunner(dir)), () =>
    Promise.resolve('teammate@example.com'),
  )

describe('mixed team flow', function mixed() {
  this.timeout(240_000)
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))

  it('notes of the IntelliJ plugin and of this service share one ref with the same ids', async () => {
    const remote = makeRemote()
    const vscodeUser = remote.clone()
    const teammate = remote.clone()
    const files = scratchDir()
    dirs.push(remote.bare, vscodeUser, teammate, files)
    const head = git(teammate, 'rev-parse', 'HEAD')

    // The teammate writes each line the way the Kotlin gateway does: git notes append -F.
    vectors.forEach((vector, index) => {
      const file = path.join(files, `${index}.json`)
      writeFileSync(file, vector.line, 'utf8')
      git(teammate, 'notes', '--ref', DISCUSS, 'append', '-F', file, '--end-of-options', head)
    })
    git(teammate, 'push', '-q', 'origin', DISCUSS)

    fetchNotes(vscodeUser)
    const service = new ReviewService(quiet)
    const anchor = await service.anchorOf(path.join(vscodeUser, 'src', 'a.txt'))
    if (anchor.kind !== 'git') return assert.fail('no anchor')
    assert.equal(anchor.anchor.head, head)
    const written = await service.addComment(
      anchor.anchor,
      { startLine: 2, endLine: 3 },
      'Shared.',
      true,
    )
    assert.equal(written.shareError, undefined)
    fetchNotes(teammate)

    const expected = [
      ...vectors.flatMap((vector) => (vector.id === null ? [] : [vector.id])),
      written.stored.id,
    ]
    assert.equal(expected.length, KOTLIN_LINES.length + 1)
    const idsAt = async (dir: string) =>
      (await bookOf(dir).list(head, [DISCUSS])).map((stored) => stored.id)
    assert.deepEqual(await idsAt(vscodeUser), expected)
    assert.deepEqual(await idsAt(teammate), expected)
    const raw = await new NotesGateway(new ProcessGitRunner(teammate)).readLines(DISCUSS, head)
    assert.deepEqual(
      raw.slice(0, vectors.length),
      vectors.map((vector) => vector.line.split(/\r\n|\r|\n/).join('')),
      'the service keeps each line of the plugin byte for byte',
    )

    // The teammate resolves the comment of VS Code, and VS Code resolves one of the plugin.
    const seen = await bookOf(teammate).findAt(head, written.stored.id)
    assert.equal(seen?.id, written.stored.id)
    if (seen === undefined) return undefined
    await bookOf(teammate).resolve(seen)
    git(teammate, 'push', '-q', 'origin', DISCUSS)
    fetchNotes(vscodeUser)
    assert.deepEqual(await service.openAt(anchor.anchor), [])

    const pluginId = vectors[0]?.id ?? assert.fail('no vector')
    const resolved = await service.resolve(anchor.anchor, pluginId)
    assert.equal(resolved.shareError, undefined)
    fetchNotes(teammate)
    assert.deepEqual(
      (await bookOf(teammate).closed(head, [DISCUSS])).map((stored) => stored.id).sort(),
      [pluginId, written.stored.id].sort(),
    )
    return undefined
  })
})
