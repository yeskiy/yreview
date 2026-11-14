import assert from 'node:assert/strict'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import {
  EMPTY_FACTS,
  type ToolbarFacts,
  copyText,
  hasComments,
  isEmptyTarget,
  sendText,
  toolbarFacts,
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

const all = [item('a'), comment('b'), item('c')]

interface FactsInput {
  readonly selected?: readonly ReviewTask[]
  readonly checked?: readonly ReviewTask[]
  readonly checkCount?: number
  readonly rows?: readonly ReviewTask[]
}

const facts = ({
  selected = [],
  checked = [],
  checkCount,
  rows = all,
}: FactsInput = {}): ToolbarFacts =>
  toolbarFacts(rows, selected, checked, checkCount ?? checked.length)

const ids = (tasks: readonly ReviewTask[]): readonly string[] => tasks.map((row) => row.id)

describe('toolbar facts', () => {
  it('sends the checked rows before the highlighted rows', () => {
    const found = facts({ selected: [item('c')], checked: [item('a')] })

    assert.equal(found.send.scope, 'checked')
    assert.deepEqual(ids(found.send.tasks), ['a'])
    assert.equal(sendText(found.send), 'Send Checked (1)')
    assert.equal(copyText(found.send), 'Copy Checked (1)')
  })

  it('sends the highlighted rows when no check box is on', () => {
    const found = facts({ selected: [item('c')] })

    assert.equal(found.send.scope, 'selected')
    assert.equal(sendText(found.send), 'Send Selected (1)')
  })

  it('sends the whole tree when the user chose nothing', () => {
    const found = facts()

    assert.equal(found.send.scope, 'all')
    assert.deepEqual(ids(found.send.tasks), ['a', 'b', 'c'])
  })

  it('keeps a write away from the whole tree', () => {
    const found = facts()

    assert.equal(found.write.scope, 'none')
    assert.equal(isEmptyTarget(found.write), true)
    assert.equal(hasComments(found.write), false)
  })

  it('splits a write by kind', () => {
    const found = facts({ checked: [item('a'), comment('b')] })

    assert.equal(found.write.scope, 'checked')
    assert.deepEqual(ids(found.write.comments), ['b'])
    assert.deepEqual(ids(found.write.todos), ['a'])
    assert.equal(hasComments(found.write), true)
    assert.equal(isEmptyTarget(found.write), false)
  })

  it('names an empty tree', () => {
    const found = facts({ rows: [] })

    assert.equal(found.anyTask, false)
    assert.equal(found.send.scope, 'none')
    assert.equal(sendText(found.send), 'Send to the Agent')
  })

  it('names a tree that holds a task', () => {
    assert.equal(facts().anyTask, true)
  })

  it('counts a check box of a row that a filter hides', () => {
    assert.equal(facts({ rows: [item('a')], checkCount: 2 }).anyCheck, true)
  })

  it('clears the check count when no box is on', () => {
    assert.equal(facts().anyCheck, false)
  })

  it('disables every button of a toolbar that reaches no tree', () => {
    assert.equal(EMPTY_FACTS.anyTask, false)
    assert.equal(EMPTY_FACTS.anyCheck, false)
    assert.equal(EMPTY_FACTS.send.scope, 'none')
    assert.equal(EMPTY_FACTS.write.scope, 'none')
    assert.equal(isEmptyTarget(EMPTY_FACTS.write), true)
    assert.equal(hasComments(EMPTY_FACTS.write), false)
  })
})
