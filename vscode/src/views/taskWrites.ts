import * as vscode from 'vscode'

import { kotlinTrim } from '../core/kotlinText'
import { guard } from '../guard'
import type { Log } from '../log'
import type { ReviewService } from '../store/reviewService'
import type { ReviewTask } from '../tasks/reviewTask'
import { checkKey } from '../tasks/taskChecks'
import {
  type WriteTarget,
  deleteQuestion,
  hasComments,
  isEmptyTarget,
  todoNotice,
  writeTarget,
} from '../tasks/taskChoice'
import { NO_CAP, type TaskCompletion, closeSentence, problemOf } from '../tasks/taskCompletion'
import { countOf } from '../tasks/taskLabels'
import { deleteReport, removeComments } from '../tasks/taskRemoval'
import { commandOf } from '../tasks/viewMenus'
import { type Row, VIEW_KEYS, type ViewKey } from '../tasks/viewRows'
import type { TaskViews } from './taskViews'
import { deleteTodos } from './todoRemoval'

export interface TaskWrites {
  resolve(key: ViewKey, rows?: readonly Row[]): Promise<void>
  remove(
    key: ViewKey,
    rows?: readonly Row[],
    confirm?: (question: string) => Promise<boolean>,
  ): Promise<void>
}

const askDelete = async (question: string): Promise<boolean> =>
  (await vscode.window.showWarningMessage(question, { modal: true }, 'Delete')) === 'Delete'

/** A message that nothing waits for, so a test and a user can leave it open. */
const say = (text: string, warn: boolean): void => {
  if (warn) vscode.window.showWarningMessage(text)
  else vscode.window.showInformationMessage(text)
}

const tasksOf = (rows: readonly Row[]): readonly ReviewTask[] => [
  ...new Map(
    rows.flatMap((row) => row.tasks).map((task) => [checkKey(task), task] as const),
  ).values(),
]

export const createTaskWrites = (
  views: TaskViews,
  service: ReviewService,
  completion: TaskCompletion,
): TaskWrites => {
  /** A check box beats a chosen row. A write never falls back to the whole tree. */
  const targetOf = (key: ViewKey, rows?: readonly Row[]): WriteTarget => {
    const view = views.view(key)
    return writeTarget(
      view.checks.checkedOf(view.rows().tasks),
      rows === undefined ? view.selectedTasks() : tasksOf(rows),
    )
  }
  return {
    resolve: async (key, rows) => {
      const chosen = targetOf(key, rows)
      if (!hasComments(chosen)) {
        say('Check a review comment. A TODO lives in the source file and not in a note.', true)
        return
      }
      const report = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Resolving the review comments' },
        () =>
          completion.close(
            chosen.comments.map((task) => task.id),
            NO_CAP,
          ),
      )
      say(
        closeSentence(
          report,
          kotlinTrim(
            `The extension resolved ${countOf(report.closed, 'comment')}. ${todoNotice(chosen)}`,
          ),
        ),
        problemOf(report) !== undefined,
      )
      await views.model.refresh()
    },
    remove: async (key, rows, confirm = askDelete) => {
      const chosen = targetOf(key, rows)
      if (isEmptyTarget(chosen)) {
        say('Check a review comment or a TODO item first.', true)
        return
      }
      if (!(await confirm(deleteQuestion(chosen)))) return
      const comments =
        chosen.comments.length === 0
          ? undefined
          : await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting the review comments',
              },
              async () => {
                const folders = new Set(
                  (await service.folderStores(false)).map((entry) => entry.root),
                )
                return removeComments(chosen.comments, (root, ids) =>
                  service.remove(
                    { store: folders.has(root) ? 'folder' : 'git', root, head: '', path: '' },
                    ids,
                  ),
                )
              },
            )
      const todos = chosen.todos.length === 0 ? undefined : await deleteTodos(chosen.todos)
      const report = deleteReport(comments, todos)
      say(report.text, report.warn)
      await views.model.refresh()
    },
  }
}

const clicked = (row?: Row, rows?: readonly Row[]): readonly Row[] | undefined =>
  rows ?? (row === undefined ? undefined : [row])

/** The view title gives no argument, and the row menu gives the row and the selected rows. */
export const registerTaskWrites = (writes: TaskWrites, log: Log): vscode.Disposable[] =>
  VIEW_KEYS.flatMap((key) => [
    vscode.commands.registerCommand(
      commandOf(key, 'resolve'),
      guard(log, 'Resolve', (row?: Row, rows?: readonly Row[]) =>
        writes.resolve(key, clicked(row, rows)),
      ),
    ),
    vscode.commands.registerCommand(
      commandOf(key, 'delete'),
      guard(log, 'Delete', (row?: Row, rows?: readonly Row[]) =>
        writes.remove(key, clicked(row, rows)),
      ),
    ),
  ])
