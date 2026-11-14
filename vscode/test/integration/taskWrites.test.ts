import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import type { ReviewComments } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'
import type { ReviewTask } from '../../src/tasks/reviewTask'
import type { Row } from '../../src/tasks/viewRows'
import type { TaskView } from '../../src/views/taskView'
import type { TaskViews } from '../../src/views/taskViews'
import type { TaskWrites } from '../../src/views/taskWrites'
import { focusWindow, until } from './window'

const LOCAL = 'refs/notes/y-review/local'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const taskViews = async (): Promise<TaskViews> =>
  (await api()).tasks ?? assert.fail('the task views are off')
const taskWrites = async (): Promise<TaskWrites> =>
  (await api()).writes ?? assert.fail('the task writes are off')
const reviewComments = async (): Promise<ReviewComments> =>
  (await api()).comments ?? assert.fail('the comment features are off')

/** The note of HEAD, or an empty text when HEAD has no note. */
const noteOfHead = (): string =>
  spawnSync('git', ['notes', '--ref', LOCAL, 'show', 'HEAD'], {
    cwd: workspace(),
    encoding: 'utf8',
  }).stdout

const fileOf = (name: string): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', name))
const documentOf = (name: string): Thenable<vscode.TextDocument> =>
  vscode.workspace.openTextDocument(fileOf(name))
const lines = (document: vscode.TextDocument): readonly string[] =>
  document.getText().split(/\r?\n/)
const yes = (): Promise<boolean> => Promise.resolve(true)

describe('task writes', function taskWriteCases() {
  this.timeout(120_000)

  const project = async (): Promise<TaskView> => {
    const tasks = await taskViews()
    await tasks.model.refresh()
    const view = tasks.view('project')
    view.checks.clear()
    view.redraw()
    return view
  }

  const taskOf = async (view: TaskView, text: string): Promise<ReviewTask> => {
    assert.ok(await until(() => view.rows().tasks.some((task) => task.text === text)), text)
    return view.rows().tasks.find((task) => task.text === text) ?? assert.fail(`no task ${text}`)
  }

  const rowOf = async (view: TaskView, text: string): Promise<Row> =>
    view.rowOf(await taskOf(view, text)) ?? assert.fail(`no row ${text}`)

  /** Reverts the file and scans again, so the next case sees the disk. */
  const revert = async (name: string): Promise<void> => {
    await vscode.window.showTextDocument(await documentOf(name))
    await vscode.commands.executeCommand('workbench.action.files.revert')
    await (await taskViews()).model.refresh()
  }

  /** Saves a local comment on line 3 of src/a.txt and gives its task. */
  const saveComment = async (view: TaskView, text: string): Promise<ReviewTask> => {
    const controller = vscode.comments.createCommentController('yreview-writes', 'Writes')
    try {
      await vscode.window.showTextDocument(await documentOf('todo.ts'))
      await vscode.commands.executeCommand('yreview.saveLocal', {
        thread: controller.createCommentThread(fileOf('a.txt'), new vscode.Range(2, 0, 2, 0), []),
        text,
      })
    } finally {
      controller.dispose()
    }
    await (await taskViews()).model.refresh()
    return taskOf(view, text)
  }

  const dropNotes = async (): Promise<void> => {
    spawnSync('git', ['notes', '--ref', LOCAL, 'remove', '--ignore-missing', 'HEAD'], {
      cwd: workspace(),
    })
    await (await reviewComments()).reload(fileOf('a.txt'))
    await (await taskViews()).model.refresh()
  }

  after(() => {
    assert.equal(git('status', '--porcelain'), '')
  })

  it('a TODO delete takes the line, leaves the file unsaved, and an undo puts it back', async () => {
    const view = await project()
    try {
      await (await taskWrites()).remove('project', [await rowOf(view, 'TODO: first task')], yes)
      const document = await documentOf('todo.ts')
      assert.ok(!lines(document).includes('// TODO: first task'))
      assert.equal(document.isDirty, true)
      assert.equal(git('status', '--porcelain'), '')
      await vscode.window.showTextDocument(document)
      await focusWindow()
      await vscode.commands.executeCommand('undo')
      assert.ok(await until(() => lines(document).includes('// TODO: first task')))
    } finally {
      await revert('todo.ts')
    }
  })

  it('a TODO after code keeps the code', async () => {
    const view = await project()
    try {
      await (await taskWrites()).remove('project', [await rowOf(view, 'FIXME: second task')], yes)
      assert.equal(lines(await documentOf('todo.ts'))[1], 'export const value = 1')
    } finally {
      await revert('todo.ts')
    }
  })

  it('a TODO with no comment around it stays, and the file stays clean', async () => {
    const plain = fileOf('plain.ts').fsPath
    try {
      writeFileSync(plain, 'call(TODO)\n')
      const view = await project()
      const row = await rowOf(view, 'TODO)')
      await (await taskWrites()).remove('project', [row], yes)
      const document = await documentOf('plain.ts')
      assert.equal(document.getText(), 'call(TODO)\n')
      assert.equal(document.isDirty, false)
    } finally {
      rmSync(plain, { force: true })
      await (await taskViews()).model.refresh()
    }
  })

  it('a checked comment resolves', async () => {
    const view = await project()
    const text = 'Resolve me.'
    try {
      const task = await saveComment(view, text)
      view.setChecked(view.rowOf(task) ?? assert.fail('no row'), true)
      await (await taskWrites()).resolve('project')
      assert.ok(noteOfHead().includes('"resolved":true'))
      await (await taskViews()).model.refresh()
      assert.ok(await until(() => !view.rows().tasks.some((entry) => entry.text === text)))
    } finally {
      view.checks.clear()
      view.redraw()
      await dropNotes()
    }
  })

  it('a No keeps the comment, and a Yes deletes it', async () => {
    const view = await project()
    const text = 'Delete me.'
    try {
      const task = await saveComment(view, text)
      const row = view.rowOf(task) ?? assert.fail('no row')
      const writes = await taskWrites()
      await writes.remove('project', [row], () => Promise.resolve(false))
      assert.ok(noteOfHead().includes(text))
      await writes.remove('project', [row], yes)
      assert.ok(!noteOfHead().includes(text))
    } finally {
      await dropNotes()
    }
  })

  it('no chosen row asks nothing', async () => {
    const view = await project()
    await vscode.commands.executeCommand('yreview.project.focus')
    await vscode.commands.executeCommand('list.clear')
    assert.ok(await until(() => view.view.selection.length === 0))
    const asked: string[] = []
    await (
      await taskWrites()
    ).remove('project', undefined, (question) => {
      asked.push(question)
      return Promise.resolve(true)
    })
    assert.deepEqual(asked, [])
  })

  it('the views give the open TODO items and the chosen tasks', async () => {
    const view = await project()
    const tasks = await taskViews()
    try {
      const todos = await tasks.openTodos()
      assert.deepEqual(todos.map((task) => task.text).sort(), [
        'FIXME: second task',
        'TODO: first task',
      ])
      assert.ok(todos.every((task) => task.kind === 'todo' && task.path === 'src/todo.ts'))
      await vscode.commands.executeCommand('yreview.project.focus')
      const first = await taskOf(view, 'TODO: first task')
      view.setChecked(view.rowOf(first) ?? assert.fail('no row'), true)
      assert.deepEqual(
        tasks.chosenTasks().map((task) => task.text),
        ['TODO: first task'],
      )
      view.checks.clear()
      view.redraw()
      await view.view.reveal(await rowOf(view, 'FIXME: second task'), { select: true })
      assert.ok(
        await until(() =>
          view.view.selection.some((row) => row.tasks[0]?.text === 'FIXME: second task'),
        ),
      )
      assert.deepEqual(
        tasks.chosenTasks().map((task) => task.text),
        ['FIXME: second task'],
      )
    } finally {
      view.checks.clear()
      view.redraw()
      await vscode.commands.executeCommand('yreview.project.focus')
      await vscode.commands.executeCommand('list.clear')
    }
  })
})
