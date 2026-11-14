import assert from 'node:assert/strict'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'
import { filterItems, groupItems } from '../../src/tasks/viewMenus'
import { applyItem } from '../../src/views/viewCommands'
import type { TaskView } from '../../src/views/taskView'
import type { TaskViews } from '../../src/views/taskViews'

const taskViews = async (): Promise<TaskViews> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).tasks ?? assert.fail('the task views are off')

const until = async (check: () => boolean, left = 50): Promise<void> => {
  if (check()) return
  if (left === 0) assert.fail('The condition did not come true in 10 seconds.')
  await wait(200)
  await until(check, left - 1)
}

const itemAt = <T>(items: readonly T[], index: number): T =>
  items[index] ?? assert.fail(`no menu item ${index}`)

describe('view commands', function commands() {
  this.timeout(120_000)

  const project = async (): Promise<TaskView> => {
    const tasks = await taskViews()
    await tasks.model.refresh()
    const view = tasks.view('project')
    await until(() => view.rows().tasks.length > 0)
    return view
  }

  it('the resolved switch flips with two commands', async () => {
    const view = await project()
    await vscode.commands.executeCommand('yreview.project.showResolved')
    assert.equal(view.tab().showResolved, true)
    await vscode.commands.executeCommand('yreview.project.hideResolved')
    assert.equal(view.tab().showResolved, false)
  })

  it('Check All checks every row, and Clear Checks clears them', async () => {
    const view = await project()
    await vscode.commands.executeCommand('yreview.project.checkAll')
    assert.equal(view.checks.size, view.rows().tasks.length)
    await vscode.commands.executeCommand('yreview.project.clearChecks')
    assert.equal(view.checks.size, 0)
  })

  it('Next Task selects the first row and opens it', async () => {
    const view = await project()
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    const first = view.rows().tasks[0] ?? assert.fail('no task')
    const row = view.rowOf(first) ?? assert.fail('no row')
    await vscode.commands.executeCommand('yreview.project.focus')
    await vscode.commands.executeCommand('list.clear')
    await until(() => view.view.selection.length === 0)
    await vscode.commands.executeCommand('yreview.project.next')
    await until(() => view.view.selection[0]?.id === row.id)
    await until(
      () =>
        path.normalize(vscode.window.activeTextEditor?.document.uri.fsPath ?? '').toLowerCase() ===
        path.normalize(first.filePath).toLowerCase(),
    )
  })

  it('a group choice puts directory rows above the files', async () => {
    const view = await project()
    try {
      await applyItem(view, itemAt(groupItems(view.tab()), 1))
      assert.equal(view.topRows()[0]?.kind, 'folder')
      await applyItem(view, itemAt(groupItems(view.tab()), 1))
      assert.equal(view.tab().byDirectory, false)
    } finally {
      await view.changeTab({ byDirectory: false })
    }
  })

  it('a kind choice keeps the TODO items only', async () => {
    const view = await project()
    try {
      await applyItem(view, itemAt(filterItems(view.tab(), []), 2))
      assert.ok(view.rows().tasks.length > 0)
      assert.ok(view.rows().tasks.every((task) => task.kind === 'todo'))
    } finally {
      await applyItem(view, itemAt(filterItems(view.tab(), []), 0))
    }
    assert.equal(view.tab().kindFilter, 'both')
  })

  it('a glob scope keeps the files that match', async () => {
    const view = await project()
    try {
      await view.changeTab({ scopeGlob: 'src/todo.ts' })
      assert.ok(view.rows().tasks.length > 0)
      assert.ok(view.rows().tasks.every((task) => task.path === 'src/todo.ts'))
    } finally {
      await view.changeTab({ scopeGlob: '' })
    }
  })
})
