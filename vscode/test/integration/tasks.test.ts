import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'
import type { ReviewTask } from '../../src/tasks/reviewTask'
import { NO_TASK, type Row } from '../../src/tasks/viewRows'
import type { TaskViews } from '../../src/views/taskViews'

import { gitRepository, removeRepository, until as eventually } from './window'

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
const reviewComments = async (): Promise<ReviewComments> =>
  (await api()).comments ?? assert.fail('the comment features are off')

const until = async (check: () => boolean | Promise<boolean>, left = 50): Promise<void> => {
  if (await check()) return
  if (left === 0) assert.fail('The condition did not come true in 10 seconds.')
  await wait(200)
  await until(check, left - 1)
}

const fileOf = (name: string): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', name))
const open = async (name: string): Promise<vscode.TextEditor> =>
  vscode.window.showTextDocument(await vscode.workspace.openTextDocument(fileOf(name)))
const todoTexts = (tasks: readonly ReviewTask[]): readonly string[] =>
  tasks.filter((task) => task.kind === 'todo').map((task) => task.text)

describe('task views', function views() {
  this.timeout(120_000)

  after(() => {
    assert.equal(git('status', '--porcelain'), '')
  })

  it('contributes the view container and its three views', async () => {
    await taskViews()
    const commands = await vscode.commands.getCommands(true)
    ;[
      'workbench.view.extension.yreview',
      'yreview.project.focus',
      'yreview.currentFile.focus',
      'yreview.changes.focus',
    ].forEach((command) => assert.ok(commands.includes(command), command))
  })

  it('the Project view lists the TODO items and the badge counts the rows', async () => {
    const tasks = await taskViews()
    await tasks.model.refresh()
    const project = tasks.view('project')
    await until(() => todoTexts(project.rows().tasks).length === 2)
    assert.deepEqual([...todoTexts(project.rows().tasks)].sort(), [
      'FIXME: second task',
      'TODO: first task',
    ])
    assert.equal(project.view.badge?.value, project.rows().tasks.length)
  })

  it('a repository that the git extension opens outside the workspace folder shows only its open file', async function lateRepository() {
    const tasks = await taskViews()
    await tasks.model.refresh()
    const project = tasks.view('project')
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'yreview-late-')))
    const late = (...args: string[]): string =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
    writeFileSync(path.join(dir, 'late.ts'), '// TODO: late task\n')
    writeFileSync(path.join(dir, 'closed.ts'), '// TODO: closed file task\n')
    late('init', '-q', '-b', 'main')
    late('config', 'commit.gpgsign', 'false')
    late('add', '.')
    late('commit', '-q', '-m', 'init')
    const texts = (): readonly string[] => todoTexts(project.rows().tasks)
    const outside = (): readonly ReviewTask[] =>
      project.rows().tasks.filter((task) => task.outside === true)
    try {
      await vscode.commands.executeCommand('git.openRepository', dir)
      // The git extension of VS Code 1.101 does not open a repository outside the workspace.
      if (!(await eventually(() => gitRepository(dir) !== undefined))) this.skip()
      await tasks.model.refresh()
      const root = dir.replaceAll('\\', '/').toLowerCase()
      assert.ok(tasks.model.roots().every((each) => each.toLowerCase() !== root))
      assert.ok(!texts().includes('TODO: late task'))
      await vscode.window.showTextDocument(vscode.Uri.file(path.join(dir, 'late.ts')))
      await until(() => outside().some((task) => task.text === 'TODO: late task'))
      assert.ok(!texts().includes('TODO: closed file task'))
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      await until(() => !texts().includes('TODO: late task'))
    } finally {
      await removeRepository(dir)
    }
  })

  it('a click on a comment row opens the file and expands the thread', async () => {
    const tasks = await taskViews()
    const comments = await reviewComments()
    const project = tasks.view('project')
    const text = 'Open me. <b>x</b>'
    const controller = vscode.comments.createCommentController('yreview-tasks', 'Tasks')
    try {
      await open('todo.ts')
      await vscode.commands.executeCommand('yreview.saveLocal', {
        thread: controller.createCommentThread(fileOf('a.txt'), new vscode.Range(1, 0, 1, 0), []),
        text,
      })
      await tasks.model.refresh()
      await until(() => project.rows().tasks.some((task) => task.text === text))
      const task =
        project.rows().tasks.find((entry) => entry.text === text) ?? assert.fail('no task')
      const row: Row = project.rowOf(task) ?? assert.fail('no row')
      const thread = (): vscode.CommentThread =>
        comments.snapshot(fileOf('a.txt')).find((shown) => shown.stored.id === task.id)?.thread ??
        assert.fail('no thread')
      thread().collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed
      await vscode.commands.executeCommand('yreview.tasks.open', row)
      assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, fileOf('a.txt').fsPath)
      assert.equal(thread().collapsibleState, vscode.CommentThreadCollapsibleState.Expanded)
      const tooltip = project.getTreeItem(row).tooltip as vscode.MarkdownString
      assert.ok(tooltip instanceof vscode.MarkdownString)
      assert.equal(tooltip.isTrusted, false)
      assert.equal(tooltip.supportHtml, false)
    } finally {
      controller.dispose()
      git('notes', '--ref', 'refs/notes/y-review/local', 'remove', 'HEAD')
      await comments.reload(fileOf('a.txt'))
      await tasks.model.refresh()
    }
  })

  it('a comment of a removed file names the file removed and opens it at the comment commit', async () => {
    const tasks = await taskViews()
    const project = tasks.view('project')
    const text = 'On a file that goes.'
    const controller = vscode.comments.createCommentController('yreview-removed', 'Removed')
    writeFileSync(fileOf('gone.txt').fsPath, 'one\ntwo\n')
    git('add', 'src/gone.txt')
    git('commit', '-q', '-m', 'add gone')
    const old = git('rev-parse', 'HEAD').trim()
    try {
      await vscode.window.showTextDocument(
        await vscode.workspace.openTextDocument(fileOf('gone.txt')),
      )
      await vscode.commands.executeCommand('yreview.saveLocal', {
        thread: controller.createCommentThread(
          fileOf('gone.txt'),
          new vscode.Range(1, 0, 1, 0),
          [],
        ),
        text,
      })
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      git('rm', '-q', 'src/gone.txt')
      git('commit', '-q', '-m', 'remove gone')
      await tasks.model.refresh()
      const find = (): ReviewTask | undefined =>
        project.rows().tasks.find((entry) => entry.text === text)
      await until(() => find()?.carry?.kind === 'removed')
      await tasks.open(find() ?? assert.fail('no task'))
      const uri = vscode.window.activeTextEditor?.document.uri
      assert.equal(uri?.scheme, 'git')
      assert.ok(uri?.query.includes(old), uri?.query)
    } finally {
      controller.dispose()
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      git('notes', '--ref', 'refs/notes/y-review/local', 'remove', '--ignore-missing', old)
      git('reset', '-q', '--hard', `${old}~1`)
      await tasks.model.refresh()
    }
  })

  it('the check box of a file row checks every task, and the checks outlive a refresh', async () => {
    const tasks = await taskViews()
    const project = tasks.view('project')
    const fileRow = (): Row =>
      project.topRows().find((row) => row.kind === 'file' && row.group.path === 'src/todo.ts') ??
      assert.fail('no file row')
    try {
      project.setChecked(fileRow(), true)
      assert.equal(project.checks.state(fileRow().tasks), 'all')
      await tasks.model.refresh()
      await until(() => project.checks.state(fileRow().tasks) === 'all')
      const item = project.getTreeItem(fileRow())
      assert.deepEqual(
        (item.checkboxState as { readonly state: vscode.TreeItemCheckboxState }).state,
        vscode.TreeItemCheckboxState.Checked,
      )
    } finally {
      project.checks.clear()
      project.redraw()
    }
  })

  it('the Current File view follows the active editor', async () => {
    const tasks = await taskViews()
    const current = tasks.view('currentFile')
    await open('todo.ts')
    await until(
      () =>
        current.rows().tasks.length === 2 &&
        current.rows().tasks.every((task) => task.path === 'src/todo.ts'),
    )
    await open('a.txt')
    await until(() => current.rows().tasks.length === 0 && current.view.message === NO_TASK)
  })

  it('the Local Changes view lists the tasks of a changed file', async () => {
    const tasks = await taskViews()
    const changes = tasks.view('changes')
    // A file that no editor holds, so no late reload from the disk drops an edit of a later case.
    const changed = fileOf('changed.ts').fsPath
    try {
      writeFileSync(changed, '// TODO: third task\n')
      await tasks.model.refresh()
      await until(() =>
        changes
          .rows()
          .tasks.map((task) => `${task.path} ${task.text}`)
          .includes('src/changed.ts TODO: third task'),
      )
    } finally {
      rmSync(changed, { force: true })
      await tasks.model.refresh()
    }
    await until(
      () =>
        changes.rows().tasks.length === 0 &&
        changes.view.message === 'No file is in the local changes.',
    )
  })

  it('a dirty document shows its new TODO before a save', async () => {
    const tasks = await taskViews()
    const project = tasks.view('project')
    const editor = await open('todo.ts')
    try {
      assert.ok(
        await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), '// TODO: unsaved\n')),
        'the edit did not apply',
      )
      await until(() => todoTexts(project.rows().tasks).includes('TODO: unsaved'))
    } finally {
      await vscode.window.showTextDocument(editor.document)
      await vscode.commands.executeCommand('workbench.action.files.revert')
    }
    await until(() => !todoTexts(project.rows().tasks).includes('TODO: unsaved'))
  })

  it('a kind filter of one view leaves the other views alone', async () => {
    const tasks = await taskViews()
    const project = tasks.view('project')
    try {
      await project.changeTab({ kindFilter: 'comments' })
      assert.deepEqual(todoTexts(project.rows().tasks), [])
      assert.equal(tasks.view('changes').tab().kindFilter, 'both')
    } finally {
      await project.changeTab({ kindFilter: 'both' })
    }
  })
})
