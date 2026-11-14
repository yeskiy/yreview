import assert from 'node:assert/strict'

import { handleOf, keyOf, matchKey } from '../../../src/core/handles'
import { CommentBook } from '../../../src/store/commentBook'
import { LOCAL } from '../../../src/store/noteRefs'
import { MemoryNotes } from './memoryNotes'

const written = async () => {
  const book = new CommentBook(new MemoryNotes(), () => Promise.resolve('reviewer@example.com'))
  const stored = await book.add(LOCAL, 'c1', 'a.kt', { startLine: 1, endLine: 1 }, 'one')
  await book.add(LOCAL, 'c1', 'a.kt', { startLine: 2, endLine: 2 }, 'two')
  return { book, stored }
}

const ids = async (book: CommentBook): Promise<readonly string[]> =>
  (await book.tasks()).map((s) => s.id)

describe('handles of real records', () => {
  it('a handle of a real record finds that record', async () => {
    const { book, stored } = await written()
    const key = keyOf(handleOf(stored.id)) ?? assert.fail('no key')
    assert.deepEqual(matchKey(key, await ids(book)), { kind: 'one', id: stored.id })
  })

  it('a long identifier of a real record still finds that record', async () => {
    const { book, stored } = await written()
    const key = keyOf(stored.id) ?? assert.fail('no key')
    assert.deepEqual(matchKey(key, await ids(book)), { kind: 'one', id: stored.id })
  })

  it('a handle of a record that went away finds nothing', async () => {
    const { book, stored } = await written()
    const handle = handleOf(stored.id)
    await book.remove([stored])
    const key = keyOf(handle) ?? assert.fail('no key')
    assert.deepEqual(matchKey(key, await ids(book)), { kind: 'none' })
  })
})
