import assert from 'node:assert/strict'
import { assignTodoIds } from '../../../src/core/taskIds'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { TaskChecks } from '../../../src/tasks/taskChecks'
import { todo } from './fixtures'

const item = (id: string, path = 'src/A.kt', root = '/repo'): ReviewTask =>
  todo({ id, path, text: `work on ${id}`, filePath: `${root}/${path}`, rootPath: root })

const first = item('a')
const second = item('b')

describe('task checks', () => {
  it('checks no task at the start', () => {
    const checks = new TaskChecks()

    assert.equal(checks.size, 0)
    assert.equal(checks.isChecked(first), false)
    assert.equal(checks.state([first, second]), 'none')
  })

  it('checks one task', () => {
    const checks = new TaskChecks()

    checks.set([first], true)

    assert.equal(checks.isChecked(first), true)
    assert.equal(checks.isChecked(second), false)
    assert.deepEqual(
      checks.checkedOf([first, second]).map((task) => task.id),
      ['a'],
    )
  })

  it('reports the third state when a part of the row is checked', () => {
    const checks = new TaskChecks()

    checks.set([first], true)

    assert.equal(checks.state([first, second]), 'some')
  })

  it('reports the full state when every task of the row is checked', () => {
    const checks = new TaskChecks()

    checks.set([first, second], true)

    assert.equal(checks.state([first, second]), 'all')
  })

  it('reports no state for a row with no task', () => {
    assert.equal(new TaskChecks().state([]), 'none')
  })

  it('clears one task and keeps the other one', () => {
    const checks = new TaskChecks()
    checks.set([first, second], true)

    checks.set([second], false)

    assert.equal(checks.state([first, second]), 'some')
    assert.equal(checks.size, 1)
  })

  it('clears every check box', () => {
    const checks = new TaskChecks()
    checks.set([first, second], true)

    checks.clear()

    assert.equal(checks.size, 0)
    assert.equal(checks.state([first, second]), 'none')
  })

  it('keeps the check after a reload builds new task objects', () => {
    const checks = new TaskChecks()
    checks.set([first], true)

    assert.equal(checks.isChecked(item('a')), true)
  })

  it('tells two repositories apart when they share a path', () => {
    const checks = new TaskChecks()
    const other = item('a', 'src/A.kt', '/other')

    checks.set([first], true)

    assert.equal(checks.isChecked(other), false)
    assert.equal(checks.state([first, other]), 'some')
  })

  it('new lines above a todo item keep its check', () => {
    const line = (text: string, at: number): ReviewTask =>
      todo({ id: '', text, startLine: at, endLine: at, filePath: 'E:/repo/src/Main.kt' })
    const before = assignTodoIds('', [line('TODO: a', 4), line('TODO: b', 9)])
    const after = assignTodoIds('', [line('TODO: a', 7), line('TODO: b', 12)])
    const checks = new TaskChecks()
    checks.set(before.slice(1), true)

    assert.equal(checks.isChecked(after[1] ?? first), true)
  })
})
