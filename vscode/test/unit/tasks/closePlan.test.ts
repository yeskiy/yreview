import assert from 'node:assert/strict'

import { todoId } from '../../../src/core/taskIds'
import {
  MAX_CLOSE_IDS,
  NO_CAP,
  TOO_MANY,
  overflowProblem,
  planClose,
} from '../../../src/tasks/taskCompletion'

const comment = 'c3f9a12aabbccddeeff00112233445566778899a'
const todo = todoId('', 'src/Main.kt', 'TODO: drop this', 0)

/** Comment identifiers, each one a name that the extension itself could make. */
const many = (count: number): readonly string[] =>
  Array.from({ length: count }, (_, index) => (index + 1).toString(16).padStart(40, '0'))

describe('ClosePlan', () => {
  it('a plan takes both kinds', () => {
    const plan = planClose([comment, todo])
    assert.deepEqual(plan.comments, [comment])
    assert.deepEqual(plan.todos, [todo])
    assert.deepEqual(plan.dropped, [])
  })

  it('one identifier that arrives twice reaches the plan once', () => {
    const plan = planClose([comment, comment, todo, todo])
    assert.deepEqual(plan.comments, [comment])
    assert.deepEqual(plan.todos, [todo])
  })

  it('one batch holds no more identifiers than the channel takes', () => {
    assert.equal(planClose(many(MAX_CLOSE_IDS + 50)).comments.length, MAX_CLOSE_IDS)
  })

  it('a batch inside the cap keeps every identifier', () => {
    const plan = planClose(many(MAX_CLOSE_IDS))
    assert.equal(plan.comments.length, MAX_CLOSE_IDS)
    assert.deepEqual(plan.dropped, [])
    assert.equal(overflowProblem(plan), undefined)
  })

  it('a caller that states no cap keeps every identifier', () => {
    const plan = planClose(many(MAX_CLOSE_IDS + 50), NO_CAP)
    assert.equal(plan.comments.length, MAX_CLOSE_IDS + 50)
    assert.deepEqual(plan.dropped, [])
    assert.equal(overflowProblem(plan), undefined)
  })

  it('a caller that states a cap of its own takes that one', () => {
    const plan = planClose(many(10), 4)
    assert.equal(plan.comments.length, 4)
    assert.equal(plan.dropped.length, 6)
  })

  it('the problem names how many identifiers the cap left out', () => {
    const plan = planClose(many(MAX_CLOSE_IDS + 50))
    assert.equal(plan.dropped.length, 50)
    const problem = overflowProblem(plan) ?? ''
    assert.ok(problem.startsWith(TOO_MANY), `the reason comes first: ${problem}`)
    assert.ok(problem.includes('50'), problem)
  })

  it('the cap counts a todo identifier with the comments', () => {
    const plan = planClose([...many(MAX_CLOSE_IDS), todo])
    assert.deepEqual(plan.dropped, [todo])
    assert.deepEqual(plan.todos, [])
  })
})
