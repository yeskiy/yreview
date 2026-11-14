import assert from 'node:assert/strict'

import { handleOf } from '../../../src/core/handles'
import type { TaskDocument, TaskEntry, TaskKind } from '../../../src/core/taskDocument'
import { TASKS_VERSION } from '../../../src/core/taskDocument'
import { legacyTodoId, todoId } from '../../../src/core/taskIds'
import { type OpenTodo, migrateDocument } from '../../../src/tasks/todoMigration'

const open: OpenTodo = {
  id: 'todo-current',
  kind: 'todo',
  path: 'src/a.ts',
  startLine: 3,
  text: 'TODO: check the cap',
  rootPath: '/repo',
}

const document = (version: number): TaskDocument => ({
  version,
  repository: '/repo',
  commit: '',
  generated: '2026-11-14T10:00:00Z',
  tasks: [
    {
      id: legacyTodoId('src/a.ts', 3),
      kind: 'todo',
      path: 'src/a.ts',
      startLine: 3,
      endLine: 3,
      text: 'TODO: check the cap',
    },
  ],
})

describe('todo migration', () => {
  it('a version 1 file gets the identifier of the item at the same path and line', () => {
    const moved = migrateDocument(document(1), [open])
    assert.equal(moved.version, 2)
    assert.equal(moved.tasks[0]?.id, 'todo-current')
  })

  it('a version 2 file stays as it is', () => {
    assert.deepEqual(migrateDocument(document(2), [open]), document(2))
  })
})

// --- Ports of TodoMigrationTest.kt ---

const ROOT = 'E:/repo'

const item = (
  id: string,
  line: number,
  text = 'TODO: drop this',
  kind: TaskKind = 'todo',
): TaskEntry & OpenTodo => ({
  id,
  kind,
  path: 'src/Main.kt',
  startLine: line,
  endLine: line,
  text,
  rootPath: ROOT,
})

const entryOf = ({ rootPath: _root, ...entry }: TaskEntry & OpenTodo): TaskEntry => entry

const fileOf = (version: number, tasks: readonly (TaskEntry & OpenTodo)[]): TaskDocument => ({
  version,
  repository: ROOT,
  commit: '44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900',
  generated: '2026-09-06T02:40:00Z',
  tasks: tasks.map(entryOf),
})

const current = todoId('', 'src/Main.kt', 'TODO: drop this', 0)

const openItems = [item(current, 12)]

describe('todo migration ports', () => {
  it('maps an older long identifier to the identifier of the item at that line', () => {
    const moved = migrateDocument(fileOf(1, [item(legacyTodoId('src/Main.kt', 12), 12)]), openItems)
    assert.equal(moved.version, TASKS_VERSION)
    assert.deepEqual(
      moved.tasks.map((task) => task.id),
      [current],
    )
  })

  it('maps an older handle to the handle of the item at that line', () => {
    const old = fileOf(1, [item(handleOf(legacyTodoId('src/Main.kt', 12)), 12)])
    assert.deepEqual(
      migrateDocument(old, openItems).tasks.map((task) => task.id),
      [handleOf(current)],
    )
  })

  it('keeps an entry when no todo item sits at the old place', () => {
    const old = fileOf(1, [item(legacyTodoId('src/Main.kt', 30), 30)])
    assert.deepEqual(migrateDocument(old, openItems).tasks, old.tasks)
  })

  it('picks the item with the same text when two items share the old line', () => {
    const twin = todoId('', 'src/Main.kt', 'TODO: other', 0)
    const moved = migrateDocument(fileOf(1, [item(legacyTodoId('src/Main.kt', 12), 12)]), [
      item(twin, 12, 'TODO: other'),
      item(current, 12),
    ])
    assert.deepEqual(
      moved.tasks.map((task) => task.id),
      [current],
    )
  })

  it('keeps a comment and an item of another repository', () => {
    const old = fileOf(1, [
      item('c3f9a12aabbccddeeff00112233445566778899a', 12, 'TODO: drop this', 'comment'),
      item(legacyTodoId('src/Main.kt', 12), 12),
    ])
    assert.deepEqual(
      migrateDocument(old, [{ ...item(current, 12), rootPath: 'E:/other' }]).tasks,
      old.tasks,
    )
  })

  it('a second run changes nothing', () => {
    const once = migrateDocument(fileOf(1, [item(legacyTodoId('src/Main.kt', 12), 12)]), openItems)
    assert.equal(migrateDocument(once, [item(`todo-${'a'.repeat(40)}-0`, 12)]), once)
  })
})
