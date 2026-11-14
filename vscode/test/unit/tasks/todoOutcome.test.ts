import assert from 'node:assert/strict'

import { handleOf } from '../../../src/core/handles'
import { TODO_PREFIX, legacyTodoId, todoId } from '../../../src/core/taskIds'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { AMBIGUOUS, ambiguous, todoOutcome } from '../../../src/tasks/taskCompletion'
import { todo as todoTask } from './fixtures'

const open = (id: string, path = 'src/Main.kt', line = 12): ReviewTask =>
  todoTask({ id, path, startLine: line, endLine: line, text: 'TODO: drop this' })

const todo = todoId('', 'src/Main.kt', 'TODO: drop this', 0)
const handle = handleOf(todo)
const other = todoId('', 'src/Other.kt', 'TODO: drop this', 0)
// Two TODO lines with the same key and the same number, so one handle names both.
const twin = `${TODO_PREFIX}c3f9a12a${'0'.repeat(32)}-0`
const otherTwin = `${TODO_PREFIX}c3f9a12a${'f'.repeat(32)}-0`
const twinHandle = handleOf(twin)

describe('TodoOutcome', () => {
  it('an identifier this window handed out and no longer finds closed', () => {
    const outcome = todoOutcome([todo], [], new Set([handle]))
    assert.deepEqual(outcome.closed, [todo])
    assert.deepEqual(outcome.stillOpen, [])
  })

  it('an identifier whose line is still in the source closed nothing', () => {
    const outcome = todoOutcome([todo], [open(todo)], new Set([handle]))
    assert.deepEqual(outcome.closed, [])
    assert.deepEqual(outcome.stillOpen, [todo])
  })

  it('new lines above a todo item keep it open', () => {
    const outcome = todoOutcome([handle], [open(todo, 'src/Main.kt', 15)], new Set([handle]))
    assert.deepEqual(outcome.closed, [])
    assert.deepEqual(outcome.stillOpen, [handle])
  })

  it('an identifier this window never handed out counts nothing and says nothing', () => {
    const outcome = todoOutcome([other], [], new Set([handle]))
    assert.deepEqual(outcome.closed, [])
    assert.deepEqual(outcome.stillOpen, [])
  })

  it('the short handle and the long identifier name the same task', () => {
    assert.deepEqual(todoOutcome([handle], [], new Set([handle])).closed, [handle])
    assert.deepEqual(todoOutcome([todo], [], new Set([handle])).closed, [todo])
  })

  it('a value of an older build names the item that is still at its path and line', () => {
    const legacy = handleOf(legacyTodoId('src/Main.kt', 12))
    const outcome = todoOutcome([legacy], [open(todo)], new Set([legacy]))
    assert.deepEqual(outcome.closed, [])
    assert.deepEqual(outcome.stillOpen, [legacy])
  })

  it('a value of an older build whose line went closed', () => {
    const legacy = legacyTodoId('src/Main.kt', 12)
    assert.deepEqual(todoOutcome([legacy], [], new Set([handleOf(legacy)])).closed, [legacy])
  })

  it('a handle that names two tasks closes nothing', () => {
    const outcome = todoOutcome([twinHandle], [open(twin), open(otherTwin)], new Set([twinHandle]))
    assert.deepEqual(outcome.closed, [])
    assert.deepEqual(outcome.stillOpen, [])
  })

  it('a handle that names two tasks tells the agent what a comment id tells it', () => {
    const outcome = todoOutcome([twinHandle], [open(twin), open(otherTwin)], new Set([twinHandle]))
    assert.deepEqual(outcome.problems, [ambiguous(twinHandle, 2)])
    assert.ok(outcome.problems[0]?.includes(AMBIGUOUS))
  })

  it('an empty batch reads nothing', () => {
    const outcome = todoOutcome([], [open(todo)], new Set([handle]))
    assert.deepEqual(outcome.closed, [])
    assert.deepEqual(outcome.stillOpen, [])
  })
})
