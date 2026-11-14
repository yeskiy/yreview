import { strict as assert } from 'node:assert'

import { encodeBatch } from '../../../src/bridge/batch'
import {
  COMMIT_REASON,
  ID_REASON,
  MAX_EVENT_CHARS,
  PATH_REASON,
  REVISION_REASON,
  TEXT_REASON,
  buildBatches,
  type BatchPlan,
  type BatchTask,
} from '../../../src/bridge/batchBuilder'

const commit = '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6'
const task = (overrides: Partial<BatchTask> = {}): BatchTask => ({
  id: 'yabc12',
  path: 'src/a.ts',
  startLine: 3,
  endLine: 4,
  revision: commit,
  text: 'Fix it.',
  ...overrides,
})
const fixed = (): string => 'b0'
const ESC = String.fromCharCode(27)
const firstJson = (plan: BatchPlan): string => encodeBatch(plan.batches[0] ?? assert.fail())
const firstComment = (plan: BatchPlan) => plan.batches[0]?.comments[0] ?? assert.fail()

describe('batch builder (BatchBuilderTest.kt)', () => {
  it('carries one comment into one batch', () => {
    const plan = buildBatches('main', commit, [task()])
    assert.equal(plan.batches.length, 1)
    assert.equal(plan.batches[0]?.comments.length, 1)
    assert.match(plan.batches[0]?.batchId ?? '', /^[0-9a-f]{12}$/)
  })

  it('writes only the fields the contract names', () => {
    assert.equal(
      firstJson(buildBatches('main', commit, [task()], fixed)),
      `{"batchId":"b0","branch":"main","commit":"${commit}","comments":[{"id":"yabc12","path":"src/a.ts","startLine":3,"endLine":4,"revision":"${commit}","text":"Fix it."}]}`,
    )
  })

  it('carries the characters of a part of a line', () => {
    const json = firstJson(buildBatches('main', commit, [task({ startColumn: 4, endColumn: 9 })]))
    assert.ok(json.includes('"startColumn":4'))
    assert.ok(json.includes('"endColumn":9'))
  })

  it('writes no character field for a task of whole lines', () => {
    const json = firstJson(buildBatches('main', commit, [task()]))
    assert.equal(json.includes('startColumn'), false)
    assert.equal(json.includes('endColumn'), false)
  })

  it('writes a text that holds a line break as one line of JSON', () =>
    assert.equal(
      firstJson(buildBatches('main', commit, [task({ text: 'a\nb' })])).includes('\n'),
      false,
    ))

  it('leaves out a task that has no revision', () =>
    assert.deepEqual(buildBatches('main', commit, [task({ revision: '' })]).dropped, [
      { id: 'yabc12', reason: REVISION_REASON },
    ]))

  it('leaves out a task that has no text', () =>
    assert.deepEqual(buildBatches('main', commit, [task({ text: '' })]).dropped, [
      { id: 'yabc12', reason: TEXT_REASON },
    ]))

  it('leaves out a task whose text holds control characters alone and keeps the batch', () => {
    const plan = buildBatches('main', commit, [
      task({ id: 'ya', text: String.fromCharCode(7, 27) }),
      task({ id: 'yb' }),
    ])
    assert.deepEqual(plan.dropped, [{ id: 'ya', reason: TEXT_REASON }])
    assert.equal(plan.tasks, 1)
  })

  it('makes no batch when every text is control characters alone', () => {
    const plan = buildBatches('main', commit, [
      task({ id: 'ya', text: String.fromCharCode(7) }),
      task({ id: 'yb', text: ESC }),
    ])
    assert.deepEqual(plan.batches, [])
    assert.equal(plan.dropped.length, 2)
  })

  it('splits a batch at the schema maximum so every event stays under the channel limit', () => {
    const big = 'x'.repeat(19_000)
    const plan = buildBatches(
      'main',
      commit,
      Array.from({ length: 450 }, (_, at) => task({ id: `y${at}`, text: big })),
    )
    assert.equal(plan.tasks, 450)
    plan.batches.forEach((batch) => {
      assert.ok(batch.comments.length <= 200)
      assert.ok(
        `data: ${encodeBatch({ ...batch, batchId: 'x'.repeat(200) })}\n\n`.length <=
          MAX_EVENT_CHARS,
      )
    })
  })

  it('splits a batch by size when the comments of one batch pass the event limit', () => {
    const big = 'x'.repeat(19_999)
    const branch = 'b'.repeat(255)
    const plan = buildBatches(
      branch,
      commit,
      Array.from({ length: 400 }, (_, at) =>
        task({ id: `y${at}`, path: 'p'.repeat(1024), text: big }),
      ),
    )
    assert.equal(plan.tasks, 400)
    assert.ok(plan.batches.some((batch) => batch.comments.length < 200))
    plan.batches.forEach((batch) =>
      assert.ok(
        `data: ${encodeBatch({ ...batch, batchId: 'x'.repeat(200) })}\n\n`.length <=
          MAX_EVENT_CHARS,
      ),
    )
  })

  it('carries a comment that a migration moved out of a folder store', () =>
    assert.equal(buildBatches('main', commit, [task({ revision: 'worktree' })]).tasks, 1))

  it('leaves out a task whose revision is not a revision', () =>
    assert.deepEqual(buildBatches('main', commit, [task({ revision: 'a b' })]).dropped, [
      { id: 'yabc12', reason: REVISION_REASON },
    ]))

  it('leaves out a task whose path holds a control character', () =>
    assert.deepEqual(
      buildBatches('main', commit, [task({ path: `a${String.fromCharCode(0x85)}b` })]).dropped,
      [{ id: 'yabc12', reason: PATH_REASON }],
    ))

  it('leaves out a task whose identifier breaks the channel rule', () =>
    assert.deepEqual(buildBatches('main', commit, [task({ id: 'y a' })]).dropped, [
      { id: 'y a', reason: ID_REASON },
    ]))

  it('names every task it dropped', () =>
    assert.deepEqual(
      buildBatches('main', commit, [task({ id: 'ya' }), task({ id: 'yb', text: '' })]).dropped,
      [{ id: 'yb', reason: TEXT_REASON }],
    ))

  it('keeps the good tasks when one task is bad', () => {
    const plan = buildBatches('main', commit, [
      task({ id: 'ya' }),
      task({ id: 'yb', revision: '' }),
      task({ id: 'yc' }),
    ])
    assert.deepEqual(
      plan.batches.flatMap((batch) => batch.comments.map((comment) => comment.id)),
      ['ya', 'yc'],
    )
    assert.deepEqual(plan.dropped, [{ id: 'yb', reason: REVISION_REASON }])
  })

  it('names both reasons when two rules break', () => {
    const plan = buildBatches('main', commit, [
      task({ id: 'ya', path: `a${String.fromCharCode(10)}b` }),
      task({ id: 'yb', text: ' ' }),
    ])
    assert.equal(plan.reason, `${PATH_REASON} and ${TEXT_REASON}`)
  })

  it('a cut of the text keeps every character whole', () => {
    const text = `${'a'.repeat(19_999)}${String.fromCodePoint(0x1f600)}`
    assert.equal(firstComment(buildBatches('main', commit, [task({ text })])).text.length, 19_999)
  })

  it('a cut of the branch name keeps every character whole', () => {
    const branch = `${'a'.repeat(254)}${String.fromCodePoint(0x1f600)}`
    assert.equal(buildBatches(branch, commit, [task()]).batches[0]?.branch.length, 254)
  })

  it('cuts a text that is longer than the contract allows', () =>
    assert.equal(
      firstComment(buildBatches('main', commit, [task({ text: 'a'.repeat(25_000) })])).text.length,
      20_000,
    ))

  it('keeps every line number inside the range the contract allows', () => {
    const comment = firstComment(
      buildBatches('main', commit, [task({ startLine: -5, endLine: 20_000_000 })]),
    )
    assert.deepEqual([comment.startLine, comment.endLine], [0, 10_000_000])
  })

  it('splits more comments than one batch may hold', () => {
    const plan = buildBatches(
      'main',
      commit,
      Array.from({ length: 201 }, (_, at) => task({ id: `y${at}` })),
    )
    assert.deepEqual(
      plan.batches.map((batch) => batch.comments.length),
      [200, 1],
    )
  })

  it('sends nothing when the commit is not a revision', () => {
    const plan = buildBatches('main', 'not a commit', [task()])
    assert.deepEqual(plan.batches, [])
    assert.deepEqual(plan.dropped, [{ id: 'yabc12', reason: COMMIT_REASON }])
    assert.equal(plan.reason, COMMIT_REASON)
  })

  it('names the branch HEAD when the repository has no branch', () =>
    assert.equal(buildBatches('', commit, [task()]).batches[0]?.branch, 'HEAD'))

  it('drops a control character from the branch name', () =>
    assert.equal(buildBatches(`ma${ESC}in`, commit, [task()]).batches[0]?.branch, 'main'))

  it('makes a batch id the contract accepts', () =>
    assert.match(
      buildBatches('main', commit, [task()]).batches[0]?.batchId ?? '',
      /^[A-Za-z0-9_-]{1,200}$/,
    ))

  it('the batch carries no escape sequence', () =>
    assert.equal(
      firstComment(buildBatches('main', commit, [task({ text: `${ESC}[31mred` })])).text,
      '[31mred',
    ))
})
