import * as vscode from 'vscode'

import { guard } from '../guard'
import type { Log } from '../log'
import { readTaskSettings } from '../settings'
import { checkKey } from '../tasks/taskChecks'
import { nextIndex, previousIndex } from '../tasks/taskChoice'
import {
  GLOB_PROMPT,
  type MenuItem,
  commandOf,
  filterItems,
  groupItems,
  pickLabel,
} from '../tasks/viewMenus'
import { VIEW_KEYS, viewDescription } from '../tasks/viewRows'
import type { TaskView } from './taskView'
import type { TaskViews } from './taskViews'

type Pick = vscode.QuickPickItem & { readonly item?: MenuItem }

const toPick = (item: MenuItem): Pick =>
  item.separator === true
    ? { label: item.label, kind: vscode.QuickPickItemKind.Separator }
    : { label: pickLabel(item), description: item.description, item }

/** Applies one menu choice. The glob choice asks for the pattern first. */
export const applyItem = async (view: TaskView, item: MenuItem): Promise<void> => {
  if (item.askGlob !== true) {
    await view.changeTab(item.change ?? {})
    return
  }
  const glob = await vscode.window.showInputBox({
    title: 'Glob Pattern of the View',
    prompt: GLOB_PROMPT,
    value: view.tab().scopeGlob,
  })
  if (glob !== undefined) await view.changeTab({ scopeGlob: glob.trim() })
}

const pickFrom = async (
  view: TaskView,
  title: string,
  items: readonly MenuItem[],
): Promise<void> => {
  const chosen = await vscode.window.showQuickPick(items.map(toPick), {
    title,
    placeHolder: viewDescription(view.tab()),
  })
  if (chosen?.item !== undefined) await applyItem(view, chosen.item)
}

/** Selects the next or the previous task row and opens it, as the occurrence buttons of IntelliJ do. */
export const step = async (views: TaskViews, view: TaskView, forward: boolean): Promise<void> => {
  const { tasks } = view.rows()
  const [first] = view.selectedTasks()
  const current =
    first === undefined ? -1 : tasks.findIndex((task) => checkKey(task) === checkKey(first))
  const task =
    tasks[forward ? nextIndex(tasks.length, current) : previousIndex(tasks.length, current)]
  const row = task === undefined ? undefined : view.rowOf(task)
  if (task === undefined || row === undefined) return
  await view.view.reveal(row, { select: true, focus: true })
  await views.open(task)
}

export const registerViewCommands = (views: TaskViews, log: Log): vscode.Disposable[] =>
  VIEW_KEYS.flatMap((key) => {
    const view = views.view(key)
    const register = (
      action: string,
      title: string,
      handler: () => Promise<void>,
    ): vscode.Disposable =>
      vscode.commands.registerCommand(commandOf(key, action), guard(log, title, handler))
    const setAll = (change: () => void) => (): Promise<void> => {
      change()
      view.redraw()
      return Promise.resolve()
    }
    return [
      register('filter', 'Filter', () =>
        pickFrom(
          view,
          'Filter the Review Tasks',
          filterItems(view.tab(), readTaskSettings().todoFilters),
        ),
      ),
      register('showResolved', 'Show Resolved Comments', () =>
        view.changeTab({ showResolved: true }),
      ),
      register('hideResolved', 'Hide Resolved Comments', () =>
        view.changeTab({ showResolved: false }),
      ),
      register('groupBy', 'Group By', () =>
        pickFrom(view, 'Group the Review Tasks', groupItems(view.tab())),
      ),
      register('previous', 'Previous Task', () => step(views, view, false)),
      register('next', 'Next Task', () => step(views, view, true)),
      register(
        'checkAll',
        'Check All',
        setAll(() => view.checks.set(view.rows().tasks, true)),
      ),
      register(
        'clearChecks',
        'Clear Checks',
        setAll(() => view.checks.clear()),
      ),
    ]
  })
