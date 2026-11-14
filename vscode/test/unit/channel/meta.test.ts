import { strict as assert } from 'node:assert'

import { batchMeta, sanitizeMeta } from '../../../src/channel/format'
import type { ReviewBatch } from '../../../src/channel/schema'

const batch: ReviewBatch = {
  batchId: 'b7f2a91',
  branch: 'feat/channel-server',
  commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments: [
    { id: 'aaaaaaa1', path: 'a.kt', startLine: 1, endLine: 1, revision: 'HEAD', text: 'one' },
    { id: 'bbbbbbb2', path: 'b.kt', startLine: 2, endLine: 2, revision: 'HEAD', text: 'two' },
  ],
}

describe('channel meta (MetaTest.kt)', () => {
  it('carries the branch, the commit, the count, and the batch id', () => {
    assert.deepEqual(batchMeta(batch), {
      branch: 'feat/channel-server',
      commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
      count: '2',
      batch_id: 'b7f2a91',
    })
  })

  it('uses only keys that Claude Code keeps', () => {
    Object.keys(batchMeta(batch)).forEach((key) => assert.match(key, /^[A-Za-z0-9_]+$/))
  })

  it('keeps a key of letters, digits, and underscores', () => {
    assert.deepEqual(sanitizeMeta({ batch_id: 'b1', count7: '3' }), { batch_id: 'b1', count7: '3' })
  })

  it('drops a key that holds a hyphen', () => {
    assert.deepEqual(sanitizeMeta({ 'batch-id': 'b1', count: '3' }), { count: '3' })
  })

  it('drops a key that holds a dot or a slash', () => {
    assert.deepEqual(sanitizeMeta({ 'a.b': '1', 'c/d': '2', ok: '3' }), { ok: '3' })
  })

  it('drops an empty key', () => {
    assert.deepEqual(sanitizeMeta({ '': '1', ok: '2' }), { ok: '2' })
  })

  it('drops an entry whose value is empty', () => {
    assert.deepEqual(sanitizeMeta({ branch: '', ok: '2' }), { ok: '2' })
  })

  it('drops an entry whose value is not a string', () => {
    assert.deepEqual(sanitizeMeta({ count: 3, ok: '2' }), { ok: '2' })
  })

  it('removes a double quote from a value so the tag attribute stays whole', () => {
    assert.deepEqual(sanitizeMeta({ branch: 'fix/"quoted"-name' }), { branch: 'fix/quoted-name' })
  })

  it('removes a control character from a value', () => {
    assert.deepEqual(sanitizeMeta({ branch: 'one\ntwo\ttab' }), { branch: 'onetwotab' })
  })

  it('drops an entry whose value holds only characters that get removed', () => {
    assert.deepEqual(sanitizeMeta({ branch: '"""', ok: '2' }), { ok: '2' })
  })
})
