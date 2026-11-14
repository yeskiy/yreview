import assert from 'node:assert/strict'
import {
  CHANGES_TITLE,
  CHANGES_TOOLTIP,
  type ChangeFacts,
  changedFiles,
  changesEmptyText,
  keepChanged,
} from '../../../src/tasks/changeTab'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { todo } from './fixtures'

const item = (id: string, path: string, filePath: string): ReviewTask =>
  todo({ id, path, text: 'TODO write the test', filePath })

const facts = (gitFound = true, files: readonly string[] = []): ChangeFacts => ({
  gitFound,
  files: new Set(files),
})

describe('local changes tab', () => {
  // --- The files the view selects ---

  it('takes the file of every change', () => {
    assert.deepEqual(
      changedFiles(['C:/work/a.kt', 'C:/work/b.kt']),
      new Set(['C:/work/a.kt', 'C:/work/b.kt']),
    )
  })

  it('drops a change that deletes its file', () => {
    assert.deepEqual(changedFiles(['C:/work/a.kt', undefined]), new Set(['C:/work/a.kt']))
  })

  it('drops a change that names an empty path', () => {
    assert.deepEqual(changedFiles(['C:/work/a.kt', '']), new Set(['C:/work/a.kt']))
  })

  it('gives one path for two changes of one file', () => {
    assert.deepEqual(changedFiles(['C:/work/a.kt', 'C:/work/a.kt']), new Set(['C:/work/a.kt']))
  })

  it('gives no file for a changelist that holds no change', () => {
    assert.equal(changedFiles([]).size, 0)
  })

  // --- The tasks the view keeps ---

  it('keeps the tasks of the changed files only', () => {
    const inside = item('1', 'a.kt', 'C:/work/a.kt')
    const outside = item('2', 'b.kt', 'C:/work/b.kt')

    assert.deepEqual(keepChanged([inside, outside], new Set(['C:/work/a.kt'])), [inside])
  })

  it('keeps every task of one changed file', () => {
    const first = item('1', 'a.kt', 'C:/work/a.kt')
    const second = item('2', 'a.kt', 'C:/work/a.kt')

    assert.deepEqual(keepChanged([first, second], new Set(['C:/work/a.kt'])), [first, second])
  })

  it('keeps no task when the changelist holds no file', () => {
    assert.deepEqual(keepChanged([item('1', 'a.kt', 'C:/work/a.kt')], new Set()), [])
  })

  // --- The name and the tooltip of the view ---

  it('names the local changes when the project keeps no changelist', () => {
    assert.equal(CHANGES_TITLE, 'Local Changes')
  })

  it('the tooltip says that the tab shows every task of the changed files', () => {
    assert.equal(CHANGES_TOOLTIP, 'Every open review task of the files of the local changes.')
  })

  // --- The empty tree ---

  it('a project without version control says so', () => {
    assert.equal(changesEmptyText(facts(false)), 'This workspace has no git repository.')
  })

  it('an empty changelist of a project without changelists names the local changes', () => {
    assert.equal(changesEmptyText(facts()), 'No file is in the local changes.')
  })

  it('a changelist without a task says that it holds no task', () => {
    assert.equal(
      changesEmptyText(facts(true, ['C:/work/a.kt'])),
      'No open review task is in the local changes.',
    )
  })
})
