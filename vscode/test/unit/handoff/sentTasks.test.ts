import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { handleOf } from '../../../src/core/handles'
import {
  TASKS_VERSION,
  type TaskDocument,
  type TaskEntry,
  type TaskKind,
  decodeTaskDocument,
} from '../../../src/core/taskDocument'
import { legacyTodoId, todoId } from '../../../src/core/taskIds'
import { HandoffFiles, TASKS_NAME } from '../../../src/handoff/handoffFiles'
import { migrateTaskFile, sentHandles } from '../../../src/handoff/sentTasks'
import type { OpenTodo } from '../../../src/tasks/todoMigration'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const todo = todoId('', 'src/Main.kt', 'TODO: drop this', 0)
const legacy = legacyTodoId('src/Main.kt', 12)
const comment = 'c3f9a12aabbccddeeff00112233445566778899a'

const task = (id: string, kind: TaskKind): TaskEntry => ({
  id,
  kind,
  path: 'src/Main.kt',
  startLine: 12,
  endLine: 12,
  text: 'TODO: drop this',
})

const openTodo = (id: string): OpenTodo => ({ ...task(id, 'todo'), rootPath: 'E:/repo' })

const document = (tasks: readonly TaskEntry[], version = TASKS_VERSION): TaskDocument => ({
  version,
  repository: 'E:/repo',
  commit: '44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900',
  generated: '2026-09-06T02:40:00Z',
  tasks,
})

const quiet = { warn: (): void => undefined }

describe('sent tasks', () => {
  const dirs: string[] = []
  const folder = (): string => {
    const dir = scratchDir()
    dirs.push(dir)
    return path.join(dir, 'y-review')
  }
  const brokenFile = (): string => {
    const dir = folder()
    mkdirSync(dir, { recursive: true })
    const file = path.join(dir, TASKS_NAME)
    writeFileSync(file, 'not json at all')
    return file
  }

  afterEach(() => dirs.splice(0).forEach(removeDir))

  it('the file names every task of the last send', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document([task(handleOf(todo), 'todo'), task(handleOf(comment), 'comment')]))
    assert.deepEqual(
      await sentHandles(files.tasks),
      new Set([handleOf(todo), handleOf(legacy), handleOf(comment)]),
    )
  })

  it('a file of an older build answers the handle of a long identifier', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document([task(legacy, 'todo')]))
    assert.deepEqual(await sentHandles(files.tasks), new Set([handleOf(legacy)]))
  })

  it('the migration of an older file runs once and keeps the older handle', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document([task(handleOf(legacy), 'todo')], 1))
    await migrateTaskFile(files.tasks, [openTodo(todo)], quiet)
    const once = readFileSync(files.tasks, 'utf8')
    await migrateTaskFile(files.tasks, [openTodo(`todo-${'a'.repeat(40)}-0`)], quiet)

    assert.equal(decodeTaskDocument(once)?.version, TASKS_VERSION)
    assert.deepEqual(
      decodeTaskDocument(once)?.tasks.map((entry) => entry.id),
      [handleOf(todo)],
    )
    assert.equal(readFileSync(files.tasks, 'utf8'), once)
    assert.deepEqual(await sentHandles(files.tasks), new Set([handleOf(todo), handleOf(legacy)]))
  })

  it('the migration leaves a file that no parser accepts alone', async () => {
    const file = brokenFile()
    await migrateTaskFile(file, [], quiet)
    assert.equal(readFileSync(file, 'utf8'), 'not json at all')
  })

  it('a file that is not there answers nothing', async () => {
    assert.deepEqual(await sentHandles(path.join(folder(), TASKS_NAME)), new Set())
  })

  it('a file that no parser accepts answers nothing', async () => {
    assert.deepEqual(await sentHandles(brokenFile()), new Set())
  })

  it('a file over the cap answers nothing', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document([task(handleOf(todo), 'todo')]))
    assert.deepEqual(await sentHandles(files.tasks, 10), new Set())
  })
})
