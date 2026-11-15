import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { decodeRecord, recordId } from '../../../src/core/record'
import { NotesGateway } from '../../../src/git/notes'
import { ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook } from '../../../src/store/commentBook'
import { LOCAL } from '../../../src/store/noteRefs'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

interface CompatCase {
  name: string
  line: string
  id: string
}

const [compat] = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../../spec/vectors/carry.json'), 'utf8'),
  ) as { compat: [CompatCase, ...CompatCase[]] }
).compat

describe('a record with location.text in a reader of version 1.0', function futureField() {
  this.timeout(120_000)
  const repos: string[] = []
  after(() => repos.forEach(removeDir))

  it('decodes with the identifier of the vector', () => {
    const record = decodeRecord(compat.line)
    assert.ok(record !== undefined, 'the reader refuses the line')
    assert.equal(recordId(record), compat.id)
  })

  it('names the identifier in a resolve and keeps the line in a delete of another record', async () => {
    const repo = makeRepo()
    repos.push(repo)
    const head = git(repo, 'rev-parse', 'HEAD')
    const gateway = new NotesGateway(new ProcessGitRunner(repo))
    await gateway.append(LOCAL, head, compat.line)
    const book = new CommentBook(gateway, () => Promise.resolve('t@example.com'))
    const other = await book.add(LOCAL, head, 'src/a.txt', { startLine: 1, endLine: 1 }, 'Other.')
    const stored = (await book.open(head)).find((comment) => comment.id === compat.id)
    assert.ok(stored !== undefined, 'the comment is not open')

    const resolve = await book.resolve(stored)
    await book.remove([other])

    const lines = await gateway.readLines(LOCAL, head)
    assert.ok(lines.includes(compat.line), 'the line is no longer byte for byte in the note')
    assert.equal(resolve.record.original, compat.id)
    assert.ok(!(lines.at(-1) ?? '').includes('"text"'), 'the resolve record holds location.text')
    assert.deepEqual(
      (await book.closed(head)).map((comment) => comment.id),
      [compat.id],
    )
  })
})
