import * as vscode from 'vscode'

import type { Log } from '../log'
import { readTaskSettings } from '../settings'
import type { Anchor } from '../store/reviewService'
import type { ReviewTask } from '../tasks/reviewTask'
import { LOADING_TEXT, emptyText, isLoading } from '../tasks/scanRuns'
import type { TabState, TabStates } from '../tasks/tabState'
import { TaskChecks, checkKey } from '../tasks/taskChecks'
import { type ToolbarFacts, toolbarFacts } from '../tasks/taskChoice'
import {
  countOf,
  fileCount,
  fileTitle,
  folderCount,
  folderTitle,
  taskState,
  taskTitle,
  tooltipLines,
  tooltipPlace,
} from '../tasks/taskLabels'
import { rowsOf } from '../tasks/taskTree'
import {
  type DerivedView,
  type Row,
  type ViewKey,
  childRows,
  deriveView,
  finishedText,
  pathKey,
  rowsOfLayout,
  viewDescription,
  viewIdOf,
} from '../tasks/viewRows'
import type { ModelSnapshot, TaskModel } from './taskModel'

const SOME_CHECKED = 'A part of the tasks of this row is checked.'

const folderName = (task: ReviewTask): string =>
  vscode.workspace.getWorkspaceFolder(vscode.Uri.file(task.filePath))?.name ?? ''

/** Note text renders with no command links and no HTML. */
const tooltipOf = (task: ReviewTask): vscode.MarkdownString => {
  const markdown = Object.assign(new vscode.MarkdownString(), {
    isTrusted: false,
    supportHtml: false,
  })
  markdown.appendText(tooltipPlace(task))
  tooltipLines(task.text).forEach((line) => {
    markdown.appendMarkdown('\n\n')
    markdown.appendText(line)
  })
  return markdown
}

const scopeFiles = async (glob: string): Promise<ReadonlySet<string>> =>
  new Set((await vscode.workspace.findFiles(glob, null)).map((uri) => pathKey(uri.fsPath)))

const iconOf = (task: ReviewTask): vscode.ThemeIcon => {
  if (task.kind === 'todo') return new vscode.ThemeIcon('checklist')
  return new vscode.ThemeIcon(task.resolved ? 'pass' : 'comment')
}

/** One tree view of the activity bar container. Its rows come from the shared scan and its tab state. */
export class TaskView implements vscode.TreeDataProvider<Row>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Row | undefined>()

  readonly onDidChangeTreeData = this.emitter.event

  readonly checks = new TaskChecks()

  readonly view: vscode.TreeView<Row>

  private derived: DerivedView = { layout: { folders: [], files: [] }, tasks: [] }

  private readonly parents = new Map<string, Row>()

  private readonly taskRows = new Map<string, Row>()

  private readonly disposables: vscode.Disposable[] = []

  private current: Anchor | undefined

  private ticket = 0

  private loading = false

  constructor(
    readonly key: ViewKey,
    private readonly model: TaskModel,
    private readonly tabs: TabStates,
    private readonly log: Log,
  ) {
    this.view = vscode.window.createTreeView(viewIdOf(key), {
      treeDataProvider: this,
      canSelectMany: true,
      showCollapseAll: true,
      manageCheckboxStateManually: true,
    })
    this.disposables.push(
      this.view,
      this.emitter,
      this.view.onDidChangeCheckboxState((event) => {
        event.items.forEach(([row, state]) =>
          this.checks.set(row.tasks, state === vscode.TreeItemCheckboxState.Checked),
        )
        this.redraw()
      }),
      model.onDidChange(() => this.update()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('yreview.todoFilters')) this.update()
      }),
      ...(key === 'currentFile'
        ? [vscode.window.onDidChangeActiveTextEditor(() => this.update())]
        : []),
    )
    this.update()
  }

  tab(): TabState {
    return this.tabs.get(viewIdOf(this.key))
  }

  async changeTab(change: Partial<TabState>): Promise<void> {
    await this.tabs.set(viewIdOf(this.key), change)
    await this.derive()
  }

  rows(): DerivedView {
    return this.derived
  }

  topRows(): readonly Row[] {
    return rowsOfLayout(this.key, this.derived.layout)
  }

  rowOf(task: ReviewTask): Row | undefined {
    return this.taskRows.get(checkKey(task))
  }

  selectedTasks(): readonly ReviewTask[] {
    return [
      ...new Map(
        this.view.selection
          .flatMap((row) => row.tasks)
          .map((task) => [checkKey(task), task] as const),
      ).values(),
    ]
  }

  facts(selected: readonly ReviewTask[] = this.selectedTasks()): ToolbarFacts {
    return toolbarFacts(
      this.derived.tasks,
      selected,
      this.checks.checkedOf(this.derived.tasks),
      this.checks.size,
    )
  }

  setChecked(row: Row, value: boolean): void {
    this.checks.set(row.tasks, value)
    this.redraw()
  }

  redraw(): void {
    this.emitter.fire(undefined)
    this.setContext()
  }

  getTreeItem(row: Row): vscode.TreeItem {
    const state = this.checks.state(row.tasks)
    const checkboxState = {
      state:
        state === 'all'
          ? vscode.TreeItemCheckboxState.Checked
          : vscode.TreeItemCheckboxState.Unchecked,
      tooltip: state === 'some' ? SOME_CHECKED : undefined,
    }
    const checked = state === 'some' ? `, ${this.checks.checkedOf(row.tasks).length} checked` : ''
    if (row.kind === 'task') {
      return Object.assign(
        new vscode.TreeItem(taskTitle(row.task), vscode.TreeItemCollapsibleState.None),
        {
          id: row.id,
          description: taskState(row.task),
          tooltip: tooltipOf(row.task),
          iconPath: iconOf(row.task),
          contextValue: `yreview.task.${row.task.kind}`,
          checkboxState,
          command: { command: 'yreview.tasks.open', title: 'Open Review Task', arguments: [row] },
        },
      )
    }
    if (row.kind === 'file') {
      return Object.assign(
        new vscode.TreeItem(fileTitle(row.group), vscode.TreeItemCollapsibleState.Expanded),
        {
          id: row.id,
          description: `${fileCount(row.group)}${checked}`,
          resourceUri: vscode.Uri.file(row.tasks[0]?.filePath ?? ''),
          iconPath: vscode.ThemeIcon.File,
          contextValue: 'yreview.file',
          checkboxState,
        },
      )
    }
    return Object.assign(
      new vscode.TreeItem(folderTitle(row.folder), vscode.TreeItemCollapsibleState.Expanded),
      {
        id: row.id,
        description: `${folderCount(row.folder)}${checked}`,
        iconPath:
          row.folder.kind === 'folder'
            ? new vscode.ThemeIcon('root-folder')
            : vscode.ThemeIcon.Folder,
        contextValue: 'yreview.folder',
        checkboxState,
      },
    )
  }

  // The provider API takes a mutable array, so the rows go out as a copy.
  getChildren(row?: Row): Row[] {
    return [...(row === undefined ? this.topRows() : childRows(row))]
  }

  getParent(row: Row): Row | undefined {
    return this.parents.get(row.id)
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  private update(): void {
    this.derive().catch((error: unknown) =>
      this.log.error('The task view did not draw its rows.', error),
    )
  }

  /** Each derive takes a ticket, so an older derive that answers late draws nothing. */
  private async derive(): Promise<void> {
    this.ticket += 1
    const { ticket } = this
    const snapshot = this.model.snapshot()
    const tab = this.tab()
    const scope = tab.scopeGlob === '' ? undefined : await scopeFiles(tab.scopeGlob)
    const anchor = this.key === 'currentFile' ? await this.activeAnchor() : undefined
    if (ticket !== this.ticket) return
    this.current = anchor
    this.derived = deriveView({
      repositories: snapshot.repositories,
      tab,
      filters: readTaskSettings().todoFilters,
      folderOf: folderName,
      changed: this.key === 'changes' ? snapshot.changes.files : undefined,
      keep: (task) =>
        (scope === undefined || scope.has(pathKey(task.filePath))) &&
        (this.key !== 'currentFile' ||
          (anchor !== undefined && task.rootPath === anchor.root && task.path === anchor.path)),
    })
    this.parents.clear()
    this.taskRows.clear()
    this.walk(undefined, this.topRows())
    this.emitter.fire(undefined)
    this.decorate(snapshot)
  }

  private async activeAnchor(): Promise<Anchor | undefined> {
    const editor = vscode.window.activeTextEditor
    return editor === undefined ? undefined : this.model.anchorOf(editor.document.uri)
  }

  private walk(parent: Row | undefined, rows: readonly Row[]): void {
    rows.forEach((row) => {
      if (parent !== undefined) this.parents.set(row.id, parent)
      if (row.kind === 'task') this.taskRows.set(checkKey(row.task), row)
      this.walk(row, childRows(row))
    })
  }

  private decorate(snapshot: ModelSnapshot): void {
    const rows = rowsOf(this.derived.layout)
    const count = this.derived.tasks.length
    this.view.message =
      rows === 0
        ? emptyText(
            snapshot.phase,
            finishedText(this.key, snapshot.changes, this.current !== undefined),
          )
        : undefined
    this.view.description = viewDescription(this.tab())
    if (this.key === 'project') {
      this.view.badge =
        count === 0 ? undefined : { value: count, tooltip: countOf(count, 'review task') }
    }
    this.setContext()
    if (this.loading || !isLoading(snapshot.phase, rows)) return
    this.loading = true
    vscode.window
      .withProgress({ location: { viewId: viewIdOf(this.key) }, title: LOADING_TEXT }, () =>
        this.model.settled(),
      )
      .then(
        () => {
          this.loading = false
        },
        () => {
          this.loading = false
        },
      )
  }

  private setContext(): void {
    const prefix = `yreview.${this.key}`
    vscode.commands.executeCommand('setContext', `${prefix}.resolvedShown`, this.tab().showResolved)
    vscode.commands.executeCommand('setContext', `${prefix}.anyTask`, this.derived.tasks.length > 0)
    vscode.commands.executeCommand('setContext', `${prefix}.anyCheck`, this.checks.size > 0)
  }
}
