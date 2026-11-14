import assert from 'node:assert/strict'

import { type ReviewRecord, encodeRecord, recordId } from '../../../src/core/record'
import { NotesGateway } from '../../../src/git/notes'
import { type GitRunner, ProcessGitRunner } from '../../../src/git/runner'
import { CommentBook, type StoredComment } from '../../../src/store/commentBook'
import { LOCAL } from '../../../src/store/noteRefs'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const WRITERS = 4
const line = (n: number) => ({ startLine: n, endLine: n })
const book = (runner: GitRunner): CommentBook =>
  new CommentBook(new NotesGateway(runner), () => Promise.resolve('reviewer@example.com'))

/** Runs `between` one time, right after the first `git notes show` of the wrapped runner. */
const writerBetween = (real: GitRunner, between: () => Promise<void>): GitRunner => {
  const state = { done: false }
  return {
    run: async (args, signal) => {
      const result = await real.run(args, signal)
      if (args[0] === 'notes' && args.includes('show') && !state.done) {
        state.done = true
        await between()
      }
      return result
    },
  }
}

describe('comment book race', function race() {
  this.timeout(240_000)
  const repos: string[] = []
  after(() => repos.forEach(removeDir))
  const fresh = () => {
    const repo = makeRepo()
    repos.push(repo)
    return { repo, head: git(repo, 'rev-parse', 'HEAD') }
  }

  it('a delete keeps a comment that another writer added after the read', async () => {
    const { repo, head } = fresh()
    const real = new ProcessGitRunner(repo)
    const gone = await book(real).add(LOCAL, head, 'a.kt', line(1), 'delete this one')
    const kept = await book(real).add(LOCAL, head, 'a.kt', line(2), 'keep this one')
    const late: ReviewRecord = {
      timestamp: '2',
      author: 'agent@example.com',
      description: 'the agent wrote this one',
      location: { commit: head, path: 'a.kt', range: line(3) },
    }
    // A second process writes, so the lock of this process does not hold it back.
    const racing = writerBetween(real, () => {
      git(repo, 'notes', '--ref', LOCAL, 'append', '-m', encodeRecord(late), head)
      return Promise.resolve()
    })
    await book(racing).remove([gone])
    assert.deepEqual(
      new Set((await book(real).list(head)).map((s) => s.id)),
      new Set([kept.id, recordId(late)]),
    )
  })

  it('writers on several gateways lose no comment', async () => {
    const { repo, head } = fresh()
    const fromNew = () => book(new ProcessGitRunner(repo))
    const doomed = await Array.from({ length: WRITERS }, (_, index) => index + 1).reduce<
      Promise<readonly StoredComment[]>
    >(
      (chain, index) =>
        chain.then(async (done) => [
          ...done,
          await fromNew().add(LOCAL, head, 'a.kt', line(index), `delete ${index}`),
        ]),
      Promise.resolve([]),
    )
    const [added] = await Promise.all([
      Promise.all(
        Array.from({ length: WRITERS }, (_, index) =>
          fromNew().add(LOCAL, head, 'a.kt', line(100 + index), `add ${index}`),
        ),
      ),
      Promise.all(doomed.map((record) => fromNew().remove([record]))),
    ])
    assert.equal(new Set(added.map((s) => s.id)).size, WRITERS)
    assert.deepEqual(
      new Set((await fromNew().list(head)).map((s) => s.id)),
      new Set(added.map((s) => s.id)),
    )
  })
})
