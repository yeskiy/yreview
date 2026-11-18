import * as vscode from 'vscode'

import type { Log } from '../log'
import type { ReviewService } from '../store/reviewService'
import { projectCompletionHost } from '../tasks/completionHost'
import type { ReviewTask } from '../tasks/reviewTask'
import { OUTSIDE_TASKS, agentTasks } from '../tasks/taskChoice'
import { type CloseReport, MAX_CLOSE_IDS, TaskCompletion, problemOf } from '../tasks/taskCompletion'
import { countOf } from '../tasks/taskLabels'
import { collectPrompt } from './copyCollect'
import { DoneWatch } from './doneWatch'
import {
  type HandoffDeps,
  type HandoffStore,
  type WrittenHandoff,
  handoffStores,
  taskFileOf,
  windowPathOf,
  writeHandoff,
} from './handoffWriter'
import { sentHandlesOf } from './sentTasks'

export const NO_TASK = 'Check or select the review tasks to copy first.'

export interface HandoffApi {
  stores(): Promise<readonly HandoffStore[]>
  write(store: HandoffStore, tasks: readonly ReviewTask[]): Promise<WrittenHandoff | undefined>
  close(ids: readonly string[], limit?: number): Promise<CloseReport>
}

export interface RegisterDeps {
  readonly service: ReviewService
  readonly gitPath: string
  readonly log: Log
  /** The repository roots of the task model, after its first full scan. */
  readonly gitRoots: () => Promise<readonly string[]>
  readonly openTodos: () => Promise<readonly ReviewTask[]>
  readonly chosenTasks: () => readonly ReviewTask[]
}

/** A command argument counts as tasks only when each item has the fields of a task. */
export const isTaskList = (value: unknown): value is readonly ReviewTask[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item: Partial<ReviewTask>) =>
      typeof item.id === 'string' &&
      (item.kind === 'comment' || item.kind === 'todo') &&
      typeof item.path === 'string' &&
      typeof item.rootPath === 'string',
  )

const announce = (report: CloseReport): void => {
  const text = `An agent finished ${countOf(report.closed, 'task')}.`
  const problem = problemOf(report)
  if (problem === undefined) vscode.window.showInformationMessage(text)
  else vscode.window.showWarningMessage(`${text} ${problem}`)
}

export const registerHandoff = (
  context: vscode.ExtensionContext,
  deps: RegisterDeps,
): HandoffApi => {
  // The watch needs `close`, and `close` needs the writer, so the writer reaches the watch here.
  const holder: { watch?: DoneWatch } = {}
  const writer: HandoffDeps = {
    gitPath: deps.gitPath,
    windowPath: () =>
      windowPathOf(
        vscode.workspace.workspaceFile,
        (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      ),
    watch: (done) => holder.watch?.watch(done),
    log: deps.log,
    now: () => new Date(),
  }
  const stores = (): Promise<readonly HandoffStore[]> => handoffStores(deps.gitRoots, deps.service)
  const taskFiles = async (): Promise<readonly string[]> =>
    (await Promise.all((await stores()).map((store) => taskFileOf(writer, store)))).filter(
      (file): file is string => file !== undefined,
    )
  // A TODO whose line is gone closes only when this window handed it out (the sent tasks).
  const close = (ids: readonly string[], limit = MAX_CLOSE_IDS): Promise<CloseReport> =>
    new TaskCompletion(
      projectCompletionHost(
        deps.service,
        deps.gitPath,
        deps.gitRoots,
        deps.openTodos,
        async (open) => sentHandlesOf(await taskFiles(), open, deps.log),
      ),
    ).close(ids, limit)
  const watch = new DoneWatch(close, announce, deps.log)
  holder.watch = watch
  const write = (
    store: HandoffStore,
    tasks: readonly ReviewTask[],
  ): Promise<WrittenHandoff | undefined> => writeHandoff(writer, store, tasks)

  const copy = async (given?: unknown): Promise<void> => {
    const chosen = isTaskList(given) ? given : deps.chosenTasks()
    const tasks = agentTasks(chosen)
    if (tasks.length === 0) {
      vscode.window.showWarningMessage(chosen.length === 0 ? NO_TASK : OUTSIDE_TASKS)
      return
    }
    const outcome = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Copying the Review Tasks' },
      async () => collectPrompt(tasks, await stores(), write),
    )
    await vscode.env.clipboard.writeText(outcome.text)
    const head = `The clipboard holds ${countOf(outcome.tasks, 'task')} of ${countOf(outcome.folders, 'folder')}.`
    if (outcome.unwritten.length === 0) {
      vscode.window.showInformationMessage(head)
      return
    }
    vscode.window.showWarningMessage(
      `${head} The extension wrote no task file for ${outcome.unwritten.join(', ')}, so it closes no task of that folder by itself. The prompt asks the agent to answer instead.`,
    )
  }

  context.subscriptions.push(
    { dispose: () => watch.dispose() },
    vscode.commands.registerCommand('yreview.copyTasks', (given?: unknown) =>
      copy(given).catch((error: unknown) => {
        deps.log.error('The copy of the review tasks failed.', error)
        vscode.window.showErrorMessage(`The copy of the review tasks failed. ${String(error)}`)
      }),
    ),
  )
  return { stores, write, close }
}
