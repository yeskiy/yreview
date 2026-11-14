import { strict as assert } from 'node:assert'

import { MAX_COMMENTS, MAX_TEXT, parseBatch } from '../../../src/channel/schema'

const comment = ({
  id = 'c3f9a12aabbccddeeff00112233445566778899a',
  path = 'src/main/kotlin/Parser.kt',
  startLine = '88',
  endLine = '94',
  revision = 'HEAD',
  text = 'This branch never runs when the input is empty.',
  extra = '',
} = {}): string =>
  `{"id":"${id}","path":"${path}","startLine":${startLine},"endLine":${endLine},` +
  `"revision":"${revision}","text":"${text}"${extra}}`

const batch = ({
  batchId = 'b7f2a91',
  branch = 'feat/channel-server',
  commit = '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments = comment(),
  extra = '',
} = {}): string =>
  `{"batchId":"${batchId}","branch":"${branch}","commit":"${commit}","comments":[${comments}]${extra}}`

const accepts = (text: string): boolean => parseBatch(text).kind === 'ok'

describe('channel schema (SchemaTest.kt)', () => {
  it('accepts a batch that follows the contract', () => {
    assert.ok(accepts(batch()))
  })

  it('accepts the left and the right side of a diff', () => {
    assert.ok(accepts(batch({ comments: comment({ extra: ',"side":"left"' }) })))
    assert.ok(accepts(batch({ comments: comment({ extra: ',"side":"right"' }) })))
  })

  it('accepts the character fields of a comment', () => {
    assert.ok(accepts(batch({ comments: comment({ extra: ',"startColumn":4,"endColumn":9' }) })))
  })

  it('rejects a negative character position', () => {
    assert.ok(!accepts(batch({ comments: comment({ extra: ',"startColumn":-1' }) })))
  })

  it('rejects a side that is neither left nor right', () => {
    assert.ok(!accepts(batch({ comments: comment({ extra: ',"side":"middle"' }) })))
  })

  it('rejects a field that the contract does not name', () => {
    assert.ok(!accepts(batch({ extra: ',"author":"someone@example.com"' })))
  })

  it('rejects a comment field that the contract does not name', () => {
    assert.ok(!accepts(batch({ comments: comment({ extra: ',"resolved":true' }) })))
  })

  it('rejects a path that holds a line break', () => {
    assert.ok(!accepts(batch({ comments: comment({ path: 'a.kt\\nb.kt' }) })))
  })

  it('rejects a branch that holds a line break', () => {
    assert.ok(!accepts(batch({ branch: 'main\\nother' })))
  })

  it('rejects an id that holds a character outside the safe set', () => {
    assert.ok(!accepts(batch({ comments: comment({ id: 'c3f9a12 tag' }) })))
  })

  it('rejects a batch id that holds a character outside the safe set', () => {
    assert.ok(!accepts(batch({ batchId: 'b7f2a91/../etc' })))
  })

  it('rejects a line number that is not a whole number', () => {
    assert.ok(!accepts(batch({ comments: comment({ startLine: '1.5' }) })))
  })

  it('rejects a negative line number', () => {
    assert.ok(!accepts(batch({ comments: comment({ startLine: '-1' }) })))
  })

  it('rejects a batch that carries no comment', () => {
    assert.ok(!accepts(batch({ comments: '' })))
  })

  it('rejects a batch that carries more than 200 comments', () => {
    assert.ok(
      !accepts(
        batch({ comments: Array.from({ length: MAX_COMMENTS + 1 }, () => comment()).join(',') }),
      ),
    )
  })

  it('rejects a comment text longer than 20000 characters', () => {
    assert.ok(!accepts(batch({ comments: comment({ text: 'x'.repeat(MAX_TEXT + 1) }) })))
  })

  it('rejects a comment with no text', () => {
    assert.ok(!accepts(batch({ comments: comment({ text: '' }) })))
  })

  it('rejects a value that is not an object', () => {
    assert.ok(!accepts('"a batch"'))
    assert.ok(!accepts('null'))
  })

  it('names the field that broke the contract', () => {
    assert.deepEqual(parseBatch(batch({ batchId: 'b7f2a91/../etc' })), {
      kind: 'bad',
      reason: 'batchId may hold letters, digits, underscores, and hyphens only',
    })
  })
})
