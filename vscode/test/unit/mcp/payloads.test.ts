import { strict as assert } from 'node:assert'

import type { RecordRange } from '../../../src/core/record'
import {
  addedPayload,
  errorPayload,
  isCommitRevision,
  isSharedRow,
  listPayload,
  normalizePath,
  openedPayload,
  rangeProblem,
  refsFor,
  resolvedPayload,
  rowOf,
} from '../../../src/mcp/payloads'
import type { StoredComment } from '../../../src/store/commentBook'
import { ANALYSES, DISCUSS, LOCAL } from '../../../src/store/noteRefs'

const HANDLE = 'yd8pmsq91'

const stored = (
  ref: string,
  range: RecordRange | null = { startLine: 3, endLine: 5 },
): StoredComment => ({
  id: 'abc123',
  ref,
  commit: 'deadbeef',
  record: {
    timestamp: '1755600000',
    author: 'dev@example.com',
    description: 'rename this',
    location: { commit: 'deadbeef', path: 'src/a.kt', ...(range === null ? {} : { range }) },
  },
})

const listText = (ref: string, range?: RecordRange): string => {
  const row = rowOf(stored(ref, range), false, 'git', HANDLE)
  return JSON.stringify(listPayload(row === undefined ? [] : [row]))
}

describe('review payloads (ReviewPayloadsTest.kt)', () => {
  it('the shared refs are always read', () => {
    assert.deepEqual(refsFor(false, false), [DISCUSS])
    assert.deepEqual(refsFor(true, false), [DISCUSS, ANALYSES])
    assert.deepEqual(refsFor(false, true), [DISCUSS, LOCAL])
  })

  it('each flag adds one ref', () => {
    assert.deepEqual(refsFor(true, true), [DISCUSS, ANALYSES, LOCAL])
  })

  it('a row carries the handle, the path, the range, the revision and the text', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(rowOf(stored(DISCUSS), false, 'git', HANDLE))), {
      id: HANDLE,
      path: 'src/a.kt',
      startLine: 3,
      endLine: 5,
      revision: 'deadbeef',
      author: 'dev@example.com',
      text: 'rename this',
      shared: true,
      resolved: false,
    })
  })

  it('a local comment is not shared', () => {
    assert.equal(rowOf(stored(LOCAL), false, 'git', HANDLE)?.shared, false)
  })

  it('a comment without a location has no row', () => {
    const orphan: StoredComment = {
      id: 'id',
      ref: LOCAL,
      commit: 'deadbeef',
      record: { timestamp: '1', author: 'a' },
    }
    assert.equal(rowOf(orphan, false, 'git', HANDLE), undefined)
  })

  it('a comment without a range covers the whole file', () => {
    const row = rowOf(stored(DISCUSS, null), false, 'git', HANDLE)
    assert.equal(row?.startLine, 0)
    assert.equal(row?.endLine, 0)
    assert.equal(row?.startColumn, undefined)
    assert.equal(row?.endColumn, undefined)
  })

  it('the list payload names the comments field', () => {
    const text = listText(DISCUSS)
    assert.ok(text.startsWith('{"comments":['), text)
    assert.ok(text.includes(`"id":"${HANDLE}"`), text)
    assert.ok(text.includes('"startLine":3'), text)
  })

  it('the list payload carries the characters of a part of a line', () => {
    const text = listText(DISCUSS, { startLine: 3, startColumn: 4, endLine: 5, endColumn: 9 })
    assert.ok(text.includes('"startColumn":4'), text)
    assert.ok(text.includes('"endColumn":9'), text)
    const fromStart = listText(DISCUSS, { startLine: 3, startColumn: 0, endLine: 3, endColumn: 9 })
    assert.ok(fromStart.includes('"startColumn":0'), fromStart)
    assert.ok(fromStart.includes('"endColumn":9'), fromStart)
  })

  it('the list payload of whole lines names no character', () => {
    const text = listText(DISCUSS)
    assert.ok(!text.includes('Column'), text)
  })

  it('an empty list still names the comments field', () => {
    assert.equal(JSON.stringify(listPayload([])), '{"comments":[]}')
  })

  it('the error payload holds the message', () => {
    assert.equal(JSON.stringify(errorPayload('no such comment')), '{"error":"no such comment"}')
  })

  it('the added payload holds the new id', () => {
    assert.equal(
      JSON.stringify(addedPayload('abc123', 'src/a.kt', 'deadbeef', false)),
      '{"id":"abc123","path":"src/a.kt","revision":"deadbeef","shared":false}',
    )
  })

  it('the resolved payload reports success', () => {
    assert.equal(JSON.stringify(resolvedPayload('abc123')), '{"id":"abc123","resolved":true}')
  })

  it('the opened payload names what the ide showed', () => {
    assert.equal(
      JSON.stringify(openedPayload('abc123', 'diff', 'src/a.kt', 3, 'deadbeef')),
      '{"id":"abc123","opened":"diff","path":"src/a.kt","line":3,"revision":"deadbeef"}',
    )
  })

  it('a plain relative path passes', () => {
    assert.equal(normalizePath('src/main/a.kt'), 'src/main/a.kt')
    assert.equal(normalizePath('src/a.ts'), 'src/a.ts')
  })

  it('a backslash becomes a forward slash', () => {
    assert.equal(normalizePath('src\\main\\a.kt'), 'src/main/a.kt')
    assert.equal(normalizePath('src\\a.ts'), 'src/a.ts')
  })

  it('a leading dot segment is dropped', () => {
    assert.equal(normalizePath('./src/./a.kt'), 'src/a.kt')
    assert.equal(normalizePath('./src/a.ts'), 'src/a.ts')
  })

  it('an inner parent segment is folded', () => {
    assert.equal(normalizePath('src/main/../a.kt'), 'src/a.kt')
    assert.equal(normalizePath('src/x/../a.ts'), 'src/a.ts')
  })

  it('a path that leaves the project is rejected', () => {
    assert.equal(normalizePath('../secrets.txt'), undefined)
    assert.equal(normalizePath('src/../../secrets.txt'), undefined)
    assert.equal(normalizePath('../a'), undefined)
  })

  it('an absolute path is rejected', () => {
    assert.equal(normalizePath('/etc/passwd'), undefined)
    assert.equal(normalizePath('C:\\Windows\\win.ini'), undefined)
    assert.equal(normalizePath('\\\\server\\share\\file'), undefined)
    assert.equal(normalizePath('/a'), undefined)
    assert.equal(normalizePath('C:/a'), undefined)
  })

  it('an empty path is rejected', () => {
    assert.equal(normalizePath('   '), undefined)
    assert.equal(normalizePath('.'), undefined)
    assert.equal(normalizePath(''), undefined)
  })

  it('a good range has no problem', () => {
    assert.equal(rangeProblem(1, 1), undefined)
    assert.equal(rangeProblem(3, 9), undefined)
  })

  it('a line below one is a problem', () => {
    assert.equal(rangeProblem(0, 4), 'startLine must be 1 or more.')
  })

  it('an end line before the start line is a problem', () => {
    assert.equal(rangeProblem(7, 4), 'endLine must be equal to startLine or larger.')
  })

  it('an end line above the signed 32-bit range is a problem', () => {
    assert.equal(rangeProblem(1, 2_147_483_647), undefined)
    assert.equal(rangeProblem(1, 2_147_483_648), 'endLine must be 2147483647 or less.')
  })

  it('a hexadecimal revision passes', () => {
    assert.equal(isCommitRevision('deadbee'), true)
    assert.equal(isCommitRevision('4f2c8b1'), true)
    assert.equal(isCommitRevision('4f9a1c2b3d4e5f60718293a4b5c6d7e8f9012345'), true)
  })

  it('a revision that could pass as a git option is rejected', () => {
    assert.equal(isCommitRevision('--upload-pack=calc'), false)
    assert.equal(isCommitRevision('--all'), false)
    assert.equal(isCommitRevision('HEAD'), false)
    assert.equal(isCommitRevision('dead'), false)
    assert.equal(isCommitRevision(''), false)
  })

  // --- The store decides whether a record is shared ---

  it('a comment of a folder store is never shared', () => {
    assert.equal(isSharedRow('folder', DISCUSS), false)
    assert.equal(rowOf(stored(DISCUSS), false, 'folder', HANDLE)?.shared, false)
  })

  it('a comment of a shared ref in a repository is shared', () => {
    assert.equal(isSharedRow('git', DISCUSS), true)
  })

  it('a failed push leaves the comment unshared', () => {
    assert.equal(isSharedRow('git', DISCUSS, 'the remote refused'), false)
  })
})
