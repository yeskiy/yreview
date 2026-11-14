import * as vscode from 'vscode'

import type { ReviewComments } from '../comments/controller'
import { containedPath } from '../core/paths'
import { guard } from '../guard'
import type { Log } from '../log'
import type { ReviewService } from '../store/reviewService'
import type { ReviewTask } from '../tasks/reviewTask'
import { TabStates } from '../tasks/tabState'
import { type Row, VIEW_KEYS, type ViewKey, viewIdOf } from '../tasks/viewRows'
import { TaskModel } from './taskModel'
import { TaskView } from './taskView'

export interface TaskViews extends vscode.Disposable {
  readonly model: TaskModel
  readonly tabs: TabStates
  view(key: ViewKey): TaskView
  open(task: ReviewTask): Promise<void>
}

const LEAVES_ROOT =
  'The path of this task leaves its repository, so the extension does not open it.'

/** Opens the file at the task in a preview editor, and expands the thread of an open comment. */
const openTask = async (task: ReviewTask, comments: ReviewComments): Promise<void> => {
  const file = await containedPath(task.rootPath, task.path)
  if (file === undefined) {
    await vscode.window.showWarningMessage(LEAVES_ROOT)
    return
  }
  const at = new vscode.Position(
    Math.max(task.startLine - 1, 0),
    Math.max(task.startColumn ?? 0, 0),
  )
  const editor = await vscode.window.showTextDocument(vscode.Uri.file(file), {
    selection: new vscode.Range(at, at),
    preserveFocus: true,
    preview: true,
  })
  editor.revealRange(
    new vscode.Range(at, at),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  )
  if (task.kind === 'comment' && !task.resolved) await comments.reveal(editor.document.uri, task.id)
}

export const createTaskViews = (
  service: ReviewService,
  comments: ReviewComments,
  gitPath: string,
  log: Log,
  state: vscode.Memento,
): TaskViews => {
  const model = new TaskModel(service, gitPath, log)
  const tabs = new TabStates(state)
  const views = new Map(VIEW_KEYS.map((key) => [key, new TaskView(key, model, tabs, log)] as const))
  const open = (task: ReviewTask): Promise<void> => openTask(task, comments)
  const disposables: vscode.Disposable[] = [
    model,
    ...views.values(),
    vscode.commands.registerCommand(
      'yreview.tasks.open',
      guard(log, 'Open Review Task', async (row?: Row) => {
        if (row?.kind === 'task') await open(row.task)
      }),
    ),
    vscode.commands.registerCommand(
      'yreview.tasks.refresh',
      guard(log, 'Refresh', () => model.refresh()),
    ),
  ]
  model
    .start()
    .catch((error: unknown) => log.error('The first scan of the review tasks failed.', error))
  return {
    model,
    tabs,
    open,
    view: (key) => {
      const found = views.get(key)
      if (found === undefined) throw new Error(`The extension has no task view ${key}.`)
      return found
    },
    dispose: () => disposables.forEach((disposable) => disposable.dispose()),
  }
}

/** Empty views that name the problem, for a machine without a usable git. */
export const placeholderViews = (problem: string): vscode.Disposable[] =>
  VIEW_KEYS.map((key) => {
    const view = vscode.window.createTreeView<vscode.TreeItem>(viewIdOf(key), {
      treeDataProvider: { getTreeItem: (item) => item, getChildren: () => [] },
    })
    view.message = problem
    return view
  })
