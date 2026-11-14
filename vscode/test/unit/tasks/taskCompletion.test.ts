import assert from 'node:assert/strict'

import { handleOf } from '../../../src/core/handles'
import { todoId } from '../../../src/core/taskIds'
import { NotesWriteError } from '../../../src/git/errors'
import { LOCAL } from '../../../src/store/noteRefs'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import {
  type CompletionHost,
  type FoundComment,
  TaskCompletion,
  isQuiet,
  problemOf,
} from '../../../src/tasks/taskCompletion'
import { todo as todoTask } from './fixtures'

const TODO_ID = todoId('', 'src/Main.kt', 'TODO: drop this', 0)
const COMMENT_ID = 'c3f9a12aabbccddeeff00112233445566778899a'
const UNKNOWN_ID = '0'.repeat(40)

const found = (id: string): FoundComment => ({
  store: 'git',
  root: 'E:/repo',
  stored: {
    id,
    ref: LOCAL,
    commit: 'c1',
    record: {
      timestamp: '2026-11-14T10:00:00Z',
      author: 'reviewer@example.com',
      description: 'Check this.',
      location: { commit: 'c1', path: 'src/Main.kt' },
    },
  },
})

interface FakeOptions {
  readonly comments?: readonly FoundComment[]
  readonly closed?: readonly string[]
  readonly openTodos?: readonly ReviewTask[]
  readonly sent?: readonly string[]
  readonly failure?: Error
}

const fake = (options: FakeOptions = {}) => {
  const resolved: string[] = []
  const host: CompletionHost = {
    comments: () => Promise.resolve(options.comments ?? []),
    isClosed: (entry) => Promise.resolve((options.closed ?? []).includes(entry.stored.id)),
    resolve: (entry) => {
      if (options.failure !== undefined) return Promise.reject(options.failure)
      resolved.push(entry.stored.id)
      return Promise.resolve()
    },
    openTodos: () => Promise.resolve(options.openTodos ?? []),
    sent: () => Promise.resolve(new Set(options.sent ?? [])),
  }
  return { host, resolved }
}

describe('TaskCompletion', () => {
  it('a reported todo item that this project cannot see closes nothing', async () => {
    const report = await new TaskCompletion(fake().host).close([TODO_ID])
    assert.equal(report.closed, 0)
    assert.equal(problemOf(report), undefined)
    assert.ok(isQuiet(report), 'a report that proves no close must stay quiet')
  })

  it('a comment id closes its comment', async () => {
    const made = fake({ comments: [found(COMMENT_ID)] })
    const report = await new TaskCompletion(made.host).close([COMMENT_ID])
    assert.deepEqual(report, { closed: 1, problems: [] })
    assert.deepEqual(made.resolved, [COMMENT_ID])
  })

  it('a handle closes its comment', async () => {
    const made = fake({ comments: [found(COMMENT_ID)] })
    const report = await new TaskCompletion(made.host).close([handleOf(COMMENT_ID)])
    assert.equal(report.closed, 1)
    assert.deepEqual(made.resolved, [COMMENT_ID])
  })

  it('an unknown id is a problem', async () => {
    const report = await new TaskCompletion(fake({ comments: [found(COMMENT_ID)] }).host).close([
      UNKNOWN_ID,
    ])
    assert.deepEqual(report, {
      closed: 0,
      problems: [`The extension holds no open task with the id ${UNKNOWN_ID}.`],
    })
  })

  it('a value that is no id is a problem', async () => {
    const report = await new TaskCompletion(fake().host).close(['--force'])
    assert.deepEqual(report, {
      closed: 0,
      problems: ['The extension holds no open task with the id --force.'],
    })
  })

  it('a closed comment closes nothing and says nothing', async () => {
    const made = fake({ comments: [found(COMMENT_ID)], closed: [COMMENT_ID] })
    const report = await new TaskCompletion(made.host).close([COMMENT_ID])
    assert.deepEqual(report, { closed: 0, problems: [] })
    assert.deepEqual(made.resolved, [])
  })

  it('a write failure names the value', async () => {
    const made = fake({ comments: [found(COMMENT_ID)], failure: new NotesWriteError('locked') })
    const report = await new TaskCompletion(made.host).close([COMMENT_ID])
    assert.deepEqual(report, {
      closed: 0,
      problems: [`The extension could not resolve ${COMMENT_ID}. locked`],
    })
  })

  it('another failure goes to the caller', async () => {
    const made = fake({ comments: [found(COMMENT_ID)], failure: new Error('x') })
    await assert.rejects(new TaskCompletion(made.host).close([COMMENT_ID]), /x/)
  })

  it('a TODO whose line is still there stays open', async () => {
    const made = fake({ openTodos: [todoTask({ id: TODO_ID })], sent: [handleOf(TODO_ID)] })
    const report = await new TaskCompletion(made.host).close([TODO_ID])
    assert.deepEqual(report, {
      closed: 0,
      problems: [`The line of the task ${TODO_ID} is still in the source.`],
    })
  })

  it('a sent TODO whose line is gone closes', async () => {
    const report = await new TaskCompletion(fake({ sent: [handleOf(TODO_ID)] }).host).close([
      TODO_ID,
    ])
    assert.deepEqual(report, { closed: 1, problems: [] })
  })

  it('ids over the cap give the overflow problem', async () => {
    const ids = Array.from({ length: 201 }, (_, index) =>
      (index + 1).toString(16).padStart(40, '0'),
    )
    const report = await new TaskCompletion(fake().host).close(ids)
    assert.equal(report.closed, 0)
    assert.equal(
      report.problems.at(-1),
      'The extension closes at most 200 tasks at one time. It left 1 out, so report them again.',
    )
  })
})
