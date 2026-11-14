import assert from 'node:assert/strict'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import {
  deleteQuestion,
  hasComments,
  isEmptyTarget,
  nextIndex,
  previewTask,
  previousIndex,
  sendDescription,
  sendTarget,
  sendText,
  todoNotice,
  writeTarget,
} from '../../../src/tasks/taskChoice'
import { task, todo } from './fixtures'

const item = (id: string): ReviewTask =>
  todo({
    id,
    path: 'src/A.kt',
    text: `work on ${id}`,
    filePath: '/repo/src/A.kt',
    rootPath: '/repo',
  })

const comment = (id: string): ReviewTask =>
  task({
    id,
    path: 'src/A.kt',
    text: `please look at ${id}`,
    filePath: '/repo/src/A.kt',
    rootPath: '/repo',
  })

const all = [item('a'), item('b'), item('c')]

const ids = (tasks: readonly ReviewTask[]): readonly string[] => tasks.map((row) => row.id)

const TODO_QUESTION =
  'The extension removes 1 TODO item from the source. ' +
  'The files stay unsaved, and an undo in each file puts the text back.'

describe('task choice', () => {
  it('sends the checked tasks first', () => {
    const target = sendTarget([item('a')], [item('b')], all)

    assert.equal(target.scope, 'checked')
    assert.deepEqual(ids(target.tasks), ['a'])
    assert.equal(sendText(target), 'Send Checked (1)')
    assert.equal(sendDescription(target), 'Send the 1 checked task to the agent.')
  })

  it('sends the highlighted rows when no check box is on', () => {
    const target = sendTarget([], [item('b'), item('c')], all)

    assert.equal(target.scope, 'selected')
    assert.equal(sendText(target), 'Send Selected (2)')
    assert.equal(sendDescription(target), 'Send the 2 selected rows to the agent.')
  })

  it('names the whole tree when the user chose nothing', () => {
    const target = sendTarget([], [], all)

    assert.equal(target.scope, 'all')
    assert.deepEqual(ids(target.tasks), ['a', 'b', 'c'])
    assert.equal(sendText(target), 'Send All (3)')
    assert.equal(
      sendDescription(target),
      'No row is checked, so the whole tree goes out. It holds 3 tasks.',
    )
  })

  it('sends nothing from an empty tree', () => {
    const target = sendTarget([], [], [])

    assert.equal(target.scope, 'none')
    assert.deepEqual(target.tasks, [])
    assert.equal(sendText(target), 'Send to the Agent')
  })

  it('walks to the first row when no row is selected', () => {
    assert.equal(nextIndex(3, -1), 0)
  })

  it('walks to the next row and stops at the last one', () => {
    assert.equal(nextIndex(3, 1), 2)
    assert.equal(nextIndex(3, 2), -1)
  })

  it('walks to the previous row and stops at the first one', () => {
    assert.equal(previousIndex(3, 1), 0)
    assert.equal(previousIndex(3, 0), -1)
  })

  it('walks to the last row when no row is selected', () => {
    assert.equal(previousIndex(3, -1), 2)
  })

  it('walks nowhere in an empty tree', () => {
    assert.equal(nextIndex(0, -1), -1)
    assert.equal(previousIndex(0, -1), -1)
  })

  it('a write takes the checked rows first', () => {
    const target = writeTarget([comment('x')], [comment('y')])

    assert.equal(target.scope, 'checked')
    assert.deepEqual(ids(target.comments), ['x'])
  })

  it('a write takes the highlighted rows when no check box is on', () => {
    const target = writeTarget([], [comment('y'), comment('z')])

    assert.equal(target.scope, 'selected')
    assert.deepEqual(ids(target.comments), ['y', 'z'])
  })

  it('a write never falls back to the whole tree', () => {
    const target = writeTarget([], [])

    assert.equal(target.scope, 'none')
    assert.equal(isEmptyTarget(target), true)
    assert.deepEqual(target.comments, [])
    assert.deepEqual(target.todos, [])
  })

  it('a write keeps the todo rows apart from the comments', () => {
    const target = writeTarget([], [item('a'), comment('y'), item('b')])

    assert.deepEqual(ids(target.comments), ['y'])
    assert.deepEqual(ids(target.todos), ['a', 'b'])
  })

  it('a write of todo rows only holds no comment', () => {
    const target = writeTarget([], [item('a')])

    assert.equal(target.scope, 'selected')
    assert.equal(isEmptyTarget(target), false)
    assert.equal(hasComments(target), false)
    assert.deepEqual(ids(target.todos), ['a'])
  })

  it('a write counts one comment once', () => {
    assert.deepEqual(ids(writeTarget([comment('x'), comment('x')], []).comments), ['x'])
  })

  it('the delete question names the risk and the count', () => {
    assert.equal(
      deleteQuestion(writeTarget([comment('x'), comment('y')], [])),
      'You cannot put a review comment back. ' +
        'The extension removes 2 review comments from the git notes.',
    )
  })

  it('the delete question of todo rows only names the source', () => {
    assert.equal(deleteQuestion(writeTarget([], [item('a')])), TODO_QUESTION)
  })

  it('the delete question of a mixed selection names both counts', () => {
    assert.equal(
      deleteQuestion(writeTarget([], [comment('y'), item('a'), item('b')])),
      'You cannot put a review comment back. ' +
        'The extension removes 1 review comment from the git notes. ' +
        'The extension removes 2 TODO items from the source. ' +
        'The files stay unsaved, and an undo in each file puts the text back.',
    )
  })

  it('a resolve needs a review comment and a delete does not', () => {
    const todosOnly = writeTarget([], [item('a')])
    const nothing = writeTarget([], [])

    assert.equal(hasComments(todosOnly), false)
    assert.equal(isEmptyTarget(todosOnly), false)
    assert.equal(hasComments(nothing), false)
    assert.equal(isEmptyTarget(nothing), true)
  })

  it('the notice names the todo rows a write leaves alone', () => {
    assert.equal(
      todoNotice(writeTarget([], [comment('y'), item('a')])),
      'A TODO lives in the source file and not in a note. The extension kept 1 TODO row.',
    )
  })

  it('the notice stays empty when every row is a comment', () => {
    assert.equal(todoNotice(writeTarget([comment('x')], [])), '')
  })

  it('the preview takes the first row of the selection', () => {
    assert.equal(previewTask([item('b'), item('c')], all)?.id, 'b')
  })

  it('the preview takes the first row of the tree when no row is selected', () => {
    assert.equal(previewTask([], all)?.id, 'a')
  })

  it('the preview stays empty when the tree is empty', () => {
    assert.equal(previewTask([], []), undefined)
  })
})
